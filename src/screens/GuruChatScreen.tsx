import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { ImageLightbox } from '../components/ImageLightbox';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import Clipboard from '@react-native-clipboard/clipboard';
import type { ChatStackParamList } from '../navigation/types';
import { ResponsiveContainer } from '../hooks/useResponsive';
import {
  chatWithGuruGroundedStreaming,
  type MedicalGroundingSource,
  getApiKeys,
} from '../services/aiService';
import { useAppStore } from '../store/useAppStore';
import {
  createGuruChatThread,
  deleteGuruChatThread,
  getChatHistory,
  getGuruChatThreadById,
  getLatestGuruChatThread,
  getOrCreateLatestGuruChatThread,
  listGuruChatThreads,
  renameGuruChatThread,
  saveChatMessage,
  type GuruChatThread,
} from '../db/queries/aiCache';
import { getSessionMemoryRow } from '../db/queries/guruChatMemory';
import { getDb } from '../db/database';
import { markTopicDiscussedInChat } from '../db/queries/topics';
import { getLocalLlmRamWarning, isLocalLlmAllowedOnThisDevice } from '../services/deviceMemory';
import {
  coerceGuruChatDefaultModel,
  guruChatPickerNameForCfModel,
  guruChatPickerNameForGeminiModel,
  guruChatPickerNameForGithubModel,
  guruChatPickerNameForGroqModel,
  guruChatPickerNameForOpenRouterSlug,
} from '../services/ai/guruChatModelPreference';
import { useLiveGuruChatModels } from '../hooks/useLiveGuruChatModels';
import { theme } from '../constants/theme';
import {
  listGeneratedStudyImagesForTopic,
  type GeneratedStudyImageRecord,
  type GeneratedStudyImageStyle,
} from '../db/queries/generatedStudyImages';
import { buildChatImageContextKey, generateStudyImage } from '../services/studyImageService';
import { maybeSummarizeGuruSession } from '../services/guruChatSessionSummary';
import { buildBoundedGuruChatStudyContext } from '../services/guruChatStudyContext';
import { useAiRuntimeStatus } from '../hooks/useAiRuntimeStatus';

type Nav = NativeStackNavigationProp<ChatStackParamList, 'GuruChat'>;
type ScreenRoute = RouteProp<ChatStackParamList, 'GuruChat'>;

type ChatMessage = {
  id: string;
  role: 'user' | 'guru';
  text: string;
  sources?: MedicalGroundingSource[];
  referenceImages?: MedicalGroundingSource[];
  images?: GeneratedStudyImageRecord[];
  modelUsed?: string;
  searchQuery?: string;
  timestamp: number;
};

type ModelOption = {
  id: string;
  name: string;
  group:
    | 'Local'
    | 'ChatGPT Codex'
    | 'Groq'
    | 'OpenRouter'
    | 'Gemini'
    | 'Cloudflare'
    | 'GitHub Models'
    | 'Kilo'
    | 'AgentRouter';
};

type ChatItem =
  | { id: string; type: 'message'; message: ChatMessage }
  | { id: string; type: 'typing' };

const CHAT_HISTORY_LIMIT = 100;
const MODEL_GROUP_ORDER: ModelOption['group'][] = [
  'Local',
  'ChatGPT Codex',
  'Groq',
  'OpenRouter',
  'Gemini',
  'Cloudflare',
  'GitHub Models',
  'Kilo',
  'AgentRouter',
];

function getShortModelLabel(modelName?: string | null) {
  return modelName?.split('/').pop() ?? null;
}

function getRuntimeStatusTone(args: {
  isActive: boolean;
  hasError: boolean;
  hasLastModel: boolean;
}) {
  if (args.isActive) {
    return {
      backgroundColor: theme.colors.primaryTintSoft,
      borderColor: theme.colors.primaryLight,
      dotColor: theme.colors.primary,
      textColor: theme.colors.primary,
    };
  }

  if (args.hasError) {
    return {
      backgroundColor: theme.colors.errorTintSoft,
      borderColor: theme.colors.error,
      dotColor: theme.colors.error,
      textColor: theme.colors.textSecondary,
    };
  }

  if (args.hasLastModel) {
    return {
      backgroundColor: theme.colors.successTintSoft,
      borderColor: theme.colors.success,
      dotColor: theme.colors.success,
      textColor: theme.colors.textSecondary,
    };
  }

  return {
    backgroundColor: theme.colors.surfaceAlt,
    borderColor: theme.colors.border,
    dotColor: theme.colors.textMuted,
    textColor: theme.colors.textMuted,
  };
}

function getStartersForTopic(topicName: string) {
  return [
    { icon: 'help-circle-outline', text: `Quiz me on ${topicName}` },
    { icon: 'bulb-outline', text: `Explain ${topicName} step by step` },
    { icon: 'alert-circle-outline', text: `${topicName} from the basics` },
    { icon: 'medkit-outline', text: `High-yield points for exam` },
  ];
}

const FALLBACK_STARTERS = [
  { icon: 'help-circle-outline', text: 'Quiz me on a high-yield topic' },
  { icon: 'bulb-outline', text: 'Walk me through a clinical case' },
  { icon: 'alert-circle-outline', text: 'Quiz me on pharmacology' },
  { icon: 'medkit-outline', text: 'Common exam topic' },
];

const QUICK_REPLY_OPTIONS = [
  {
    key: 'explain',
    label: 'Explain',
    prompt: 'Explain',
  },
  {
    key: 'dont-know',
    label: "Don't know",
    prompt: "Don't know",
  },
  {
    key: 'change-topic',
    label: 'Change topic',
    prompt: 'Change topic',
  },
  {
    key: 'quiz-me',
    label: 'Quiz me',
    prompt: 'Quiz me',
  },
  {
    key: 'continue',
    label: 'Continue',
    prompt: 'Continue',
  },
] as const;

function isExplicitImageRequest(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  const directVisualNouns =
    /(image|diagram|figure|illustration|chart|flowchart|picture|visual|graphic|sketch|schema|schematic)/i;
  const visualActionVerbs =
    /(show|give|create|generate|make|draw|need|want|send|visuali[sz]e|depict|map|outline)/i;
  const seePhrases =
    /\b(can i see|let me see|show me|help me see|visuali[sz]e this|visuali[sz]e it|draw this|draw it)\b/i;
  const anatomyStylePhrases =
    /\b(show|draw|depict|visuali[sz]e|map|outline)\s+(me\s+)?(the\s+)?([a-z][a-z\s-]{2,80})\b/i;

  if (directVisualNouns.test(normalized) && visualActionVerbs.test(normalized)) {
    return true;
  }

  if (seePhrases.test(normalized)) {
    return true;
  }

  if (anatomyStylePhrases.test(normalized)) {
    return true;
  }

  return /\bwhat does (it|this|that|[a-z][a-z\s-]{2,60}) look like\b/i.test(normalized);
}

function inferRequestedImageStyle(text: string): GeneratedStudyImageStyle {
  return /(chart|flowchart|pathway|algorithm|mechanism|map|table|compare|comparison)/i.test(text)
    ? 'chart'
    : 'illustration';
}

function canAutoGenerateStudyImage(
  profile?: {
    geminiKey?: string;
    cloudflareAccountId?: string;
    cloudflareApiToken?: string;
    openrouterKey?: string;
    falApiKey?: string;
    groqApiKey?: string;
    huggingFaceToken?: string;
    braveSearchApiKey?: string;
    deepseekKey?: string;
    githubModelsPat?: string;
    kiloApiKey?: string;
    agentRouterKey?: string;
    deepgramApiKey?: string;
    chatgptConnected?: boolean;
  } | null,
): boolean {
  const { geminiKey, cfAccountId, cfApiToken, falKey, orKey } = getApiKeys(profile ?? undefined);
  return Boolean(geminiKey || (cfAccountId && cfApiToken) || falKey || orKey);
}

function getLastUserPrompt(messages: ChatMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'user') return message.text;
  }
  return null;
}

