import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  InteractionManager,
  Keyboard,
  Linking,
  Pressable,
  StatusBar,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { type FlashListRef } from '@shopify/flash-list';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { ImageLightbox } from '../components/ImageLightbox';
import ErrorBoundary from '../components/ErrorBoundary';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import Clipboard from '@react-native-clipboard/clipboard';
import type { ChatStackParamList } from '../navigation/types';
import LinearText from '../components/primitives/LinearText';
import { ResponsiveContainer } from '../hooks/useResponsive';
import BannerIconButton from '../components/BannerIconButton';
import ScreenHeader from '../components/ScreenHeader';
import ScreenMotion from '../motion/ScreenMotion';
import { RevealSection } from './GuruChatRevealSection';
import { shouldShowGuruChatSkeleton } from './guruChatLoadingState';
import { addLlmStateListener } from '../services/aiService';
import { getApiKeys } from '../services/ai';
import { showInfo, showError, confirm, confirmDestructive } from '../components/dialogService';
import { useProfileQuery } from '../hooks/queries/useProfile';

// === REFACTOR: New Hooks (Phase 1 & 3) ===
import { useGuruChatSession } from '../hooks/useGuruChatSession';
import { useGuruChatModels } from '../hooks/useGuruChatModels';
import { useGuruChat } from '../hooks/useGuruChat';
// =========================================

// === REFACTOR: New Components (Phase 2) ===
import { GuruChatHistoryDrawer } from '../components/chat/GuruChatHistoryDrawer';
import { GuruChatRenameSheet } from '../components/chat/GuruChatRenameSheet';
import { GuruChatModelSelector } from '../components/chat/GuruChatModelSelector';
import { GuruChatMessageList } from '../components/chat/GuruChatMessageList';
import { GuruChatInput } from '../components/chat/GuruChatInput';
// ========================================

import {
  getChatHistory,
  getOrCreateLatestGuruChatThread,
  type GuruChatThread,
} from '../db/queries/aiCache';
import { getSessionMemoryRow } from '../db/queries/guruChatMemory';
import { getDb } from '../db/database';
import { getLocalLlmRamWarning } from '../services/deviceMemory';
import { linearTheme as n } from '../theme/linearTheme';
import { whiteAlpha, accentAlpha, blackAlpha } from '../theme/colorUtils';
import {
  listGeneratedStudyImagesForTopic,
  type GeneratedStudyImageRecord,
  type GeneratedStudyImageStyle,
} from '../db/queries/generatedStudyImages';
import { buildChatImageContextKey, generateStudyImage } from '../services/studyImageService';
import { buildBoundedGuruChatStudyContext } from '../services/guruChatStudyContext';
import type { ChatItem, ChatMessage } from '../types/chat';

type Nav = NativeStackNavigationProp<ChatStackParamList, 'GuruChat'>;
type ScreenRoute = RouteProp<ChatStackParamList, 'GuruChat'>;

const CHAT_HISTORY_LIMIT = 100;
const GURU_CHAT_SCREEN_MOTION_TRIGGER = 'first-mount' as const;

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

function ChatSkeleton() {
  return (
    <View style={chatSkeletonStyles.container}>
      <View style={chatSkeletonStyles.header}>
        <View style={chatSkeletonStyles.headerBar} />
        <View style={chatSkeletonStyles.headerBarSmall} />
      </View>
      <View style={chatSkeletonStyles.body}>
        <View style={chatSkeletonStyles.bubble} />
        <View style={[chatSkeletonStyles.bubble, chatSkeletonStyles.bubbleRight]} />
        <View style={chatSkeletonStyles.bubble} />
      </View>
    </View>
  );
}

const chatSkeletonStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: n.colors.background },
  header: { paddingHorizontal: 16, paddingTop: 16, gap: 6 },
  headerBar: {
    width: '40%',
    height: 12,
    borderRadius: 4,
    backgroundColor: n.colors.border,
    opacity: 0.5,
  },
  headerBarSmall: {
    width: '25%',
    height: 8,
    borderRadius: 3,
    backgroundColor: n.colors.border,
    opacity: 0.3,
  },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 32, gap: 16 },
  bubble: {
    width: '65%',
    height: 48,
    borderRadius: 12,
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.border,
    opacity: 0.5,
  },
  bubbleRight: { alignSelf: 'flex-end', width: '50%', height: 32 },
});

export default function GuruChatScreen() {
  return (
    <ErrorBoundary>
      <GuruChatScreenContent />
    </ErrorBoundary>
  );
}

