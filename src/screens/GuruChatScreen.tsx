import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import Clipboard from '@react-native-clipboard/clipboard';
import type { ChatStackParamList } from '../navigation/types';
import { ResponsiveContainer } from '../hooks/useResponsive';
import {
  chatWithGuruGrounded,
  type MedicalGroundingSource,
  GROQ_MODELS,
  OPENROUTER_FREE_MODELS,
  getApiKeys,
} from '../services/aiService';
import { useAppStore } from '../store/useAppStore';
import { clearChatHistory, getChatHistory, saveChatMessage } from '../db/queries/aiCache';
import { getDb } from '../db/database';
import { getLocalLlmRamWarning, isLocalLlmAllowedOnThisDevice } from '../services/deviceMemory';
import { theme } from '../constants/theme';
import { MarkdownRender } from '../components/MarkdownRender';

type Nav = NativeStackNavigationProp<ChatStackParamList, 'GuruChat'>;
type ScreenRoute = RouteProp<ChatStackParamList, 'GuruChat'>;

type ChatMessage = {
  id: string;
  role: 'user' | 'guru';
  text: string;
  sources?: MedicalGroundingSource[];
  modelUsed?: string;
  searchQuery?: string;
  timestamp: number;
};

type ModelOption = {
  id: string;
  name: string;
  group: 'Local' | 'Groq' | 'OpenRouter';
};

type ChatItem =
  | { id: string; type: 'message'; message: ChatMessage }
  | { id: string; type: 'typing' };

function getStartersForTopic(topicName: string) {
  return [
    { icon: 'book-outline', text: `Let's discuss ${topicName}. Ask me something.` },
    { icon: 'help-circle-outline', text: `Quiz me on ${topicName}.` },
    { icon: 'bulb-outline', text: `Walk me through ${topicName} step by step.` },
    { icon: 'list-outline', text: `Test my understanding of ${topicName}.` },
    { icon: 'alert-circle-outline', text: `I'm fuzzy on ${topicName}. Start from the basics.` },
    { icon: 'medkit-outline', text: `What should I know about ${topicName} for the exam?` },
  ];
}

const FALLBACK_STARTERS = [
  { icon: 'book-outline', text: 'Pick a high-yield topic and quiz me.' },
  { icon: 'help-circle-outline', text: 'Test my understanding of something important.' },
  { icon: 'bulb-outline', text: 'Walk me through a clinical scenario.' },
  { icon: 'list-outline', text: "Start with something I probably don't know well." },
  { icon: 'alert-circle-outline', text: 'Quiz me on pharmacology.' },
  { icon: 'medkit-outline', text: 'Ask me about a common exam topic.' },
];

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
       LIMIT 6`,
    );
    if (rows.length < 3) return FALLBACK_STARTERS;
    const icons = [
      'book-outline',
      'help-circle-outline',
      'bulb-outline',
      'list-outline',
      'alert-circle-outline',
      'medkit-outline',
    ];
    const templates = [
      (n: string) => `Let's discuss ${n}. Ask me something.`,
      (n: string) => `Quiz me on ${n}.`,
      (n: string) => `Walk me through ${n} step by step.`,
      (n: string) => `Test my understanding of ${n}.`,
      (n: string) => `I'm fuzzy on ${n}. Start from the basics.`,
      (n: string) => `What should I know about ${n} for the exam?`,
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
  const dots = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

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
function FormattedGuruMessage({ text }: { text: string }) {
  return <MarkdownRender content={text} />;
}

