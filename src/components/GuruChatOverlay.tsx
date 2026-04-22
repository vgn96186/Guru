import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
  Linking,
  Animated,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import { type FlashListRef } from '@shopify/flash-list';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Clipboard from '@react-native-clipboard/clipboard';
import LinearText from './primitives/LinearText';
import { ImageLightbox } from './ImageLightbox';
import { getApiKeys } from '../services/ai';
import { showInfo, showError, confirm } from './dialogService';
import { useProfileQuery } from '../hooks/queries/useProfile';
import { buildBoundedGuruChatStudyContext } from '../services/guruChatStudyContext';
import { linearTheme as n } from '../theme/linearTheme';
import { motion } from '../motion/presets';
import { addLlmStateListener } from '../services/aiService';
import { getLocalLlmRamWarning } from '../services/deviceMemory';
import { createGuruFallbackModel } from '../services/ai/v2';
import { useGuruChatSession } from '../hooks/useGuruChatSession';
import { useGuruChatModels } from '../hooks/useGuruChatModels';
import { useGuruChat } from '../hooks/useGuruChat';
import { GuruChatMessageList } from './chat/GuruChatMessageList';
import { GuruChatInput } from './chat/GuruChatInput';
import { GuruChatModelSelector } from './chat/GuruChatModelSelector';
import {
  getChatHistory,
  getOrCreateLatestGuruChatThread,
  type GuruChatThread,
} from '../db/queries/aiCache';
import {
  listGeneratedStudyImagesForTopic,
  type GeneratedStudyImageRecord,
  type GeneratedStudyImageStyle,
} from '../db/queries/generatedStudyImages';
import { buildChatImageContextKey, generateStudyImage } from '../services/studyImageService';
import type { ChatItem, ChatMessage } from '../types/chat';
import { shouldShowGuruChatSkeleton } from '../screens/guruChatLoadingState';

const CHAT_HISTORY_LIMIT = 100;

function getStartersForTopic(name: string) {
  return [
    { icon: 'help-circle-outline', text: `Quiz me on ${name}` },
    { icon: 'bulb-outline', text: `Explain ${name} step by step` },
    { icon: 'alert-circle-outline', text: `${name} from the basics` },
    { icon: 'medkit-outline', text: `High-yield points for exam` },
  ];
}

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

interface Props {
  visible: boolean;
  topicName: string;
  syllabusTopicId?: number;
  contextText?: string;
  onClose: () => void;
}