function GuruChatScreenContent() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<ScreenRoute>();
  const { width: viewportWidth } = useWindowDimensions();
  const topicName = route.params?.topicName ?? 'General Medicine';
  const syllabusTopicId = route.params?.topicId;
  const requestedThreadId = route.params?.threadId;
  const groundingTitle = route.params?.groundingTitle;
  const groundingContext = route.params?.groundingContext;
  const { data: profile } = useProfileQuery();

  const [isInitializing, setIsInitializing] = useState(false);

  useEffect(() => {
    return addLlmStateListener((state) => {
      setIsInitializing(state === 'initializing');
    });
  }, []);
  const flatListRef = useRef<FlashListRef<ChatItem>>(null);

  // === REFACTOR: New Hooks (Phase 1 - incremental adoption) ===
  // These hooks will gradually replace inline state management
  const guruSession = useGuruChatSession({
    topicName,
    syllabusTopicId,
    requestedThreadId,
  });

  const guruModels = useGuruChatModels({ profile });
  const {
    chosenModel,
    pickerTab,
    setPickerTab,
    applyChosenModel: applyGuruModelChoice,
    currentModelLabel,
    currentModelGroup,
  } = guruModels;
  // ==========================================================

  const isGeneralChat = !route.params?.topicName || topicName === 'General Medicine';
  const [starters, setStarters] = useState(
    isGeneralChat ? FALLBACK_STARTERS : getStartersForTopic(topicName),
  );

  useEffect(() => {
    if (isGeneralChat) {
      getDynamicStarters().then(setStarters);
    }
  }, [isGeneralChat]);

  // === REFACTOR MAPPING (Phase 1 → Phase 3) ===
  // Old State                    → New Hook Equivalent
  // messages, setMessages        → guruSession.messages (via useGuruChat)
  // loading, setLoading          → chat.status === 'streaming'
  // chosenModel, setChosenModel  → guruModels.chosenModel, applyChosenModel
  // threads, setThreads          → guruSession.threads
  // currentThread, setCurrentThread → guruSession.currentThread
  // sessionSummary               → guruSession.sessionSummary
  // isHydratingThread            → guruSession.isHydratingThread
  // isHydratingHistory           → guruSession.isHydratingHistory
  // refreshThreads               → guruSession.refreshThreads
  // =============================================

  const [input, setInput] = useState(route.params?.initialQuestion ?? '');
  const [bannerVisible, setBannerVisible] = useState(true);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState(false);
  const [imageJobKey, setImageJobKey] = useState<string | null>(null);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [expandedSourcesMessageId, setExpandedSourcesMessageId] = useState<string | null>(null);
  const [sessionSummary, setSessionSummary] = useState('');
  const [sessionStateJson, setSessionStateJson] = useState('{}');
  const [threads, setThreads] = useState<GuruChatThread[]>([]);
  const [currentThread, setCurrentThread] = useState<GuruChatThread | null>(null);
  const [renameThreadId, setRenameThreadId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [entryComplete, setEntryComplete] = useState(false);
  const [isHydratingThread, setIsHydratingThread] = useState(true);
  const [isHydratingHistory, setIsHydratingHistory] = useState(true);

  useEffect(() => {
    if (lightboxUri) {
      Keyboard?.dismiss?.();
    }
  }, [lightboxUri]);

  // === REFACTOR: Sync new hooks with legacy state (Phase 1) ===
  // These effects keep old and new state in sync during migration
  useEffect(() => {
    if (guruSession.currentThread !== undefined) {
      setCurrentThread(guruSession.currentThread);
    }
  }, [guruSession.currentThread]);

  useEffect(() => {
    if (guruSession.threads) {
      setThreads(guruSession.threads);
    }
  }, [guruSession.threads]);

  useEffect(() => {
    if (guruSession.sessionSummary !== undefined) {
      setSessionSummary(guruSession.sessionSummary);
    }
  }, [guruSession.sessionSummary]);

  useEffect(() => {
    if (guruSession.isHydratingThread !== undefined) {
      setIsHydratingThread(guruSession.isHydratingThread);
    }
  }, [guruSession.isHydratingThread]);

  useEffect(() => {
    if (guruSession.isHydratingHistory !== undefined) {
      setIsHydratingHistory(guruSession.isHydratingHistory);
    }
  }, [guruSession.isHydratingHistory]);

  // =========================================================
  const localLlmWarning = getLocalLlmRamWarning();
  const currentThreadId = currentThread?.id ?? null;
  const refreshThreads = guruSession.refreshThreads;

  const modelForVercel = useMemo(() => {
    if (!profile) return null;
    try {
      const { createGuruFallbackModel } = require('../services/ai/v2');
      return createGuruFallbackModel({
        profile,
        chosenModel: chosenModel === 'auto' ? undefined : chosenModel,
        textMode: true,
        onProviderError: (provider: string, model: string, error: unknown) => {
          if (__DEV__) {
            console.warn(`[GuruChat] Provider error: ${provider}/${model}`, error);
          }
        },
        onProviderSuccess: (provider: string, model: string) => {
          if (__DEV__) {
            console.log(`[GuruChat] Provider success: ${provider}/${model}`);
          }
        },
      });
    } catch (error) {
      console.warn(
        '[GuruChat] No providers available for v2 model (add an API key in Settings):',
        (error as Error)?.message,
      );
      return null;
    }
  }, [profile, chosenModel]);

  const guruChat = useGuruChat({
    model: modelForVercel,
    threadId: currentThreadId,
    topicName,
    syllabusTopicId,
    initialMessages: [],
    context: {
      sessionSummary,
      sessionStateJson,
      profileNotes: profile?.guruMemoryNotes,
      studyContext: '',
      syllabusTopicId,
      groundingTitle,
      groundingContext,
    },
    onRefreshThreads: refreshThreads,
    onSessionMemoryUpdated: ({ summaryText, stateJson }) => {
      setSessionSummary(summaryText);
      setSessionStateJson(stateJson);
    },
    finalizeAssistantMessage: async (assistantMessage) => {
      let finalText = assistantMessage.text;
      let finalImages = assistantMessage.images;
      const wantsImage = isExplicitImageRequest(questionInFlightRef.current ?? '');
      const requestedImageStyle = inferRequestedImageStyle(questionInFlightRef.current ?? '');
      const canGenerateImage = canAutoGenerateStudyImage(profile);

      if (wantsImage && canGenerateImage && !imageJobKey) {
        try {
          setImageJobKey(`${assistantMessage.id}:${requestedImageStyle}`);
          const image = await generateStudyImage({
            contextType: 'chat',
            contextKey: buildChatImageContextKey(
              currentThread?.topicName ?? topicName,
              assistantMessage.timestamp,
            ),
            topicName: currentThread?.topicName ?? topicName,
            sourceText: assistantMessage.text,
            style: requestedImageStyle,
          });
          finalImages = [image, ...(assistantMessage.images ?? [])];
          scrollToLatest(0);
        } catch (imageError) {
          const imageFailureMessage =
            imageError instanceof Error ? imageError.message : 'Image generation failed.';
          finalText = `${finalText}\n\nNote: I couldn't generate a study image automatically. ${imageFailureMessage}`;
        } finally {
          setImageJobKey(null);
        }
      } else if (
        wantsImage &&
        !canGenerateImage &&
        (!assistantMessage.referenceImages || assistantMessage.referenceImages.length === 0)
      ) {
        finalText = `${finalText}\n\nNote: No image backend is configured right now. Add a fal, Gemini, Cloudflare, or OpenRouter image key in Settings to let Guru generate diagrams automatically.`;
      }

      return {
        text: finalText,
        images: finalImages,
      };
    },
    onError: (err) => {
      console.error('GuruChat error:', err);
    },
  });
  const messages = guruChat.messages;
  const setMessages = guruChat.setMessages;
  const loading = guruChat.status === 'submitted' || guruChat.status === 'streaming';

  const applyChosenModel = useCallback(
    (modelId: string) => {
      applyGuruModelChoice(modelId);
    },
    [applyGuruModelChoice],
  );

  useEffect(() => {
    if (!currentThreadId) {
      setSessionSummary('');
      setSessionStateJson('{}');
      setIsHydratingHistory(false);
      return;
    }
    setIsHydratingHistory(true);
    void getSessionMemoryRow(currentThreadId).then((r) => {
      setSessionSummary(r?.summaryText ?? '');
      setSessionStateJson(r?.stateJson ?? '{}');
    });
  }, [currentThreadId]);

  useEffect(() => {
    if (!currentThread) {
      setMessages([]);
      setIsHydratingHistory(false);
      return;
    }
    void Promise.all([
      getChatHistory(currentThread.id, CHAT_HISTORY_LIMIT),
      Promise.resolve(listGeneratedStudyImagesForTopic('chat', currentThread.topicName)).catch(
        () => [],
      ),
    ])
      .then(([history, images]) => {
        if (history.length === 0) {
          setMessages([]);
          setBannerVisible(true);
          setIsHydratingHistory(false);
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
        setIsHydratingHistory(false);
      })
      .catch(() => {
        // Ignore DB failures and keep the chat usable.
        setMessages([]);
        setIsHydratingHistory(false);
      });
  }, [currentThread, setMessages]);

  const lastUserPrompt = useMemo(() => getLastUserPrompt(messages), [messages]);
  const questionInFlightRef = useRef<string | null>(null);
  const chatItems = useMemo<ChatItem[]>(() => {
    const items: ChatItem[] = messages.map((message) => ({
      id: message.id,
      type: 'message',
      message,
    }));
    // useChat appends an assistant row immediately; a separate typing row duplicated "Guru".
    if (loading) {
      const last = messages[messages.length - 1];
      if (last?.role !== 'guru') {
        items.push({ id: 'typing-indicator', type: 'typing' });
      }
    }
    return items;
  }, [loading, messages]);

  const scrollToLatest = useCallback((delay = 80) => {
    setTimeout(() => {
      InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        });
      });
    }, delay);
  }, []);

  useEffect(() => {
    if (messages.length === 0 && !loading) return;
    scrollToLatest(0);
  }, [loading, messages, scrollToLatest]);

  const openSource = useCallback(async (url: string) => {
    try {
      if (await Linking.canOpenURL(url)) {
        await Linking.openURL(url);
      }
    } catch {
      void showInfo('Could not open source', 'The source link could not be opened.');
    }
  }, []);

  const copyMessage = useCallback(async (text: string) => {
    Clipboard.setString(text);
    void showInfo('Copied', 'Message copied to clipboard.');
  }, []);

  const handleOpenThread = useCallback(
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

      await guruSession.openThread(thread);
      setShowHistoryDrawer(false);
      setExpandedSourcesMessageId(null);
      setBannerVisible(true);
      setSessionSummary('');
      setSessionStateJson('{}');
      setMessages([]);
    },
    [guruSession, navigation, setMessages, syllabusTopicId, topicName],
  );

  const createAndSwitchToNewThread = useCallback(async () => {
    const thread = await guruSession.createNewThread();
    if (!thread) return;
    setMessages([]);
    setBannerVisible(true);
    setExpandedSourcesMessageId(null);
    setSessionSummary('');
    setSessionStateJson('{}');
    setShowHistoryDrawer(false);
  }, [guruSession, setMessages]);

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
        void showError(error, 'Image generation failed');
      } finally {
        setImageJobKey(null);
      }
    },
    [currentThread, imageJobKey, scrollToLatest, setMessages, topicName],
  );

  const handleSend = useCallback(
    async (questionOverride?: string) => {
      const question = (questionOverride ?? input).trim();
      if (!question || loading) return;

      let resolvedThreadId = currentThreadId;
      if (!resolvedThreadId) {
        try {
          const recoveredThread = await getOrCreateLatestGuruChatThread(topicName, syllabusTopicId);
          setCurrentThread(recoveredThread);
          resolvedThreadId = recoveredThread.id;
        } catch {
          return;
        }
      }

      setInput('');
      setBannerVisible(false);
      questionInFlightRef.current = question;
      scrollToLatest();

      try {
        const studyContextLine = await buildBoundedGuruChatStudyContext(
          profile ?? null,
          syllabusTopicId,
        );
        const assistantMessage = await guruChat.sendMessage(
          question,
          {
            sessionSummary: sessionSummary.trim() || undefined,
            sessionStateJson: sessionStateJson.trim() || undefined,
            profileNotes: profile?.guruMemoryNotes?.trim() || undefined,
            studyContext: studyContextLine ?? undefined,
            syllabusTopicId,
            groundingTitle,
            groundingContext,
          },
          { persistThreadId: resolvedThreadId },
        );
        if (!assistantMessage) {
          throw new Error('Guru did not return a response.');
        }
        scrollToLatest(0);
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
        scrollToLatest(120);
      } finally {
        questionInFlightRef.current = null;
      }
    },
    [
      groundingContext,
      groundingTitle,
      currentThreadId,
      guruChat,
      input,
      loading,
      profile,
      scrollToLatest,
      sessionStateJson,
      sessionSummary,
      setMessages,
      syllabusTopicId,
      topicName,
    ],
  );

  const handleRegenerateReply = useCallback(async () => {
    if (loading) return;
    if (!lastUserPrompt) {
      void showInfo('Nothing to regenerate', 'Send a message first.');
      return;
    }
    await handleSend(lastUserPrompt);
  }, [handleSend, lastUserPrompt, loading]);

  async function startNewChat() {
    if (messages.length > 0) {
      const ok = await confirm(
        'New chat',
        'Start a new conversation? Current messages will be cleared.',
      );
      if (!ok) return;
      void createAndSwitchToNewThread();
    } else {
      void createAndSwitchToNewThread();
    }
  }

  if (shouldShowGuruChatSkeleton({ isHydratingThread, isHydratingHistory })) {
    return (
      <SafeAreaView style={styles.safe} testID="guru-chat-screen">
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <ChatSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} testID="guru-chat-screen">
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <View style={styles.flex}>
        <ScreenMotion
          style={styles.flex}
          trigger={GURU_CHAT_SCREEN_MOTION_TRIGGER}
          isEntryComplete={() => setEntryComplete(true)}
        >
          <KeyboardAvoidingView
            style={styles.flex}
            behavior="translate-with-padding"
            enabled={!lightboxUri}
          >
            <ResponsiveContainer style={styles.flex}>
              <RevealSection active={entryComplete} delayMs={0}>
                <ScreenHeader
                  title=""
                  onBackPress={navigation.canGoBack() ? () => navigation.goBack() : undefined}
                  rightElement={
                    <View style={styles.minimalHeaderRight}>
                      <BannerIconButton
                        onPress={() => setShowHistoryDrawer(true)}
                        accessibilityLabel="Open chat history"
                        style={styles.minimalHeaderIcon}
                      >
                        <Ionicons
                          name="reorder-three-outline"
                          size={18}
                          color={n.colors.textSecondary}
                        />
                      </BannerIconButton>
                      <BannerIconButton
                        onPress={startNewChat}
                        accessibilityLabel="New chat"
                        style={styles.minimalHeaderIcon}
                      >
                        <Ionicons name="create-outline" size={18} color={n.colors.textSecondary} />
                      </BannerIconButton>
                    </View>
                  }
                  showSettings
                />
              </RevealSection>

              {/* === REFACTOR: Phase 2 - New History Drawer Component === */}
              <GuruChatHistoryDrawer
                visible={showHistoryDrawer}
                threads={threads}
                currentThreadId={currentThread?.id ?? null}
                onClose={() => setShowHistoryDrawer(false)}
                onNewChat={createAndSwitchToNewThread}
                onOpenThread={(thread: GuruChatThread) => {
                  void handleOpenThread(thread);
                }}
                onRenameThread={(thread: GuruChatThread) => {
                  setRenameThreadId(thread.id);
                  setRenameDraft(thread.title);
                }}
                onDeleteThread={async (thread: GuruChatThread) => {
                  const ok = await confirmDestructive(
                    'Delete chat?',
                    'This will permanently delete the chat history.',
                  );
                  if (ok) {
                    await guruSession.deleteThread(thread);
                  }
                }}
              />
              {/* ===================================================== */}

              {/* === REFACTOR: Phase 2 - New Rename Sheet Component === */}
              <GuruChatRenameSheet
                visible={renameThreadId !== null}
                currentTitle={renameDraft}
                onTitleChange={setRenameDraft}
                onClose={() => {
                  setRenameThreadId(null);
                  setRenameDraft('');
                }}
                onSave={() => {
                  if (renameThreadId) {
                    void guruSession.renameThread(renameThreadId, renameDraft);
                  }
                  setRenameThreadId(null);
                  setRenameDraft('');
                }}
              />
              {/* ================================================== */}

              {/* === REFACTOR: Phase 2 - New Model Selector Component === */}
              <GuruChatModelSelector
                visible={showModelPicker}
                availableModels={guruModels.availableModels}
                visibleModelGroups={guruModels.visibleModelGroups}
                chosenModel={chosenModel}
                onSelectModel={async (modelId: string) => {
                  if (messages.length > 0 && modelId !== chosenModel) {
                    const ok = await confirm(
                      'Switch model?',
                      "Switching models mid-conversation may lose context. The new model won't remember earlier messages.",
                    );
                    if (!ok) return;
                  }
                  applyChosenModel(modelId);
                  setShowModelPicker(false);
                }}
                pickerTab={pickerTab}
                onSetPickerTab={setPickerTab}
                onClose={() => setShowModelPicker(false)}
                localLlmWarning={localLlmWarning}
                hasMessages={messages.length > 0}
              />
              {/* ===================================================== */}

              <RevealSection active={entryComplete} delayMs={80} style={styles.flex}>
                <View style={styles.contentWrap}>
                  {bannerVisible ? (
                    <View style={styles.infoBanner}>
                      <Ionicons
                        name="library-outline"
                        size={14}
                        color={n.colors.accent}
                        style={styles.bannerIcon}
                      />
                      <LinearText style={styles.infoText}>
                        Grounded with Wikipedia, Europe PMC and PubMed. Sources are linked inline.
                      </LinearText>
                      <Pressable onPress={() => setBannerVisible(false)} hitSlop={8}>
                        <Ionicons name="close" size={14} color={n.colors.textMuted} />
                      </Pressable>
                    </View>
                  ) : null}

                  <GuruChatMessageList
                    messages={messages}
                    chatItems={chatItems}
                    isLoading={loading}
                    isInitializing={isInitializing}
                    isHydrating={isHydratingThread || isHydratingHistory}
                    entryComplete={entryComplete}
                    showEmptyState={messages.length === 0 && !loading}
                    starters={starters}
                    sessionSummary={sessionSummary}
                    isGeneralChat={isGeneralChat}
                    topicName={topicName}
                    bannerVisible={bannerVisible}
                    imageJobKey={imageJobKey}
                    expandedSourcesMessageId={expandedSourcesMessageId}
                    flatListRef={flatListRef}
                    viewportWidth={viewportWidth}
                    onToggleSources={(messageId: string) =>
                      setExpandedSourcesMessageId((current) =>
                        current === messageId ? null : messageId,
                      )
                    }
                    onCopyMessage={copyMessage}
                    onRegenerate={handleRegenerateReply}
                    onGenerateImage={handleGenerateMessageImage}
                    onOpenSource={openSource}
                    onSetLightboxUri={setLightboxUri}
                    onSelectStarter={(text: string) => handleSend(text)}
                    onBannerDismiss={() => setBannerVisible(false)}
                  />
                </View>
              </RevealSection>

              {!lightboxUri && entryComplete ? (
                <View style={styles.keyboardComposerBar}>
                  <GuruChatInput
                    input={input}
                    onChangeText={setInput}
                    onSend={handleSend}
                    onModelPress={() => {
                      setPickerTab(currentModelGroup);
                      setShowModelPicker(true);
                    }}
                    currentModelLabel={currentModelLabel}
                    isLoading={loading}
                    autoFocus={!!route.params?.autoFocusComposer}
                  />
                </View>
              ) : null}
            </ResponsiveContainer>
          </KeyboardAvoidingView>
        </ScreenMotion>
      </View>
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
    backgroundColor: n.colors.background,
  },
  flex: {
    flex: 1,
  },
  /** Opaque strip so the message list does not show through when the keyboard lifts the composer. */
  keyboardComposerBar: {
    width: '100%',
    backgroundColor: n.colors.background,
  },
  pressed: {
    opacity: n.alpha.pressed,
    transform: [{ scale: 0.98 }],
  },
  minimalHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  minimalHeaderIcon: {
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  iconBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: whiteAlpha['3'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
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
    ...n.typography.sectionTitle,
    color: n.colors.textPrimary,
  },
  headerSubtitle: {
    ...n.typography.caption,
    color: n.colors.textMuted,
    marginTop: 1,
  },
  newChatBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: whiteAlpha['3'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
  },
  historyOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 28,
  },
  historyBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: blackAlpha['52'],
  },
  historyDrawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '82%',
    maxWidth: 340,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: whiteAlpha['8'],
    paddingTop: 58,
    paddingHorizontal: 16,
    paddingBottom: 18,
    backgroundColor: n.colors.background,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  historyTitle: {
    ...n.typography.sectionTitle,
    color: n.colors.textPrimary,
  },
  historyCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: whiteAlpha['4'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.border,
  },
  historyNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: n.radius.md,
    paddingVertical: 13,
    marginBottom: 14,
    backgroundColor: accentAlpha['8'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentAlpha['20'],
  },
  historyNewBtnText: {
    ...n.typography.label,
    color: n.colors.accent,
  },
  historyList: {
    flex: 1,
  },
  historyListContent: {
    gap: 0,
    paddingBottom: 20,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: n.radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: 'transparent',
    marginBottom: 2,
  },
  historyItemActive: {
    backgroundColor: accentAlpha['8'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentAlpha['18'],
  },
  historyItemMain: {
    flex: 1,
    minWidth: 0,
  },
  historyItemTitle: {
    ...n.typography.label,
    color: n.colors.textPrimary,
    lineHeight: 20,
  },
  historyItemTopic: {
    ...n.typography.caption,
    color: n.colors.textSecondary,
    lineHeight: 18,
    marginTop: 2,
  },
  historyItemPreview: {
    ...n.typography.caption,
    color: n.colors.textMuted,
    lineHeight: 19,
    marginTop: 6,
  },
  historyItemSide: {
    alignItems: 'flex-end',
    gap: 8,
  },
  historyItemTime: {
    color: n.colors.textMuted,
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
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: whiteAlpha['3'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
  },
  historyEmpty: {
    paddingVertical: 28,
    alignItems: 'center',
  },
  historyEmptyText: {
    ...n.typography.caption,
    color: n.colors.textMuted,
  },
  sheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 30,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: blackAlpha['56'],
  },
  sheetContent: {
    backgroundColor: n.colors.surface,
    borderRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 16,
    maxHeight: '74%',
    width: '94%',
    maxWidth: 560,
    alignSelf: 'center',
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['10'],
    shadowColor: n.colors.background,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 20,
  },
  sheetTitle: {
    ...n.typography.label,
    color: n.colors.textPrimary,
    marginBottom: 14,
    textAlign: 'center',
    letterSpacing: 0.4,
    fontSize: 14,
  },
  warningText: {
    ...n.typography.caption,
    color: n.colors.warning,
    lineHeight: 18,
    marginBottom: 16,
    textAlign: 'center',
  },
  tabStrip: {
    flexGrow: 0,
    marginBottom: 12,
  },
  tabStripContent: {
    gap: 4,
    paddingHorizontal: 2,
  },
  tabChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  tabChipActive: {
    backgroundColor: accentAlpha['10'],
    borderColor: accentAlpha['25'],
  },
  tabChipText: {
    color: n.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  tabChipTextActive: {
    color: n.colors.accent,
  },
  modelList: {
    maxHeight: 320,
  },
  modelItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: n.radius.sm,
    marginBottom: 2,
  },
  modelItemActive: {
    backgroundColor: accentAlpha['8'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentAlpha['20'],
  },
  modelItemText: {
    color: n.colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  modelItemTextActive: {
    color: n.colors.textPrimary,
  },
  closeBtn: {
    marginTop: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: n.radius.sm,
    backgroundColor: whiteAlpha['3'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.border,
  },
  closeBtnText: {
    color: n.colors.textMuted,
    fontWeight: '600',
    fontSize: 13,
  },
  renameSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 16,
    shadowColor: n.colors.background,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 20,
  },
  renameTitle: {
    ...n.typography.sectionTitle,
    color: n.colors.textPrimary,
    textAlign: 'center',
  },
  renameInput: {
    backgroundColor: whiteAlpha['4'],
    borderRadius: n.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['10'],
    color: n.colors.textPrimary,
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
    borderRadius: n.radius.sm,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: whiteAlpha['4'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.border,
  },
  renameBtnPrimary: {
    backgroundColor: n.colors.accent,
    borderColor: n.colors.accent,
    shadowColor: '#5E6AD2',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  renameBtnText: {
    color: n.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  renameBtnTextPrimary: {
    color: n.colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  contentWrap: {
    flex: 1,
    paddingHorizontal: 10,
    paddingBottom: 8,
    gap: 0,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginHorizontal: 4,
    marginTop: 4,
    borderRadius: 16,
    backgroundColor: whiteAlpha['2'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
  },
  bannerIcon: {
    marginTop: 0,
  },
  infoText: {
    ...n.typography.caption,
    color: n.colors.textSecondary,
    flex: 1,
  },
  chatSurface: {
    flex: 1,
    borderRadius: 24,
    backgroundColor: whiteAlpha['1.5'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['6'],
    marginTop: 6,
    overflow: 'hidden',
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 18,
    gap: n.spacing.sm,
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
    backgroundColor: accentAlpha['10'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentAlpha['25'],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginBottom: 4,
    shadowColor: '#5E6AD2',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
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
    flexShrink: 1,
  },
  bubbleWrapUser: {
    maxWidth: '60%',
    alignSelf: 'flex-end',
  },
  bubbleWrapGuru: {
    maxWidth: '88%',
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
    ...n.typography.caption,
    color: n.colors.textPrimary,
  },
  msgMetaDivider: {
    color: '#66718C',
    fontSize: 11,
  },
  msgMetaText: {
    ...n.typography.meta,
    color: n.colors.textSecondary,
  },
  msgModelPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: accentAlpha['8'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentAlpha['18'],
  },
  msgModelPillText: {
    color: n.colors.accent,
    fontSize: 10,
    fontWeight: '700',
  },
  bubble: {
    alignSelf: 'flex-start',
    minWidth: 0,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  userBubble: {
    backgroundColor: accentAlpha['14'],
    borderColor: accentAlpha['35'],
    borderBottomRightRadius: 6,
    shadowColor: '#5E6AD2',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  guruBubble: {
    backgroundColor: whiteAlpha['3'],
    borderColor: whiteAlpha['8'],
    borderBottomLeftRadius: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: whiteAlpha['12'],
  },
  typingBubble: {
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  bubbleText: {
    ...n.typography.body,
    color: n.colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    includeFontPadding: false,
    flexShrink: 1,
    paddingRight: 4,
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
    ...n.typography.body,
    color: n.colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    minWidth: 0,
    includeFontPadding: false,
    paddingRight: 4,
  },
  guruStrongText: {
    color: n.colors.accent,
    fontWeight: '800',
  },
  userBubbleText: {
    color: n.colors.textPrimary,
    fontWeight: '600',
    paddingRight: 4,
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
    backgroundColor: whiteAlpha['3'],
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['10'],
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  imageActionChipBusy: {
    opacity: 0.7,
  },
  imageActionText: {
    color: n.colors.accent,
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
    borderRadius: 16,
    backgroundColor: n.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.border,
    shadowColor: n.colors.background,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
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
    borderRadius: n.radius.md,
    backgroundColor: whiteAlpha['2'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.border,
    overflow: 'hidden',
  },
  sourcesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: accentAlpha['4'],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: n.colors.border,
  },
  sourcesLabel: {
    color: n.colors.accent,
    fontSize: 12,
    fontWeight: '800',
  },
  sourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: n.colors.border,
  },
  sourceNumBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: `${n.colors.accent}16`,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${n.colors.accent}33`,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sourceNum: {
    color: n.colors.accent,
    fontSize: 11,
    fontWeight: '800',
  },
  sourceImage: {
    width: 36,
    height: 36,
    borderRadius: 10,
    flexShrink: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
    backgroundColor: n.colors.surfaceHover,
  },
  sourceBodyPress: {
    flex: 1,
    minWidth: 0,
  },
  sourceTitle: {
    color: n.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  sourceMeta: {
    color: n.colors.textMuted,
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
    color: n.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  responseActionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: n.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.borderHighlight,
  },
  responseActionBtnActive: {
    backgroundColor: `${n.colors.accent}16`,
    borderColor: `${n.colors.accent}52`,
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
    backgroundColor: n.colors.accent,
  },
  dotStatic: {
    opacity: 0.55,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  emptyPanel: {
    borderRadius: n.radius.lg,
    padding: 20,
    backgroundColor: whiteAlpha['2'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.border,
    gap: 20,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroCopy: {
    flex: 1,
  },
  guruAvatarLarge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${n.colors.accent}16`,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${n.colors.accent}52`,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#5E6AD2',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  emptyTitle: {
    ...n.typography.title,
    color: n.colors.textPrimary,
    fontSize: 22,
  },
  emptyHint: {
    ...n.typography.bodySmall,
    color: n.colors.textMuted,
    lineHeight: 20,
    marginTop: 4,
  },
  sessionSummaryInline: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: n.radius.md,
    backgroundColor: whiteAlpha['2'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.border,
  },
  sessionSummaryInlineText: {
    ...n.typography.caption,
    color: n.colors.textSecondary,
    lineHeight: 19,
  },
  starterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  starterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: n.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.border,
    backgroundColor: whiteAlpha['2'],
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexBasis: '47%',
    flexGrow: 1,
  },
  starterIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: accentAlpha['10'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentAlpha['20'],
  },
  starterChipText: {
    color: n.colors.textSecondary,
    fontSize: 12,
    flex: 1,
    lineHeight: 17,
    fontWeight: '500',
  },
  composerWrap: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: n.radius.lg,
    backgroundColor: whiteAlpha['2.5'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.border,
    marginHorizontal: 4,
    marginBottom: 4,
  },
  quickActionsCenterWrap: {
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  composerToolsWrap: {
    gap: 4,
  },
  quickActionsCenter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    maxWidth: '96%',
  },
  quickActionChip: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['10'],
    backgroundColor: whiteAlpha['3'],
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  quickActionChipDisabled: {
    opacity: 0.4,
  },
  quickActionText: {
    color: n.colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  modelIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: whiteAlpha['4'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['10'],
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 2,
    flexShrink: 0,
  },
  modelDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: n.colors.accent,
    shadowColor: '#5E6AD2',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  input: {
    flex: 1,
    minHeight: 42,
    color: n.colors.textPrimary,
    fontSize: 15,
    lineHeight: 20,
    paddingHorizontal: 4,
    paddingVertical: 8,
    textAlignVertical: 'center',
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: n.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#5E6AD2',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  sendBtnDisabled: {
    backgroundColor: whiteAlpha['4'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.border,
    shadowOpacity: 0,
    elevation: 0,
  },
});