export default function GuruChatScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<ScreenRoute>();
  const topicName = route.params?.topicName ?? 'General Medicine';
  const { profile } = useAppStore();
  const flatListRef = useRef<FlatList<ChatItem>>(null);

  const isGeneralChat = !route.params?.topicName || topicName === 'General Medicine';
  const [starters, setStarters] = useState(
    isGeneralChat ? FALLBACK_STARTERS : getStartersForTopic(topicName),
  );

  useEffect(() => {
    if (isGeneralChat) {
      getDynamicStarters().then(setStarters);
    }
  }, [isGeneralChat]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState(route.params?.initialQuestion ?? '');
  const [loading, setLoading] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(true);
  const [chosenModel, setChosenModel] = useState<string>('auto');
  const [showModelPicker, setShowModelPicker] = useState(false);
  const localLlmWarning = getLocalLlmRamWarning();

  useEffect(() => {
    if (topicName && topicName !== 'General Medicine') {
      void getChatHistory(topicName, 20)
        .then((history) => {
          if (history.length > 0) {
            setMessages(
              history.map((entry) => ({
                id: `hist-${entry.id}`,
                role: entry.role,
                text: entry.message,
                timestamp: entry.timestamp,
              })),
            );
            setBannerVisible(false);
          }
        })
        .catch(() => {
          // Ignore DB failures and keep the chat usable.
        });
    }
  }, [topicName]);

  const availableModels = useMemo(() => {
    const { orKey, groqKey } = getApiKeys(profile ?? undefined);
    const list: ModelOption[] = [{ id: 'auto', name: 'Auto Route (Smart)', group: 'Local' }];

    if (profile?.useLocalModel && profile?.localModelPath && isLocalLlmAllowedOnThisDevice()) {
      list.push({ id: 'local', name: 'On-Device LLM', group: 'Local' });
    }

    if (groqKey) {
      GROQ_MODELS.forEach((model) => {
        const name = model.includes('/')
          ? model.split('/').pop()!.replace(/-/g, ' ').toUpperCase()
          : model.split('-').slice(0, 2).join(' ').toUpperCase();
        list.push({ id: `groq/${model}`, name, group: 'Groq' });
      });
    }

    if (orKey) {
      OPENROUTER_FREE_MODELS.forEach((model) => {
        list.push({
          id: model,
          name: model.split('/')[1].split(':')[0].toUpperCase(),
          group: 'OpenRouter',
        });
      });
    }

    return list;
  }, [profile]);

  useEffect(() => {
    if (chosenModel === 'local' && !availableModels.some((model) => model.id === 'local')) {
      setChosenModel('auto');
    }
  }, [availableModels, chosenModel]);

  const currentModelName = useMemo(() => {
    const found = availableModels.find((model) => model.id === chosenModel);
    return found ? found.name : 'Auto';
  }, [availableModels, chosenModel]);

  const modelHistory = useMemo(
    () => messages.map((message) => ({ role: message.role, text: message.text })),
    [messages],
  );

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
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
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

  async function copyMessage(text: string) {
    Clipboard.setString(text);
    Alert.alert('Copied', 'Message copied to clipboard.');
  }

  async function handleSend(questionOverride?: string) {
    const question = (questionOverride ?? input).trim();
    if (!question || loading) return;

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
      await saveChatMessage(topicName, 'user', question, Date.now());
    } catch {
      // Persistence should not block the main conversation flow.
    }

    try {
      const grounded = await chatWithGuruGrounded(
        question,
        topicName,
        nextHistory,
        chosenModel === 'auto' ? undefined : chosenModel,
      );
      const guruTs = Date.now();
      setMessages((current) => [
        ...current,
        {
          id: `g-${guruTs}`,
          role: 'guru',
          text: grounded.reply,
          sources: grounded.sources,
          modelUsed: grounded.modelUsed,
          searchQuery: grounded.searchQuery,
          timestamp: guruTs,
        },
      ]);
      try {
        await saveChatMessage(topicName, 'guru', grounded.reply, guruTs);
      } catch {
        // Ignore persistence issues here too.
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

  function startNewChat() {
    if (messages.length > 0) {
      Alert.alert('New chat', 'Start a new conversation? Current messages will be cleared.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'New chat',
          onPress: async () => {
            setMessages([]);
            setBannerVisible(true);
            try {
              await clearChatHistory(topicName);
            } catch {
              // Ignore DB cleanup failures.
            }
          },
        },
      ]);
    } else {
      setMessages([]);
      setBannerVisible(true);
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
            <View style={[styles.bubble, styles.guruBubble, styles.typingBubble]}>
              <TypingDots />
            </View>
          </View>
        );
      }

      const { message } = item;
      return (
        <View
          style={[styles.msgRow, message.role === 'user' ? styles.msgRowUser : styles.msgRowGuru]}
        >
          {message.role === 'guru' ? (
            <View style={styles.guruAvatarTiny}>
              <Ionicons name="sparkles" size={11} color={theme.colors.primary} />
            </View>
          ) : null}

          <View style={styles.msgContent}>
            <Pressable onLongPress={() => copyMessage(message.text)} delayLongPress={400}>
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

            <Text style={[styles.timestamp, message.role === 'user' && styles.timestampRight]}>
              {formatTime(message.timestamp)}
              {message.role === 'guru' && message.modelUsed
                ? `  ·  ${message.modelUsed.split('/').pop()}`
                : ''}
            </Text>

            {message.role === 'guru' && message.sources && message.sources.length > 0 ? (
              <View style={styles.sourcesWrap}>
                <View style={styles.sourcesHeader}>
                  <Ionicons name="documents-outline" size={13} color={theme.colors.primary} />
                  <Text style={styles.sourcesLabel}>Sources ({message.sources.length})</Text>
                </View>
                {message.sources.map((source, index) => (
                  <Pressable
                    key={`${message.id}-${source.id}`}
                    style={({ pressed }) => [styles.sourceCard, pressed && styles.pressed]}
                    android_ripple={{ color: `${theme.colors.primary}22` }}
                    onPress={() => openSource(source.url)}
                  >
                    <View style={styles.sourceNumBadge}>
                      <Text style={styles.sourceNum}>{index + 1}</Text>
                    </View>
                    {source.imageUrl ? (
                      <Image source={{ uri: source.imageUrl }} style={styles.sourceImage} />
                    ) : null}
                    <View style={styles.sourceBody}>
                      <Text style={styles.sourceTitle} numberOfLines={2}>
                        {source.title}
                      </Text>
                      <Text style={styles.sourceMeta}>
                        {source.source}
                        {source.publishedAt ? `  ·  ${source.publishedAt}` : ''}
                      </Text>
                    </View>
                    <Ionicons name="open-outline" size={13} color={theme.colors.textMuted} />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      );
    },
    [copyMessage],
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ResponsiveContainer style={styles.flex}>
          <View style={styles.header}>
            {navigation.canGoBack() ? (
              <Pressable
                style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
                android_ripple={{ color: '#ffffff14', radius: 22 }}
                onPress={() => navigation.goBack()}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <Ionicons name="arrow-back" size={22} color="#AEB5C4" />
              </Pressable>
            ) : (
              <View style={styles.iconBtn} />
            )}

            <View style={styles.headerCenter}>
              <View style={styles.guruAvatarSmall}>
                <Ionicons name="sparkles" size={14} color={theme.colors.primary} />
              </View>
              <Pressable
                style={({ pressed }) => [styles.modelSelector, pressed && styles.pressed]}
                onPress={() => setShowModelPicker(true)}
              >
                <View>
                  <Text style={styles.title}>Guru Chat</Text>
                  <View style={styles.modelBadge}>
                    <Text style={styles.modelBadgeText}>{currentModelName}</Text>
                    <Ionicons name="chevron-down" size={10} color={theme.colors.primary} />
                  </View>
                </View>
              </Pressable>
            </View>

            <Pressable
              style={({ pressed }) => [styles.newChatBtn, pressed && styles.pressed]}
              android_ripple={{ color: '#ffffff14', radius: 22 }}
              onPress={startNewChat}
              accessibilityRole="button"
              accessibilityLabel="New chat"
            >
              <Ionicons name="create-outline" size={20} color={theme.colors.primary} />
              <Text style={styles.newChatBtnText}>New chat</Text>
            </Pressable>
          </View>

          {showModelPicker ? (
            <View style={styles.sheetOverlay} pointerEvents="box-none">
              <Pressable style={styles.sheetBackdrop} onPress={() => setShowModelPicker(false)} />
              <View style={styles.sheetContent}>
                <Text style={styles.sheetTitle}>Choose Brain</Text>
                {localLlmWarning ? <Text style={styles.warningText}>{localLlmWarning}</Text> : null}
                <FlatList
                  data={['Local', 'Groq', 'OpenRouter']}
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
                                        setChosenModel(model.id);
                                        setShowModelPicker(false);
                                      },
                                    },
                                  ],
                                );
                              } else {
                                setChosenModel(model.id);
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

          {bannerVisible ? (
            <View style={styles.infoBanner}>
              <Ionicons
                name="library-outline"
                size={14}
                color={theme.colors.primary}
                style={styles.bannerIcon}
              />
              <Text style={styles.infoText}>
                Grounded with Wikipedia, Europe PMC and PubMed. Sources cited inline.
              </Text>
              <Pressable onPress={() => setBannerVisible(false)} hitSlop={8}>
                <Ionicons name="close" size={14} color={theme.colors.textMuted} />
              </Pressable>
            </View>
          ) : null}

          {messages.length === 0 && !loading ? (
            <View style={styles.emptyWrap}>
              <View style={styles.guruAvatarLarge}>
                <Ionicons name="sparkles" size={32} color={theme.colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>What do you want to know?</Text>
              <Text style={styles.emptyHint}>Try a question or pick a prompt below.</Text>
              <View style={styles.starterGrid}>
                {starters.map((starter) => (
                  <Pressable
                    key={starter.text}
                    style={({ pressed }) => [styles.starterChip, pressed && styles.pressed]}
                    android_ripple={{ color: `${theme.colors.primary}22` }}
                    onPress={() => handleSend(starter.text)}
                    disabled={loading}
                  >
                    <Ionicons
                      name={starter.icon as keyof typeof Ionicons.glyphMap}
                      size={16}
                      color={theme.colors.primary}
                      style={styles.starterIcon}
                    />
                    <Text style={styles.starterChipText}>{starter.text}</Text>
                  </Pressable>
                ))}
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
              inverted
              maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            />
          )}

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Ask a medical question..."
              placeholderTextColor={theme.colors.textMuted}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => handleSend()}
              returnKeyType="send"
              multiline
              maxLength={1000}
            />
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
              <Ionicons name="send" size={18} color={theme.colors.textPrimary} />
            </Pressable>
          </View>
        </ResponsiveContainer>
      </KeyboardAvoidingView>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: 40,
    borderRadius: 20,
  },
  newChatBtnText: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
  },
  guruAvatarSmall: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.colors.primaryTint,
    borderWidth: 1,
    borderColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  modelSelector: {
    flex: 1,
    paddingVertical: 2,
  },
  modelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  modelBadgeText: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
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
    color: '#555B78',
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
    borderRadius: 12,
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
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: 12,
    marginVertical: 8,
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  bannerIcon: {
    marginTop: 1,
  },
  infoText: {
    color: theme.colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 16,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  msgRowUser: {
    flexDirection: 'row-reverse',
  },
  msgRowGuru: {},
  guruAvatarTiny: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primaryTint,
    borderWidth: 1,
    borderColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginBottom: 2,
  },
  msgContent: {
    flex: 1,
    maxWidth: '88%',
  },
  bubble: {
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
  },
  userBubble: {
    backgroundColor: theme.colors.primaryTint,
    borderColor: theme.colors.primaryDark,
    borderBottomRightRadius: 4,
  },
  guruBubble: {
    backgroundColor: theme.colors.inputBg,
    borderColor: theme.colors.border,
    borderBottomLeftRadius: 4,
  },
  typingBubble: {
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  bubbleText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
  },
  userBubbleText: {
    color: theme.colors.textPrimary,
  },
  guruFormattedWrap: {
    gap: 2,
  },
  guruParagraph: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 24,
  },
  guruParagraphGap: {
    height: 10,
  },
  guruBold: {
    color: theme.colors.textPrimary,
    fontWeight: '700',
  },
  guruCitation: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  guruListRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
    paddingLeft: 4,
  },
  guruListMarker: {
    color: theme.colors.primary,
    fontSize: 15,
    lineHeight: 24,
    marginRight: 8,
    fontWeight: '600',
  },
  guruListText: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 24,
  },
  timestamp: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginTop: 4,
    marginLeft: 2,
  },
  timestampRight: {
    textAlign: 'right',
    marginRight: 2,
  },
  sourcesWrap: {
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  sourcesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  sourcesLabel: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  sourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  sourceNumBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sourceNum: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  sourceImage: {
    width: 32,
    height: 32,
    borderRadius: 6,
    flexShrink: 0,
    backgroundColor: theme.colors.surfaceAlt,
  },
  sourceBody: {
    flex: 1,
  },
  sourceTitle: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  sourceMeta: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    backgroundColor: theme.colors.background,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: theme.colors.inputBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    color: theme.colors.textPrimary,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: theme.colors.cardHover,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  guruAvatarLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.primaryTint,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptyHint: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginBottom: 20,
  },
  starterGrid: {
    width: '100%',
    gap: 8,
  },
  starterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.inputBg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 56,
  },
  starterIcon: {
    flexShrink: 0,
  },
  starterChipText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
});