async function getDynamicStarters(): Promise<{ icon: string; text: string }[]> {
  try {
    const db = getDb();
    // Get due/weak topics the student should be working on
    const rows = await db.getAllAsync<{ name: string; subject: string }>(
      `SELECT t.name, s.name AS subject
       FROM topic_progress tp
       JOIN topics t ON t.id = tp.topic_id
       JOIN subjects s ON s.id = t.subject_id
       WHERE tp.status IN ('seen', 'reviewed')
         AND tp.confidence <= 2
       ORDER BY tp.confidence ASC, tp.last_studied_at ASC
       LIMIT 4`,
    );
    if (rows.length === 0) return FALLBACK_STARTERS;
    const icons = ['help-circle-outline', 'bulb-outline', 'alert-circle-outline', 'medkit-outline'];
    const templates = [
      (n: string) => `Quiz me on ${n}`,
      (n: string) => `Explain ${n} step by step`,
      (n: string) => `${n} from the basics`,
      (n: string) => `High-yield points for ${n}`,
    ];
    return rows.map((r, i) => ({
      icon: icons[i % icons.length],
      text: templates[i % templates.length](r.name),
    }));
  } catch {
    return FALLBACK_STARTERS;
  }
}

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function TypingDots() {
  const dotA = useRef(new Animated.Value(0)).current;
  const dotB = useRef(new Animated.Value(0)).current;
  const dotC = useRef(new Animated.Value(0)).current;
  const dots = useMemo(() => [dotA, dotB, dotC], [dotA, dotB, dotC]);

  useEffect(() => {
    const anims = dots.map((dot, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 150),
          Animated.timing(dot, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
            easing: Easing.out(Easing.ease),
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
            easing: Easing.in(Easing.ease),
          }),
          Animated.delay((2 - index) * 150),
        ]),
      ),
    );
    Animated.parallel(anims).start();
    return () => anims.forEach((anim) => anim.stop());
  }, [dots]);

  return (
    <View style={styles.dotsRow}>
      {dots.map((dot, index) => (
        <Animated.View
          key={index}
          style={[
            styles.dot,
            {
              transform: [
                { translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) },
              ],
              opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
            },
          ]}
        />
      ))}
    </View>
  );
}

/** Renders Guru reply text with paragraphs, bold, bullets, and citation styling for readability */
function normalizeGuruRenderableText(content: string): string {
  return (content ?? '')
    .replace(/\u00A0/g, ' ')
    .replace(/\u200B/g, '')
    .replace(/\u200C/g, '')
    .replace(/\u200D/g, '')
    .replace(/\u2060/g, '')
    .replace(/\uFEFF/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

function splitGuruBoldSegments(line: string): Array<{ text: string; bold: boolean }> {
  if (!line) return [{ text: '', bold: false }];

  const segments: Array<{ text: string; bold: boolean }> = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: line.slice(lastIndex, match.index), bold: false });
    }
    segments.push({ text: match[1] ?? '', bold: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < line.length) {
    segments.push({ text: line.slice(lastIndex), bold: false });
  }

  return segments.length > 0 ? segments : [{ text: line, bold: false }];
}