export default function GuruChatOverlay({
  visible,
  topicName,
  syllabusTopicId,
  contextText,
  onClose,
}: Props) {
  const { width: viewportWidth } = useWindowDimensions();
  const { data: profile } = useProfileQuery();
  const [isInitializing, setIsInitializing] = useState(false);
  const [input, setInput] = useState('');
  const [bannerVisible, setBannerVisible] = useState(true);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [imageJobKey, setImageJobKey] = useState<string | null>(null);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [expandedSourcesMessageId, setExpandedSourcesMessageId] = useState<string | null>(null);
  const [currentThread, setCurrentThread] = useState<GuruChatThread | null>(null);
  const [isHydratingHistory, setIsHydratingHistory] = useState(true);
  const [entryComplete] = useState(true);

  const flatListRef = useRef<FlashListRef<ChatItem>>(null);
  const questionInFlightRef = useRef<string | null>(null);
  const isMountedRef = useRef(false);
  const slideAnim = useRef(new Animated.Value(300)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const pulseAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  const guruSession = useGuruChatSession({ topicName, syllabusTopicId });
  const guruModels = useGuruChatModels({ profile });
  const {
    chosenModel,
    pickerTab,
    setPickerTab,
    applyChosenModel: applyGuruModelChoice,
    currentModelLabel,
    currentModelGroup,
  } = guruModels;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    return addLlmStateListener((state) => {
      setIsInitializing(state === 'initializing');
    });
  }, []);

  useEffect(() => {
    if (guruSession.currentThread !== undefined) {
      setCurrentThread(guruSession.currentThread);
    }
  }, [guruSession.currentThread]);

  const currentThreadId = currentThread?.id ?? null;
  const refreshThreads = guruSession.refreshThreads;
  const isHydratingThread = guruSession.isHydratingThread;

  const [sessionSummaryCtx, setSessionSummaryCtx] = useState('');
  const [sessionStateJsonCtx, setSessionStateJsonCtx] = useState('{}');

  useEffect(() => {
    setSessionSummaryCtx(guruSession.sessionSummary);
    setSessionStateJsonCtx(guruSession.sessionStateJson);
  }, [guruSession.sessionSummary, guruSession.sessionStateJson, currentThread?.id]);

  const modelForVercel = useMemo(() => {
    if (!profile) return null;
    try {
      return createGuruFallbackModel({
        profile,
        chosenModel: chosenModel === 'auto' ? undefined : chosenModel,
        textMode: true,
        onProviderError: (provider: string, model: string, error: unknown) => {
          if (__DEV__)
            console.warn(`[GuruChatOverlay] Provider error: ${provider}/${model}`, error);
        },
        onProviderSuccess: (provider: string, model: string) => {
          if (__DEV__) console.log(`[GuruChatOverlay] Provider success: ${provider}/${model}`);
        },
      });
    } catch (error) {
      console.error('[GuruChatOverlay] Failed to create v2 model:', error);
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
      sessionSummary: sessionSummaryCtx,
      sessionStateJson: sessionStateJsonCtx,
      profileNotes: profile?.guruMemoryNotes,
      studyContext: '',
      syllabusTopicId,
    },
    onRefreshThreads: refreshThreads,
    onSessionMemoryUpdated: ({ summaryText, stateJson }) => {
      setSessionSummaryCtx(summaryText);
      setSessionStateJsonCtx(stateJson);
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
      if (__DEV__) console.error('[GuruChatOverlay]', err);
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
    if (!currentThread) {
      setMessages([]);
      setIsHydratingHistory(false);
      return;
    }
    setIsHydratingHistory(true);
    void Promise.all([
      getChatHistory(currentThread.id, CHAT_HISTORY_LIMIT),
      Promise.resolve(listGeneratedStudyImagesForTopic('chat', currentThread.topicName)).catch(
        () => [],
      ),
    ])
      .then(([history, images]) => {
        if (!isMountedRef.current) return;
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
        if (!isMountedRef.current) return;
        setMessages([]);
        setIsHydratingHistory(false);
      });
  }, [currentThread, setMessages]);

  const lastUserPrompt = useMemo(() => getLastUserPrompt(messages), [messages]);
  const chatItems = useMemo<ChatItem[]>(() => {
    const items: ChatItem[] = messages.map((message) => ({
      id: message.id,
      type: 'message',
      message,
    }));
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
      flatListRef.current?.scrollToEnd({ animated: true });
    }, delay);
  }, []);

  useEffect(() => {
    if (messages.length === 0 && !loading) return;
    scrollToLatest(0);
  }, [loading, messages, scrollToLatest]);

  useEffect(() => {
    if (lightboxUri) {
      Keyboard?.dismiss?.();
    }
  }, [lightboxUri]);

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
          guruSession.setCurrentThread(recoveredThread);
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
        const clippedContext = contextText ? contextText.slice(0, 4000) : undefined;
        const mergedStudy =
          [studyContextLine, clippedContext].filter(Boolean).join('\n\n') || undefined;

        const assistantMessage = await guruChat.sendMessage(
          question,
          {
            sessionSummary: sessionSummaryCtx.trim() || undefined,
            sessionStateJson: sessionStateJsonCtx.trim() || undefined,
            profileNotes: profile?.guruMemoryNotes?.trim() || undefined,
            studyContext: mergedStudy,
            syllabusTopicId,
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
      contextText,
      currentThreadId,
      guruChat,
      guruSession,
      input,
      loading,
      profile,
      scrollToLatest,
      sessionStateJsonCtx,
      sessionSummaryCtx,
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

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(300);
      pulseAnim.setValue(1);
      slideAnimationRef.current = Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      });
      slideAnimationRef.current.start();
      pulseAnimationRef.current = motion.pulseValue(pulseAnim, {
        from: 1,
        to: 1.4,
        duration: 1200,
        loop: true,
        useNativeDriver: true,
      });
      pulseAnimationRef.current.start();
    } else {
      pulseAnimationRef.current?.stop();
      slideAnimationRef.current?.stop();
    }
  }, [visible, slideAnim, pulseAnim]);

  const handleClose = useCallback(() => {
    guruChat.stop();
    Haptics.selectionAsync();
    onClose();
  }, [guruChat, onClose]);

  useEffect(() => {
    if (!visible) {
      setInput('');
      setLightboxUri(null);
      setExpandedSourcesMessageId(null);
    }
  }, [visible]);

  const showSkeleton = shouldShowGuruChatSkeleton({
    isHydratingThread,
    isHydratingHistory,
  });

  const starters = useMemo(() => getStartersForTopic(topicName), [topicName]);
  const localLlmWarning = getLocalLlmRamWarning();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      accessibilityViewIsModal
    >
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <TouchableOpacity
        style={s.backdrop}
        activeOpacity={1}
        onPress={handleClose}
        accessibilityRole="button"
        accessibilityLabel="Close chat"
      >
        <View style={s.backdropOverlay} />
      </TouchableOpacity>

      <KeyboardAvoidingView
        style={s.kvWrapper}
        behavior="translate-with-padding"
        enabled={!lightboxUri}
      >
        <Animated.View style={[s.panel, { transform: [{ translateY: slideAnim }] }]}>
          <View style={s.dragHandle} />

          <View style={s.header}>
            <View style={s.headerLeft}>
              <View style={s.pulseContainer}>
                <Animated.View style={[s.dot, { transform: [{ scale: pulseAnim }] }]} />
                <View style={s.innerDot} />
              </View>
              <View style={[s.headerText, { minWidth: 0 }]}>
                <LinearText style={s.headerTitle}>Guru Chat</LinearText>
                <LinearText style={s.headerSub} numberOfLines={1} ellipsizeMode="tail">
                  {topicName}
                </LinearText>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleClose}
              style={s.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close-circle" size={28} color={n.colors.textMuted} />
            </TouchableOpacity>
          </View>

          {showSkeleton ? (
            <View style={s.skeletonWrap}>
              <LinearText tone="muted">Loading conversation…</LinearText>
            </View>
          ) : (
            <View style={s.chatBody}>
              {bannerVisible ? (
                <View style={s.infoBanner}>
                  <Ionicons
                    name="library-outline"
                    size={14}
                    color={n.colors.accent}
                    style={s.bannerIcon}
                  />
                  <LinearText style={s.infoText}>
                    Grounded with Wikipedia, Europe PMC and PubMed. Sources are linked inline.
                  </LinearText>
                  <TouchableOpacity onPress={() => setBannerVisible(false)} hitSlop={8}>
                    <Ionicons name="close" size={14} color={n.colors.textMuted} />
                  </TouchableOpacity>
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
                sessionSummary={sessionSummaryCtx}
                isGeneralChat={false}
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
                onSelectStarter={(text: string) => void handleSend(text)}
                onBannerDismiss={() => setBannerVisible(false)}
              />
            </View>
          )}

          {!lightboxUri && !showSkeleton ? (
            <View style={s.composerBar}>
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
              />
            </View>
          ) : null}
        </Animated.View>
      </KeyboardAvoidingView>

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

      <ImageLightbox
        visible={!!lightboxUri}
        uri={lightboxUri}
        onClose={() => setLightboxUri(null)}
      />
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject },
  backdropOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.65)' },
  kvWrapper: { flex: 1, justifyContent: 'flex-end' },
  panel: {
    backgroundColor: n.colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: '80%',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomWidth: 0,
    shadowColor: n.colors.background,
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.5,
    shadowRadius: 28,
    elevation: 24,
  },
  dragHandle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pulseContainer: {
    width: 14,
    height: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: n.colors.accent,
    opacity: 0.25,
  },
  innerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: n.colors.accent,
    position: 'absolute',
  },
  headerText: { flex: 1 },
  headerTitle: {
    color: n.colors.textPrimary,
    fontWeight: '800',
    fontSize: 17,
    letterSpacing: 0.3,
  },
  headerSub: {
    color: n.colors.accent,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  closeBtn: {
    padding: 4,
  },
  skeletonWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  chatBody: {
    flex: 1,
    minHeight: 0,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(94, 106, 210, 0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(94, 106, 210, 0.2)',
  },
  bannerIcon: { marginTop: 1 },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: n.colors.textSecondary,
    lineHeight: 16,
  },
  composerBar: {
    width: '100%',
    backgroundColor: n.colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
});