function FormattedGuruMessage({ text }: { text: string }) {
  const normalizedText = normalizeGuruRenderableText(text);
  const paragraphs = normalizedText.split(/\n{2,}/).filter(Boolean);

  return (
    <View style={styles.guruFormattedWrap}>
      {paragraphs.map((paragraph, paragraphIndex) => {
        const lines = paragraph.split('\n');
        return (
          <View key={`paragraph-${paragraphIndex}`} style={styles.guruParagraph}>
            {lines.map((line, lineIndex) => {
              const segments = splitGuruBoldSegments(line);
              return (
                <Text key={`line-${paragraphIndex}-${lineIndex}`} style={styles.guruFormattedText}>
                  {segments.map((segment, segmentIndex) =>
                    segment.bold ? (
                      <Text
                        key={`seg-${paragraphIndex}-${lineIndex}-${segmentIndex}`}
                        style={styles.guruStrongText}
                      >
                        {segment.text}
                      </Text>
                    ) : (
                      <React.Fragment key={`seg-${paragraphIndex}-${lineIndex}-${segmentIndex}`}>
                        {segment.text}
                      </React.Fragment>
                    ),
                  )}
                </Text>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

function ChatImagePreview({
  uri,
  style,
  onPress,
  onLongPress,
  accessibilityLabel,
}: {
  uri: string;
  style: any;
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityLabel: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!uri || failed) return null;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={250}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Image source={{ uri }} style={style} resizeMode="cover" onError={() => setFailed(true)} />
    </Pressable>
  );
}

function isDisplayableReferenceImage(source: MedicalGroundingSource): boolean {
  const uri = source.imageUrl?.trim();
  if (!uri) return false;
  if (!/^https?:\/\//i.test(uri)) return false;
  return !/\.(pdf|svg|djvu?|tiff?)(?:[?#]|$)/i.test(uri);
}

function MessageSources({
  sources,
  messageId,
  expanded,
  setLightboxUri,
  openSource,
}: {
  sources: MedicalGroundingSource[];
  messageId: string;
  expanded: boolean;
  setLightboxUri: (uri: string) => void;
  openSource: (url: string) => void;
}) {
  if (!sources || sources.length === 0 || !expanded) return null;

  return (
    <View style={styles.sourcesWrap}>
      <View style={styles.sourcesHeader}>
        <Ionicons name="documents-outline" size={13} color={theme.colors.primaryLight} />
        <Text style={styles.sourcesLabel}>Sources ({sources.length})</Text>
      </View>
      {sources.map((source, index) => (
        <View key={`${messageId}-${source.id}`} style={styles.sourceCard}>
          <View style={styles.sourceNumBadge}>
            <Text style={styles.sourceNum}>{index + 1}</Text>
          </View>
          {source.imageUrl ? (
            <Pressable
              onPress={() => setLightboxUri(source.imageUrl!)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Enlarge source thumbnail"
            >
              <Image source={{ uri: source.imageUrl }} style={styles.sourceImage} />
            </Pressable>
          ) : null}
          <Pressable
            style={({ pressed }) => [styles.sourceBodyPress, pressed && styles.pressed]}
            onPress={() => openSource(source.url)}
            android_ripple={{ color: `${theme.colors.primary}22` }}
          >
            <Text style={styles.sourceTitle} numberOfLines={2}>
              {source.title}
            </Text>
            <Text style={styles.sourceMeta}>
              {source.source}
              {source.publishedAt ? `  ·  ${source.publishedAt}` : ''}
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [pressed && styles.pressed]}
            onPress={() => openSource(source.url)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open source in browser"
          >
            <Ionicons name="open-outline" size={13} color={theme.colors.textMuted} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

export default function GuruChatScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<ScreenRoute>();
  const insets = useSafeAreaInsets();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const topicName = route.params?.topicName ?? 'General Medicine';
  const syllabusTopicId = route.params?.topicId;
  const requestedThreadId = route.params?.threadId;
  const groundingTitle = route.params?.groundingTitle;
  const groundingContext = route.params?.groundingContext;
  const { profile } = useAppStore();
  const flatListRef = useRef<FlatList<ChatItem>>(null);

  const isGeneralChat = !route.params?.topicName || topicName === 'General Medicine';
  const isLandscape = viewportWidth > viewportHeight;
  const apiTopicName = isGeneralChat ? undefined : topicName;
  const [starters, setStarters] = useState(
    isGeneralChat ? FALLBACK_STARTERS : getStartersForTopic(topicName),
  );

  useEffect(() => {
    if (isGeneralChat) {
      getDynamicStarters().then(setStarters);
    }
  }, [isGeneralChat]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const showSub = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardInset(Math.max(0, event.endCoordinates.height - insets.bottom));
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardInset(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [insets.bottom]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState(route.params?.initialQuestion ?? '');
  const [loading, setLoading] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(true);
  const [chosenModel, setChosenModel] = useState<string>('auto');
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [imageJobKey, setImageJobKey] = useState<string | null>(null);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [expandedSourcesMessageId, setExpandedSourcesMessageId] = useState<string | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [sessionSummary, setSessionSummary] = useState('');
  const [threads, setThreads] = useState<GuruChatThread[]>([]);
  const [currentThread, setCurrentThread] = useState<GuruChatThread | null>(null);
  const [renameThreadId, setRenameThreadId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const localLlmWarning = getLocalLlmRamWarning();
  /** Tracks Settings `guruChatDefaultModel` so we only reset picker when that changes — not on every live model list refresh. */
  const prevGuruChatDefaultRef = useRef<string | undefined>(undefined);
  const chosenModelRef = useRef<string>('auto');
  const hasPersistedTopicProgressRef = useRef(false);
  const runtime = useAiRuntimeStatus();
  const currentThreadId = currentThread?.id ?? null;

  const applyChosenModel = useCallback((modelId: string) => {
    chosenModelRef.current = modelId;
    setChosenModel(modelId);
  }, []);

  useEffect(() => {
    chosenModelRef.current = chosenModel;
  }, [chosenModel]);

  const refreshThreads = useCallback(async () => {
    try {
      setThreads(await listGuruChatThreads(60));
    } catch {
      setThreads([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const hydrateThread = async () => {
      try {
        const thread =
          (requestedThreadId != null
            ? await getGuruChatThreadById(requestedThreadId)
            : await getLatestGuruChatThread(topicName, syllabusTopicId)) ??
          (await getOrCreateLatestGuruChatThread(topicName, syllabusTopicId));
        if (!cancelled) {
          setCurrentThread(thread);
        }
      } catch {
        if (!cancelled) {
          setCurrentThread(null);
        }
      } finally {
        if (!cancelled) {
          void refreshThreads();
        }
      }
    };
    void hydrateThread();
    return () => {
      cancelled = true;
    };
  }, [refreshThreads, requestedThreadId, syllabusTopicId, topicName]);

  useEffect(() => {
    if (!currentThreadId) {
      setSessionSummary('');
      return;
    }
    void getSessionMemoryRow(currentThreadId).then((r) => setSessionSummary(r?.summaryText ?? ''));
  }, [currentThreadId]);

  useEffect(() => {
    hasPersistedTopicProgressRef.current = false;
  }, [currentThreadId, syllabusTopicId, topicName]);

  useEffect(() => {
    if (!currentThread) {
      setMessages([]);
      return;
    }
    void Promise.all([
      getChatHistory(currentThread.id, CHAT_HISTORY_LIMIT),
      listGeneratedStudyImagesForTopic('chat', currentThread.topicName).catch(() => []),
    ])
      .then(([history, images]) => {
        if (history.length === 0) {
          setMessages([]);
          setBannerVisible(true);
          return;
        }

        const imagesByKey = new Map<string, GeneratedStudyImageRecord[]>();
        for (const image of images) {
          const existing = imagesByKey.get(image.contextKey) ?? [];
          existing.push(image);
          imagesByKey.set(image.contextKey, existing);
        }

        setMessages(
          history.map((entry) => ({
            id: `hist-${entry.id}`,
            role: entry.role,
            text: entry.message,
            timestamp: entry.timestamp,
            sources: entry.sourcesJson ? JSON.parse(entry.sourcesJson) : undefined,
            modelUsed: entry.modelUsed,
            images:
              entry.role === 'guru'
                ? (imagesByKey.get(
                    buildChatImageContextKey(currentThread.topicName, entry.timestamp),
                  ) ?? [])
                : [],
          })),
        );
        setBannerVisible(false);
      })
      .catch(() => {
        // Ignore DB failures and keep the chat usable.
        setMessages([]);
      });
  }, [currentThread]);

  const {
    chatgpt: chatgptModelIds,
    groq: groqModelIds,
    openrouter: orModelIds,
    gemini: geminiModelIds,
    cloudflare: cfModelIds,
    github: githubModelIds,
    kilo: kiloModelIds,
    agentrouter: arModelIds,
  } = useLiveGuruChatModels(profile);

  const availableModels = useMemo(() => {
    const {
      orKey,
      groqKey,
      geminiKey,
      cfAccountId,
      cfApiToken,
      githubModelsPat,
      kiloApiKey,
      agentRouterKey,
      chatgptConnected,
    } = getApiKeys(profile ?? undefined);
    const list: ModelOption[] = [{ id: 'auto', name: 'Auto Route (Smart)', group: 'Local' }];

    if (profile?.useLocalModel && profile?.localModelPath && isLocalLlmAllowedOnThisDevice()) {
      list.push({ id: 'local', name: 'On-Device LLM', group: 'Local' });
    }

    if (chatgptConnected) {
      chatgptModelIds.forEach((model) => {
        list.push({
          id: `chatgpt/${model}`,
          name: model,
          group: 'ChatGPT Codex',
        });
      });
    }

    if (groqKey) {
      groqModelIds.forEach((model) => {
        list.push({
          id: `groq/${model}`,
          name: guruChatPickerNameForGroqModel(model),
          group: 'Groq',
        });
      });
    }

    if (orKey) {
      orModelIds.forEach((model) => {
        list.push({
          id: model,
          name: guruChatPickerNameForOpenRouterSlug(model),
          group: 'OpenRouter',
        });
      });
    }

    if (geminiKey) {
      geminiModelIds.forEach((model) => {
        list.push({
          id: `gemini/${model}`,
          name: guruChatPickerNameForGeminiModel(model),
          group: 'Gemini',
        });
      });
    }

    if (cfAccountId && cfApiToken) {
      cfModelIds.forEach((model) => {
        list.push({
          id: `cf/${model}`,
          name: guruChatPickerNameForCfModel(model),
          group: 'Cloudflare',
        });
      });
    }

    if (githubModelsPat) {
      githubModelIds.forEach((model) => {
        list.push({
          id: `github/${model}`,
          name: guruChatPickerNameForGithubModel(model),
          group: 'GitHub Models',
        });
      });
    }

    if (kiloApiKey) {
      kiloModelIds.forEach((model) => {
        list.push({
          id: `kilo/${model}`,
          name: guruChatPickerNameForGithubModel(model),
          group: 'Kilo',
        });
      });
    }

    if (agentRouterKey) {
      arModelIds.forEach((model) => {
        list.push({
          id: `ar/${model}`,
          name: model,
          group: 'AgentRouter',
        });
      });
    }

    return list;
  }, [
    profile,
    chatgptModelIds,
    groqModelIds,
    orModelIds,
    geminiModelIds,
    cfModelIds,
    githubModelIds,
    kiloModelIds,
    arModelIds,
  ]);

  useEffect(() => {
    if (!profile) return;
    const ids = availableModels.map((m) => m.id);
    const coerced = coerceGuruChatDefaultModel(profile.guruChatDefaultModel, ids);
    const key = profile.guruChatDefaultModel ?? '';
    const isFirstSync = prevGuruChatDefaultRef.current === undefined;
    const settingsDefaultChanged = !isFirstSync && prevGuruChatDefaultRef.current !== key;
    prevGuruChatDefaultRef.current = key;

    setChosenModel((prev) => {
      if (isFirstSync) return coerced;
      if (!ids.includes(prev)) return coerced;
      if (settingsDefaultChanged) return coerced;
      return prev;
    });
  }, [profile, profile?.guruChatDefaultModel, availableModels]);

  const currentModelName = useMemo(() => {
    const found = availableModels.find((model) => model.id === chosenModel);
    return found ? found.name : 'Auto';
  }, [availableModels, chosenModel]);

  const visibleModelGroups = useMemo(() => {
    const presentGroups = new Set(availableModels.map((model) => model.group));
    return MODEL_GROUP_ORDER.filter((group) => presentGroups.has(group));
  }, [availableModels]);

  const runtimeStatus = useMemo(() => {
    const activeRequest = runtime.active[0];
    const activeModel = getShortModelLabel(activeRequest?.modelUsed);
    const lastModel = getShortModelLabel(runtime.lastModelUsed);
    const backend = activeRequest?.backend ?? runtime.lastBackend;

    if (runtime.activeCount > 0) {
      return {
        text: activeModel
          ? `Live: ${activeModel}${backend ? ` via ${backend}` : ''}`
          : backend
            ? `Live: ${backend}`
            : 'AI working',
        tone: getRuntimeStatusTone({
          isActive: true,
          hasError: false,
          hasLastModel: false,
        }),
      };
    }

    if (lastModel) {
      return {
        text: `Last reply: ${lastModel}${backend ? ` via ${backend}` : ''}`,
        tone: getRuntimeStatusTone({
          isActive: false,
          hasError: !!runtime.lastError,
          hasLastModel: true,
        }),
      };
    }

    return {
      text: `Selected: ${currentModelName}`,
      tone: getRuntimeStatusTone({
        isActive: false,
        hasError: !!runtime.lastError,
        hasLastModel: false,
      }),
    };
  }, [currentModelName, runtime]);

  const modelHistory = useMemo(
    () => messages.map((message) => ({ role: message.role, text: message.text })),
    [messages],
  );
  const lastUserPrompt = useMemo(() => getLastUserPrompt(messages), [messages]);
  const latestGuruMessageId = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role === 'guru') return message.id;
    }
    return null;
  }, [messages]);

  const chatItems = useMemo<ChatItem[]>(() => {
    const items: ChatItem[] = messages.map((message) => ({
      id: message.id,
      type: 'message',
      message,
    }));
    if (loading) {
      items.push({ id: 'typing-indicator', type: 'typing' });
    }
    return items.reverse();
  }, [loading, messages]);

  const scrollToLatest = useCallback((delay = 80) => {
    setTimeout(() => {
      InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(() => {
          flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        });
      });
    }, delay);
  }, []);

  async function openSource(url: string) {
    try {
      if (await Linking.canOpenURL(url)) {
        await Linking.openURL(url);
      }
    } catch {
      Alert.alert('Could not open source', 'The source link could not be opened.');
    }
  }

  const copyMessage = useCallback(async (text: string) => {
    Clipboard.setString(text);
    Alert.alert('Copied', 'Message copied to clipboard.');
  }, []);

  const openThread = useCallback(
    async (thread: GuruChatThread) => {
      if (
        thread.topicName !== topicName ||
        (thread.syllabusTopicId ?? undefined) !== syllabusTopicId
      ) {
        navigation.replace('GuruChat', {
          topicName: thread.topicName,
          topicId: thread.syllabusTopicId ?? undefined,
          threadId: thread.id,
        });
        return;
      }
      setCurrentThread(thread);
      setShowHistoryDrawer(false);
      setExpandedSourcesMessageId(null);
      setBannerVisible(true);
      setSessionSummary('');
    },
    [navigation, syllabusTopicId, topicName],
  );

  const createAndSwitchToNewThread = useCallback(async () => {
    const thread = await createGuruChatThread(topicName, syllabusTopicId);
    setCurrentThread(thread);
    setMessages([]);
    setBannerVisible(true);
    setExpandedSourcesMessageId(null);
    setSessionSummary('');
    setShowHistoryDrawer(false);
    await refreshThreads();
  }, [refreshThreads, syllabusTopicId, topicName]);

  const handleRenameThread = useCallback(async () => {
    if (!renameThreadId) return;
    const normalized = renameDraft.trim();
    if (!normalized) {
      setRenameThreadId(null);
      setRenameDraft('');
      return;
    }
    await renameGuruChatThread(renameThreadId, normalized);
    if (currentThreadId === renameThreadId && currentThread) {
      setCurrentThread({ ...currentThread, title: normalized });
    }
    setRenameThreadId(null);
    setRenameDraft('');
    await refreshThreads();
  }, [currentThread, currentThreadId, refreshThreads, renameDraft, renameThreadId]);

  const handleDeleteThread = useCallback(
    async (thread: GuruChatThread) => {
      Alert.alert('Delete chat', 'Delete this conversation from history?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteGuruChatThread(thread.id);
            if (thread.id === currentThreadId) {
              const fallback =
                (await getLatestGuruChatThread(topicName, syllabusTopicId)) ??
                (await createGuruChatThread(topicName, syllabusTopicId));
              setCurrentThread(fallback);
              setMessages([]);
              setBannerVisible(true);
              setExpandedSourcesMessageId(null);
              setSessionSummary('');
            }
            await refreshThreads();
          },
        },
      ]);
    },
    [currentThreadId, refreshThreads, syllabusTopicId, topicName],
  );

  const handleGenerateMessageImage = useCallback(
    async (message: ChatMessage, style: GeneratedStudyImageStyle) => {
      const jobKey = `${message.id}:${style}`;
      if (imageJobKey || message.role !== 'guru') return;

      setImageJobKey(jobKey);
      try {
        const image = await generateStudyImage({
          contextType: 'chat',
          contextKey: buildChatImageContextKey(
            currentThread?.topicName ?? topicName,
            message.timestamp,
          ),
          topicName: currentThread?.topicName ?? topicName,
          sourceText: message.text,
          style,
        });

        setMessages((current) =>
          current.map((entry) =>
            entry.id === message.id
              ? { ...entry, images: [image, ...(entry.images ?? [])] }
              : entry,
          ),
        );
        scrollToLatest(0);
      } catch (error) {
        Alert.alert(
          'Image generation failed',
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        setImageJobKey(null);
      }
    },
    [currentThread, imageJobKey, topicName],
  );

  async function handleSend(questionOverride?: string) {
    const question = (questionOverride ?? input).trim();
    if (!question || loading || !currentThreadId) return;
    const wantsImage = isExplicitImageRequest(question);
    const requestedImageStyle = inferRequestedImageStyle(question);
    const canGenerateImage = canAutoGenerateStudyImage(profile);

    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: question,
      timestamp: Date.now(),
    };

    const nextHistory = [...modelHistory, { role: 'user' as const, text: question }];
    setMessages((current) => [...current, userMessage]);
    setInput('');
    setBannerVisible(false);
    setLoading(true);
    scrollToLatest();

    try {
      await saveChatMessage(currentThreadId, topicName, 'user', question, Date.now());
      await refreshThreads();
    } catch {
      // Persistence should not block the main conversation flow.
    }

    const guruTs = Date.now();
    const guruId = `g-${guruTs}`;
    let sawFirstToken = false;

    try {
      const studyContextLine = await buildBoundedGuruChatStudyContext(profile);
      const selectedModelAtSend = chosenModelRef.current;
      const modelForApi = selectedModelAtSend === 'auto' ? undefined : selectedModelAtSend;
      // #region agent log
      fetch('http://127.0.0.1:7507/ingest/f6a0734c-b45d-4770-9e51-aa07e5c2da6e', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'ca9385' },
        body: JSON.stringify({
          sessionId: 'ca9385',
          hypothesisId: 'H1',
          location: 'GuruChatScreen.handleSend',
          message: 'guru_chat_model_passed',
          data: {
            chosenModelState: chosenModel,
            chosenModelRef: selectedModelAtSend,
            modelForApi: modelForApi ?? 'undefined(auto)',
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      const grounded = await chatWithGuruGroundedStreaming(
        question,
        apiTopicName,
        nextHistory,
        modelForApi,
        (delta) => {
          if (!sawFirstToken) {
            sawFirstToken = true;
            setLoading(false);
          }
          setMessages((current) => {
            const idx = current.findIndex((m) => m.id === guruId);
            if (idx === -1) {
              return [
                ...current,
                {
                  id: guruId,
                  role: 'guru' as const,
                  text: delta,
                  timestamp: guruTs,
                },
              ];
            }
            const next = [...current];
            const prev = next[idx];
            next[idx] = { ...prev, text: prev.text + delta };
            return next;
          });
          scrollToLatest(0);
        },
        {
          sessionSummary: sessionSummary.trim() || undefined,
          profileNotes: profile?.guruMemoryNotes?.trim() || undefined,
          studyContext: studyContextLine,
          syllabusTopicId,
          groundingTitle,
          groundingContext,
        },
      );
      let finalGuruText = grounded.reply;
      setMessages((current) => {
        const idx = current.findIndex((m) => m.id === guruId);
        if (idx === -1) {
          return [
            ...current,
            {
              id: guruId,
              role: 'guru',
              text: grounded.reply,
              sources: grounded.sources,
              referenceImages: grounded.referenceImages,
              modelUsed: grounded.modelUsed,
              searchQuery: grounded.searchQuery,
              timestamp: guruTs,
            },
          ];
        }
        const next = [...current];
        const prev = next[idx];
        next[idx] = {
          ...prev,
          text: grounded.reply,
          sources: grounded.sources,
          referenceImages: grounded.referenceImages,
          modelUsed: grounded.modelUsed,
          searchQuery: grounded.searchQuery,
        };
        return next;
      });

      if (wantsImage && canGenerateImage && !imageJobKey) {
        try {
          setImageJobKey(`${guruId}:${requestedImageStyle}`);
          const image = await generateStudyImage({
            contextType: 'chat',
            contextKey: buildChatImageContextKey(currentThread?.topicName ?? topicName, guruTs),
            topicName: currentThread?.topicName ?? topicName,
            sourceText: grounded.reply,
            style: requestedImageStyle,
          });
          setMessages((current) =>
            current.map((entry) =>
              entry.id === guruId ? { ...entry, images: [image, ...(entry.images ?? [])] } : entry,
            ),
          );
          scrollToLatest(0);
        } catch (imageError) {
          const imageFailureMessage =
            imageError instanceof Error ? imageError.message : 'Image generation failed.';
          finalGuruText = `${finalGuruText}\n\nNote: I couldn't generate a study image automatically. ${imageFailureMessage}`;
          setMessages((current) =>
            current.map((entry) =>
              entry.id === guruId
                ? {
                    ...entry,
                    text: finalGuruText,
                  }
                : entry,
            ),
          );
        } finally {
          setImageJobKey(null);
        }
      } else if (
        wantsImage &&
        !canGenerateImage &&
        (!grounded.referenceImages || grounded.referenceImages.length === 0)
      ) {
        finalGuruText = `${finalGuruText}\n\nNote: No image backend is configured right now. Add a fal, Gemini, Cloudflare, or OpenRouter image key in Settings to let Guru generate diagrams automatically.`;
        setMessages((current) =>
          current.map((entry) =>
            entry.id === guruId
              ? {
                  ...entry,
                  text: finalGuruText,
                }
              : entry,
          ),
        );
      }

      try {
        await saveChatMessage(
          currentThreadId,
          topicName,
          'guru',
          finalGuruText,
          guruTs,
          grounded.sources && grounded.sources.length > 0
            ? JSON.stringify(grounded.sources)
            : undefined,
          grounded.modelUsed,
        );
        await refreshThreads();
      } catch {
        // Ignore persistence issues here too.
      }
      if (syllabusTopicId != null && !hasPersistedTopicProgressRef.current) {
        try {
          await markTopicDiscussedInChat(syllabusTopicId);
          hasPersistedTopicProgressRef.current = true;
        } catch {
          // Progress persistence should not block the conversation flow.
        }
      }
      try {
        await maybeSummarizeGuruSession(currentThreadId, topicName);
        const row = await getSessionMemoryRow(currentThreadId);
        setSessionSummary(row?.summaryText ?? '');
      } catch {
        /* session summary is optional */
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setMessages((current) => [
        ...current,
        {
          id: `g-${Date.now()}`,
          role: 'guru',
          text: `Warning: ${message}`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
      scrollToLatest(120);
    }
  }

  async function handleRegenerateReply() {
    if (loading) return;
    if (!lastUserPrompt) {
      Alert.alert('Nothing to regenerate', 'Send a message first.');
      return;
    }
    await handleSend(lastUserPrompt);
  }

  function startNewChat() {
    if (messages.length > 0) {
      Alert.alert('New chat', 'Start a new conversation? Current messages will be cleared.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'New chat',
          onPress: () => {
            void createAndSwitchToNewThread();
          },
        },
      ]);
    } else {
      void createAndSwitchToNewThread();
    }
  }

  const renderMessage = useCallback(
    ({ item }: ListRenderItemInfo<ChatItem>) => {
      if (item.type === 'typing') {
        return (
          <View style={[styles.msgRow, styles.msgRowGuru]}>
            <View style={styles.guruAvatarTiny}>
              <Ionicons name="sparkles" size={11} color={theme.colors.primary} />
            </View>
            <View style={[styles.msgContent, styles.msgContentGuru]}>
              <View style={[styles.messageStack, styles.messageStackGuru]}>
                <View style={styles.msgMetaRow}>
                  <Text style={styles.msgAuthor}>Guru</Text>
                  <Text style={styles.msgMetaDivider}>•</Text>
                  <Text style={styles.msgMetaText}>Thinking...</Text>
                </View>
                <View style={[styles.bubbleWrap, styles.bubbleWrapGuru]}>
                  <View style={[styles.bubble, styles.guruBubble, styles.typingBubble]}>
                    <TypingDots />
                  </View>
                </View>
              </View>
            </View>
          </View>
        );
      }

      const { message } = item;
      const modelTag = getShortModelLabel(message.modelUsed);
      const hasSources = !!message.sources?.length;
      const sourcesExpanded = expandedSourcesMessageId === message.id;
      const isLatestGuruMessage = message.id === latestGuruMessageId;
      const guruGeneratedImages = message.role === 'guru' ? (message.images ?? []) : [];
      const guruReferenceImages =
        message.role === 'guru'
          ? (message.referenceImages ?? []).filter(isDisplayableReferenceImage)
          : [];
      const hasGuruImages = guruGeneratedImages.length > 0 || guruReferenceImages.length > 0;
      const showInlineGuruImages = hasGuruImages && isLandscape;
      return (
        <View
          style={[styles.msgRow, message.role === 'user' ? styles.msgRowUser : styles.msgRowGuru]}
        >
          {message.role === 'guru' ? (
            <View style={styles.guruAvatarTiny}>
              <Ionicons name="sparkles" size={11} color={theme.colors.primary} />
            </View>
          ) : null}

          <View
            style={[
              styles.msgContent,
              message.role === 'user' ? styles.msgContentUser : styles.msgContentGuru,
            ]}
          >
            <View
              style={[
                styles.messageStack,
                message.role === 'user' ? styles.messageStackUser : styles.messageStackGuru,
              ]}
            >
              <View
                style={[
                  styles.msgMetaRow,
                  message.role === 'user' ? styles.msgMetaRowUser : styles.msgMetaRowGuru,
                ]}
              >
                <Text style={styles.msgAuthor}>{message.role === 'user' ? 'You' : 'Guru'}</Text>
                <Text style={styles.msgMetaDivider}>•</Text>
                <Text style={styles.msgMetaText}>{formatTime(message.timestamp)}</Text>
                {message.role === 'guru' && modelTag ? (
                  <View style={styles.msgModelPill}>
                    <Text style={styles.msgModelPillText}>{modelTag}</Text>
                  </View>
                ) : null}
              </View>
              {showInlineGuruImages ? (
                <View style={styles.guruBubbleMediaRow}>
                  <Pressable
                    style={[styles.bubbleWrap, styles.bubbleWrapGuru]}
                    onLongPress={() => copyMessage(message.text)}
                    delayLongPress={400}
                  >
                    <View style={[styles.bubble, styles.guruBubble]}>
                      <FormattedGuruMessage text={message.text} />
                    </View>
                  </Pressable>
                  <View style={styles.generatedImagesInlineWrap}>
                    {guruReferenceImages.map((image) => (
                      <ChatImagePreview
                        key={`${message.id}-reference-${image.id}`}
                        uri={image.imageUrl!}
                        style={[styles.generatedImage, styles.generatedImageInline]}
                        onPress={() => setLightboxUri(image.imageUrl!)}
                        onLongPress={() => openSource(image.url)}
                        accessibilityLabel="View reference image"
                      />
                    ))}
                    {guruGeneratedImages.map((image) => (
                      <ChatImagePreview
                        key={`${message.id}-image-${image.id}`}
                        uri={image.localUri}
                        style={[styles.generatedImage, styles.generatedImageInline]}
                        onPress={() => setLightboxUri(image.localUri)}
                        accessibilityLabel="View enlarged image"
                      />
                    ))}
                  </View>
                </View>
              ) : (
                <Pressable
                  style={[
                    styles.bubbleWrap,
                    message.role === 'user' ? styles.bubbleWrapUser : styles.bubbleWrapGuru,
                  ]}
                  onLongPress={() => copyMessage(message.text)}
                  delayLongPress={400}
                >
                  <View
                    style={[
                      styles.bubble,
                      message.role === 'user' ? styles.userBubble : styles.guruBubble,
                    ]}
                  >
                    {message.role === 'guru' ? (
                      <FormattedGuruMessage text={message.text} />
                    ) : (
                      <Text style={[styles.bubbleText, styles.userBubbleText]}>{message.text}</Text>
                    )}
                  </View>
                </Pressable>
              )}

              <Text style={[styles.timestamp, message.role === 'user' && styles.timestampRight]}>
                {formatTime(message.timestamp)}
                {message.role === 'guru' && message.modelUsed
                  ? `  ·  ${message.modelUsed.split('/').pop()}`
                  : ''}
              </Text>

              {message.role === 'guru' && hasGuruImages && !showInlineGuruImages ? (
                <View style={styles.generatedImagesWrap}>
                  {guruReferenceImages.map((image) => (
                    <ChatImagePreview
                      key={`${message.id}-reference-${image.id}`}
                      uri={image.imageUrl!}
                      style={[styles.generatedImage, styles.generatedImagePortrait]}
                      onPress={() => setLightboxUri(image.imageUrl!)}
                      onLongPress={() => openSource(image.url)}
                      accessibilityLabel="View reference image"
                    />
                  ))}
                  {guruGeneratedImages.map((image) => (
                    <ChatImagePreview
                      key={`${message.id}-image-${image.id}`}
                      uri={image.localUri}
                      style={[styles.generatedImage, styles.generatedImagePortrait]}
                      onPress={() => setLightboxUri(image.localUri)}
                      accessibilityLabel="View enlarged image"
                    />
                  ))}
                </View>
              ) : null}

              {message.role === 'guru' && message.sources && message.sources.length > 0 ? (
                <MessageSources
                  sources={message.sources}
                  messageId={message.id}
                  expanded={sourcesExpanded}
                  setLightboxUri={setLightboxUri}
                  openSource={openSource}
                />
              ) : null}

              {message.role === 'guru' ? (
                <>
                  <View style={styles.responseActionsRow}>
                    {isLatestGuruMessage && !loading ? (
                      <Pressable
                        style={({ pressed }) => [
                          styles.responseActionBtn,
                          styles.responseActionBtnActive,
                          pressed && styles.pressed,
                        ]}
                        onPress={() => handleRegenerateReply()}
                        accessibilityRole="button"
                        accessibilityLabel="Regenerate response"
                      >
                        <Ionicons
                          name="refresh-outline"
                          size={15}
                          color={theme.colors.textPrimary}
                        />
                      </Pressable>
                    ) : null}
                    <Pressable
                      style={({ pressed }) => [styles.responseActionBtn, pressed && styles.pressed]}
                      onPress={() => copyMessage(message.text)}
                      accessibilityRole="button"
                      accessibilityLabel="Copy response"
                    >
                      <Ionicons name="copy-outline" size={15} color={theme.colors.primaryLight} />
                    </Pressable>
                    {hasSources ? (
                      <Pressable
                        style={({ pressed }) => [
                          styles.responseActionBtn,
                          sourcesExpanded && styles.responseActionBtnActive,
                          pressed && styles.pressed,
                        ]}
                        onPress={() =>
                          setExpandedSourcesMessageId((current) =>
                            current === message.id ? null : message.id,
                          )
                        }
                        accessibilityRole="button"
                        accessibilityLabel={sourcesExpanded ? 'Hide sources' : 'Show sources'}
                      >
                        <Ionicons
                          name="link-outline"
                          size={15}
                          color={
                            sourcesExpanded ? theme.colors.textPrimary : theme.colors.primaryLight
                          }
                        />
                      </Pressable>
                    ) : null}
                    {(['illustration', 'chart'] as GeneratedStudyImageStyle[]).map((style) => {
                      const isGenerating = imageJobKey === `${message.id}:${style}`;
                      return (
                        <Pressable
                          key={`${message.id}-${style}`}
                          style={({ pressed }) => [
                            styles.responseActionBtn,
                            isGenerating && styles.responseActionBtnActive,
                            pressed && styles.pressed,
                          ]}
                          onPress={() => handleGenerateMessageImage(message, style)}
                          disabled={!!imageJobKey}
                          accessibilityRole="button"
                          accessibilityLabel={
                            style === 'illustration' ? 'Generate illustration' : 'Generate chart'
                          }
                        >
                          {isGenerating ? (
                            <ActivityIndicator size="small" color={theme.colors.textPrimary} />
                          ) : (
                            <Ionicons
                              name={
                                style === 'illustration' ? 'image-outline' : 'git-network-outline'
                              }
                              size={15}
                              color={theme.colors.primaryLight}
                            />
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                  {imageJobKey?.startsWith(`${message.id}:`) ? (
                    <View style={styles.responseStatusRow}>
                      <ActivityIndicator size="small" color={theme.colors.primaryLight} />
                      <Text style={styles.responseStatusText}>
                        {imageJobKey.endsWith(':chart')
                          ? 'Generating chart...'
                          : 'Generating illustration...'}
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : null}
            </View>
          </View>
        </View>
      );
    },
    [
      copyMessage,
      expandedSourcesMessageId,
      handleGenerateMessageImage,
      imageJobKey,
      lastUserPrompt,
      latestGuruMessageId,
      loading,
      isLandscape,
      openSource,
    ],
  );

  return (
    <SafeAreaView style={styles.safe} testID="guru-chat-screen">
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
        keyboardVerticalOffset={0}
      >
        <ResponsiveContainer style={styles.flex}>
          <View style={styles.headerWrap}>
            <View style={styles.header}>
              {navigation.canGoBack() ? (
                <Pressable
                  style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
                  android_ripple={{ color: '#ffffff14', radius: 22 }}
                  onPress={() => navigation.goBack()}
                  accessibilityRole="button"
                  accessibilityLabel="Go back"
                >
                  <Ionicons name="arrow-back" size={20} color="#D7DBE8" />
                </Pressable>
              ) : (
                <View style={styles.iconBtn} />
              )}

              <View style={styles.headerCenter}>
                <Text style={styles.title}>Guru Chat</Text>
                <Text style={styles.headerSubtitle} numberOfLines={2}>
                  {currentThread && currentThread.title !== topicName
                    ? currentThread.title
                    : isGeneralChat
                      ? 'Medical assistant'
                      : topicName}
                </Text>
              </View>

              <View style={styles.headerActions}>
                <Pressable
                  style={({ pressed }) => [styles.newChatBtn, pressed && styles.pressed]}
                  android_ripple={{ color: '#ffffff14', radius: 22 }}
                  onPress={() => setShowHistoryDrawer(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Open chat history"
                >
                  <Ionicons
                    name="reorder-three-outline"
                    size={18}
                    color={theme.colors.primaryLight}
                  />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.newChatBtn, pressed && styles.pressed]}
                  android_ripple={{ color: '#ffffff14', radius: 22 }}
                  onPress={startNewChat}
                  accessibilityRole="button"
                  accessibilityLabel="New chat"
                >
                  <Ionicons name="create-outline" size={18} color={theme.colors.primaryLight} />
                </Pressable>
              </View>
            </View>
          </View>

          {showHistoryDrawer ? (
            <View style={styles.historyOverlay} pointerEvents="box-none">
              <Pressable
                style={styles.historyBackdrop}
                onPress={() => setShowHistoryDrawer(false)}
              />
              <View style={styles.historyDrawer}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyTitle}>Chat History</Text>
                  <Pressable
                    style={({ pressed }) => [styles.historyCloseBtn, pressed && styles.pressed]}
                    onPress={() => setShowHistoryDrawer(false)}
                  >
                    <Ionicons name="close" size={18} color={theme.colors.textMuted} />
                  </Pressable>
                </View>

                <Pressable
                  style={({ pressed }) => [styles.historyNewBtn, pressed && styles.pressed]}
                  onPress={() => {
                    void createAndSwitchToNewThread();
                  }}
                >
                  <Ionicons name="add-outline" size={18} color={theme.colors.primaryLight} />
                  <Text style={styles.historyNewBtnText}>New Chat</Text>
                </Pressable>

                <FlatList
                  data={threads}
                  keyExtractor={(item) => item.id.toString()}
                  style={styles.historyList}
                  contentContainerStyle={styles.historyListContent}
                  renderItem={({ item }) => {
                    const isActive = item.id === currentThreadId;
                    return (
                      <Pressable
                        style={({ pressed }) => [
                          styles.historyItem,
                          isActive && styles.historyItemActive,
                          pressed && styles.pressed,
                        ]}
                        onPress={() => {
                          void openThread(item);
                        }}
                      >
                        <View style={styles.historyItemMain}>
                          <Text style={styles.historyItemTitle} numberOfLines={2}>
                            {item.title}
                          </Text>
                          <Text style={styles.historyItemTopic} numberOfLines={2}>
                            {item.topicName}
                          </Text>
                          <Text style={styles.historyItemPreview} numberOfLines={3}>
                            {item.lastMessagePreview || 'No messages yet'}
                          </Text>
                        </View>
                        <View style={styles.historyItemSide}>
                          <Text style={styles.historyItemTime}>
                            {formatTime(item.lastMessageAt)}
                          </Text>
                          <View style={styles.historyItemActions}>
                            <Pressable
                              style={({ pressed }) => [
                                styles.historyActionBtn,
                                pressed && styles.pressed,
                              ]}
                              onPress={() => {
                                setRenameThreadId(item.id);
                                setRenameDraft(item.title);
                                setShowHistoryDrawer(false);
                              }}
                              hitSlop={6}
                            >
                              <Ionicons
                                name="pencil-outline"
                                size={14}
                                color={theme.colors.primaryLight}
                              />
                            </Pressable>
                            <Pressable
                              style={({ pressed }) => [
                                styles.historyActionBtn,
                                pressed && styles.pressed,
                              ]}
                              onPress={() => {
                                void handleDeleteThread(item);
                              }}
                              hitSlop={6}
                            >
                              <Ionicons
                                name="trash-outline"
                                size={14}
                                color={theme.colors.textMuted}
                              />
                            </Pressable>
                          </View>
                        </View>
                      </Pressable>
                    );
                  }}
                  ListEmptyComponent={
                    <View style={styles.historyEmpty}>
                      <Text style={styles.historyEmptyText}>No chats yet</Text>
                    </View>
                  }
                />
              </View>
            </View>
          ) : null}

          {renameThreadId ? (
            <View style={styles.sheetOverlay} pointerEvents="box-none">
              <Pressable
                style={styles.sheetBackdrop}
                onPress={() => {
                  setRenameThreadId(null);
                  setRenameDraft('');
                }}
              />
              <View style={styles.renameSheet}>
                <Text style={styles.renameTitle}>Rename Chat</Text>
                <TextInput
                  style={styles.renameInput}
                  value={renameDraft}
                  onChangeText={setRenameDraft}
                  placeholder="Chat title"
                  placeholderTextColor={theme.colors.textMuted}
                  autoFocus
                  maxLength={80}
                />
                <View style={styles.renameActions}>
                  <Pressable
                    style={({ pressed }) => [styles.renameBtn, pressed && styles.pressed]}
                    onPress={() => {
                      setRenameThreadId(null);
                      setRenameDraft('');
                    }}
                  >
                    <Text style={styles.renameBtnText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.renameBtn,
                      styles.renameBtnPrimary,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => {
                      void handleRenameThread();
                    }}
                  >
                    <Text style={styles.renameBtnTextPrimary}>Save</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}

          {showModelPicker ? (
            <View style={styles.sheetOverlay} pointerEvents="box-none">
              <Pressable style={styles.sheetBackdrop} onPress={() => setShowModelPicker(false)} />
              <View style={styles.sheetContent}>
                <Text style={styles.sheetTitle}>Choose Brain</Text>
                {localLlmWarning ? <Text style={styles.warningText}>{localLlmWarning}</Text> : null}
                <FlatList
                  data={visibleModelGroups}
                  keyExtractor={(group) => group}
                  renderItem={({ item: group }) => {
                    const groupModels = availableModels.filter((model) => model.group === group);
                    if (groupModels.length === 0) return null;
                    return (
                      <View style={styles.modelGroup}>
                        <Text style={styles.modelGroupLabel}>{group}</Text>
                        {groupModels.map((model) => (
                          <Pressable
                            key={model.id}
                            style={({ pressed }) => [
                              styles.modelItem,
                              chosenModel === model.id && styles.modelItemActive,
                              pressed && styles.pressed,
                            ]}
                            android_ripple={{ color: `${theme.colors.primary}22` }}
                            onPress={() => {
                              if (messages.length > 0 && model.id !== chosenModel) {
                                Alert.alert(
                                  'Switch model?',
                                  "Switching models mid-conversation may lose context. The new model won't remember earlier messages.",
                                  [
                                    { text: 'Cancel', style: 'cancel' },
                                    {
                                      text: 'Switch',
                                      onPress: () => {
                                        applyChosenModel(model.id);
                                        setShowModelPicker(false);
                                      },
                                    },
                                  ],
                                );
                              } else {
                                applyChosenModel(model.id);
                                setShowModelPicker(false);
                              }
                            }}
                          >
                            <Text
                              style={[
                                styles.modelItemText,
                                chosenModel === model.id && styles.modelItemTextActive,
                              ]}
                            >
                              {model.name}
                            </Text>
                            {chosenModel === model.id ? (
                              <Ionicons
                                name="checkmark-circle"
                                size={18}
                                color={theme.colors.primary}
                              />
                            ) : null}
                          </Pressable>
                        ))}
                      </View>
                    );
                  }}
                />
                <Pressable
                  style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
                  onPress={() => setShowModelPicker(false)}
                >
                  <Text style={styles.closeBtnText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <View style={styles.contentWrap}>
            {bannerVisible ? (
              <View style={styles.infoBanner}>
                <Ionicons
                  name="library-outline"
                  size={14}
                  color={theme.colors.primary}
                  style={styles.bannerIcon}
                />
                <Text style={styles.infoText}>
                  Grounded with Wikipedia, Europe PMC and PubMed. Sources are linked inline.
                </Text>
                <Pressable onPress={() => setBannerVisible(false)} hitSlop={8}>
                  <Ionicons name="close" size={14} color={theme.colors.textMuted} />
                </Pressable>
              </View>
            ) : null}

            <View style={styles.chatSurface}>
              {messages.length === 0 && !loading ? (
                <View style={styles.emptyWrap}>
                  <View style={styles.emptyPanel}>
                    <View style={styles.heroRow}>
                      <View style={styles.guruAvatarLarge}>
                        <Ionicons name="sparkles" size={20} color={theme.colors.primary} />
                      </View>
                      <View style={styles.heroCopy}>
                        <Text style={styles.emptyTitle}>
                          {isGeneralChat ? 'Ask anything medical' : `Let's work on ${topicName}`}
                        </Text>
                        <Text style={styles.emptyHint}>
                          Ask a question or start with one of these prompts.
                        </Text>
                      </View>
                    </View>

                    {sessionSummary ? (
                      <View style={styles.sessionSummaryInline}>
                        <Text style={styles.sessionSummaryInlineText} numberOfLines={3}>
                          {sessionSummary}
                        </Text>
                      </View>
                    ) : null}

                    <View style={styles.starterGrid}>
                      {starters.map((starter) => (
                        <Pressable
                          key={starter.text}
                          style={({ pressed }) => [styles.starterChip, pressed && styles.pressed]}
                          android_ripple={{ color: `${theme.colors.primary}22` }}
                          onPress={() => handleSend(starter.text)}
                          disabled={loading}
                        >
                          <View style={styles.starterIconWrap}>
                            <Ionicons
                              name={starter.icon as keyof typeof Ionicons.glyphMap}
                              size={14}
                              color={theme.colors.primary}
                            />
                          </View>
                          <Text style={styles.starterChipText} numberOfLines={3}>
                            {starter.text}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </View>
              ) : (
                <FlatList
                  ref={flatListRef}
                  data={chatItems}
                  renderItem={renderMessage}
                  keyExtractor={(item) => item.id}
                  style={styles.messages}
                  contentContainerStyle={styles.messagesContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  inverted
                  maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
                />
              )}
            </View>

            <View style={styles.quickActionsCenterWrap}>
              <View style={styles.quickActionsCenter}>
                {QUICK_REPLY_OPTIONS.map((option) => (
                  <Pressable
                    key={option.key}
                    style={({ pressed }) => [
                      styles.quickActionChip,
                      loading && styles.quickActionChipDisabled,
                      pressed && !loading && styles.pressed,
                    ]}
                    onPress={() => handleSend(option.prompt)}
                    disabled={loading}
                  >
                    <Text style={styles.quickActionText}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View
              style={[styles.composerWrap, keyboardInset > 0 && { marginBottom: keyboardInset }]}
            >
              <View style={styles.inputRow}>
                <Pressable
                  style={({ pressed }) => [styles.gearBtn, pressed && styles.pressed]}
                  onPress={() => setShowModelPicker(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`Chat settings. Current model ${currentModelName}. ${runtimeStatus.text}`}
                >
                  <Ionicons name="settings-outline" size={18} color={theme.colors.primaryLight} />
                </Pressable>
                <View style={styles.inputShell}>
                  <TextInput
                    style={styles.input}
                    placeholder="Ask Guru anything medical..."
                    placeholderTextColor={theme.colors.textMuted}
                    value={input}
                    autoFocus={!!route.params?.autoFocusComposer}
                    onChangeText={setInput}
                    onSubmitEditing={() => handleSend()}
                    returnKeyType="send"
                    multiline={false}
                    blurOnSubmit={false}
                    maxLength={1000}
                    selectionColor={theme.colors.primaryLight}
                  />
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.sendBtn,
                    (!input.trim() || loading) && styles.sendBtnDisabled,
                    pressed && input.trim() && !loading && styles.pressed,
                  ]}
                  android_ripple={{ color: '#ffffff18', radius: 22 }}
                  onPress={() => handleSend()}
                  disabled={!input.trim() || loading}
                  accessibilityRole="button"
                  accessibilityLabel="Send message"
                >
                  <Ionicons
                    name={loading ? 'ellipse-outline' : 'send'}
                    size={18}
                    color={theme.colors.textPrimary}
                  />
                </Pressable>
              </View>
            </View>
          </View>
        </ResponsiveContainer>
      </KeyboardAvoidingView>
      <ImageLightbox
        visible={!!lightboxUri}
        uri={lightboxUri}
        onClose={() => setLightboxUri(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: theme.alpha.pressed,
    transform: [{ scale: 0.98 }],
  },
  headerWrap: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#111621',
    borderWidth: 1,
    borderColor: '#21283A',
  },
  headerCenter: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 1,
  },
  newChatBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111621',
    borderWidth: 1,
    borderColor: '#2A3350',
  },
  historyOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 28,
  },
  historyBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.38)',
  },
  historyDrawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '80%',
    maxWidth: 340,
    backgroundColor: '#0F141D',
    borderRightWidth: 1,
    borderRightColor: '#20283A',
    paddingTop: 58,
    paddingHorizontal: 14,
    paddingBottom: 18,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  historyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  historyCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#141B27',
    borderWidth: 1,
    borderColor: '#20283A',
  },
  historyNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 12,
    marginBottom: 12,
    backgroundColor: '#141B27',
    borderWidth: 1,
    borderColor: '#26314A',
  },
  historyNewBtnText: {
    color: theme.colors.primaryLight,
    fontSize: 13,
    fontWeight: '700',
  },
  historyList: {
    flex: 1,
  },
  historyListContent: {
    gap: 8,
    paddingBottom: 20,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 16,
    padding: 12,
    backgroundColor: '#121926',
    borderWidth: 1,
    borderColor: '#20283A',
  },
  historyItemActive: {
    borderColor: theme.colors.primaryLight,
    backgroundColor: '#172033',
  },
  historyItemMain: {
    flex: 1,
    minWidth: 0,
  },
  historyItemTitle: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  historyItemTopic: {
    color: '#8E99B1',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  historyItemPreview: {
    color: '#6F7A93',
    fontSize: 12,
    lineHeight: 19,
    marginTop: 6,
  },
  historyItemSide: {
    alignItems: 'flex-end',
    gap: 8,
  },
  historyItemTime: {
    color: '#6F7A93',
    fontSize: 10,
    fontWeight: '600',
  },
  historyItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historyActionBtn: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0E1521',
    borderWidth: 1,
    borderColor: '#20283A',
  },
  historyEmpty: {
    paddingVertical: 28,
    alignItems: 'center',
  },
  historyEmptyText: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  sheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 30,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.backdropStrong,
  },
  sheetContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '80%',
  },
  sheetTitle: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 16,
    textAlign: 'center',
  },
  warningText: {
    color: '#FFD58A',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
    textAlign: 'center',
  },
  modelGroup: {
    marginBottom: 20,
  },
  modelGroupLabel: {
    color: '#667091',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginLeft: 4,
  },
  modelItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#13131E',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#23233A',
  },
  modelItemActive: {
    backgroundColor: '#25205A',
    borderColor: '#4A43B0',
  },
  modelItemText: {
    color: '#AEB5C4',
    fontSize: 15,
    fontWeight: '600',
  },
  modelItemTextActive: {
    color: theme.colors.textPrimary,
  },
  closeBtn: {
    marginTop: 8,
    padding: 16,
    alignItems: 'center',
    backgroundColor: '#23233A',
    borderRadius: 14,
  },
  closeBtnText: {
    color: theme.colors.textPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  renameSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    gap: 14,
  },
  renameTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  renameInput: {
    backgroundColor: '#0E1521',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#20283A',
    color: theme.colors.textPrimary,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  renameActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  renameBtn: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#141B27',
    borderWidth: 1,
    borderColor: '#20283A',
  },
  renameBtnPrimary: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  renameBtnText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  renameBtnTextPrimary: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  contentWrap: {
    flex: 1,
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 10,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: '#111722',
    borderWidth: 1,
    borderColor: '#222A3B',
  },
  bannerIcon: {
    marginTop: 0,
  },
  infoText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
  chatSurface: {
    flex: 1,
    borderRadius: 26,
    backgroundColor: '#0D1017',
    overflow: 'hidden',
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 6,
    paddingTop: 10,
    paddingBottom: 16,
    gap: 12,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    width: '100%',
  },
  msgRowUser: {
    flexDirection: 'row-reverse',
  },
  msgRowGuru: {},
  guruAvatarTiny: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1C1B39',
    borderWidth: 1,
    borderColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginBottom: 4,
  },
  msgContent: {
    flex: 1,
    maxWidth: '100%',
  },
  msgContentUser: {
    alignItems: 'stretch',
  },
  msgContentGuru: {
    alignItems: 'stretch',
  },
  messageStack: {
    flexShrink: 1,
  },
  messageStackUser: {
    maxWidth: '60%',
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  messageStackGuru: {
    width: '88%',
    maxWidth: '88%',
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubbleWrap: {
    maxWidth: '100%',
    minWidth: 0,
  },
  bubbleWrapUser: {
    maxWidth: '60%',
    alignSelf: 'flex-end',
  },
  bubbleWrapGuru: {
    maxWidth: '60%',
    minWidth: 0,
    alignSelf: 'flex-start',
  },
  msgMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  msgMetaRowUser: {
    justifyContent: 'flex-end',
  },
  msgMetaRowGuru: {
    justifyContent: 'flex-start',
  },
  msgAuthor: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  msgMetaDivider: {
    color: '#66718C',
    fontSize: 11,
  },
  msgMetaText: {
    color: '#7A849D',
    fontSize: 11,
    fontWeight: '500',
  },
  msgModelPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#141A2A',
    borderWidth: 1,
    borderColor: '#27314B',
  },
  msgModelPillText: {
    color: '#90A3D8',
    fontSize: 10,
    fontWeight: '700',
  },
  bubble: {
    alignSelf: 'flex-start',
    minWidth: 0,
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderWidth: 1,
  },
  userBubble: {
    backgroundColor: '#26315F',
    borderColor: '#4252A0',
    borderBottomRightRadius: 8,
  },
  guruBubble: {
    backgroundColor: '#121723',
    borderColor: '#232A3C',
    borderBottomLeftRadius: 8,
  },
  typingBubble: {
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  bubbleText: {
    color: '#A9B2C6',
    fontSize: 17,
    lineHeight: 28,
    fontWeight: '400',
  },
  guruFormattedWrap: {
    width: '100%',
    minWidth: 0,
    gap: 10,
  },
  guruParagraph: {
    gap: 2,
  },
  guruFormattedText: {
    color: '#A9B2C6',
    fontSize: 17,
    lineHeight: 28,
    fontWeight: '400',
    minWidth: 0,
  },
  guruStrongText: {
    color: '#E2D27A',
    fontWeight: '800',
  },
  userBubbleText: {
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  timestamp: {
    display: 'none',
  },
  timestampRight: {
    display: 'none',
  },
  imageActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  imageActionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#121827',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#263049',
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  imageActionChipBusy: {
    opacity: 0.7,
  },
  imageActionText: {
    color: theme.colors.primaryLight,
    fontSize: 12,
    fontWeight: '700',
  },
  guruBubbleMediaRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  generatedImagesInlineWrap: {
    gap: 8,
    alignItems: 'flex-start',
    flexShrink: 0,
  },
  generatedImagesWrap: {
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  generatedImage: {
    width: 220,
    height: 220,
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  generatedImageInline: {
    width: 176,
    height: 176,
  },
  generatedImagePortrait: {
    width: 248,
    height: 248,
  },
  sourcesWrap: {
    width: '100%',
    marginTop: 8,
    borderRadius: 16,
    backgroundColor: '#101520',
    borderWidth: 1,
    borderColor: '#20283A',
    overflow: 'hidden',
  },
  sourcesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: '#12192A',
  },
  sourcesLabel: {
    color: theme.colors.primaryLight,
    fontSize: 12,
    fontWeight: '800',
  },
  sourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: '#1D2334',
  },
  sourceNumBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#1B2340',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sourceNum: {
    color: theme.colors.primaryLight,
    fontSize: 11,
    fontWeight: '800',
  },
  sourceImage: {
    width: 34,
    height: 34,
    borderRadius: 8,
    flexShrink: 0,
    backgroundColor: theme.colors.surfaceAlt,
  },
  sourceBodyPress: {
    flex: 1,
    minWidth: 0,
  },
  sourceTitle: {
    color: '#A4AEC2',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  sourceMeta: {
    color: '#727C95',
    fontSize: 11,
    marginTop: 2,
  },
  responseActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignSelf: 'flex-start',
    gap: 2,
    marginTop: 4,
  },
  responseStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    marginTop: 6,
    paddingHorizontal: 2,
  },
  responseStatusText: {
    color: '#7E8AA6',
    fontSize: 12,
    fontWeight: '600',
  },
  responseActionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: '#101520',
    borderWidth: 1,
    borderColor: '#20283A',
  },
  responseActionBtnActive: {
    backgroundColor: theme.colors.primary,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    height: 16,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: 10,
  },
  emptyPanel: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: '#111621',
    borderWidth: 1,
    borderColor: '#20283A',
    gap: 16,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroCopy: {
    flex: 1,
  },
  guruAvatarLarge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1E1D42',
    borderWidth: 1,
    borderColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: '900',
  },
  emptyHint: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
  },
  sessionSummaryInline: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#101928',
    borderWidth: 1,
    borderColor: '#243047',
  },
  sessionSummaryInlineText: {
    color: '#99A4BA',
    fontSize: 13,
    lineHeight: 20,
  },
  starterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  starterChip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#24304A',
    backgroundColor: '#0F1521',
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexBasis: '47%',
    flexGrow: 1,
  },
  starterIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A2340',
  },
  starterChipText: {
    color: '#9EA8BE',
    fontSize: 13,
    flex: 1,
    lineHeight: 20,
  },
  composerWrap: {
    gap: 0,
    paddingTop: 4,
    paddingHorizontal: 4,
    paddingBottom: 4,
    borderRadius: 24,
    backgroundColor: '#0F141D',
    borderWidth: 1,
    borderColor: '#1B2332',
  },
  quickActionsCenterWrap: {
    alignItems: 'center',
    paddingVertical: 2,
  },
  quickActionsCenter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    maxWidth: '92%',
  },
  quickActionChip: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#20283A',
    backgroundColor: '#141B27',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quickActionChipDisabled: {
    opacity: 0.5,
  },
  quickActionText: {
    color: '#A1ABC1',
    fontSize: 12,
    fontWeight: '700',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#0B1017',
    borderWidth: 1,
    borderColor: '#1D2432',
  },
  gearBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121926',
    borderWidth: 1,
    borderColor: '#27314A',
  },
  inputShell: {
    flex: 1,
    paddingHorizontal: 2,
  },
  input: {
    minHeight: 44,
    color: theme.colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: 0,
    paddingVertical: 10,
    textAlignVertical: 'center',
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#857EFF',
  },
  sendBtnDisabled: {
    backgroundColor: '#232838',
    borderColor: '#2E3446',
    shadowOpacity: 0,
    elevation: 0,
  },
});
