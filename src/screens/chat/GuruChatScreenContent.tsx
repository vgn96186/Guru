import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  InteractionManager,
  Keyboard,
  Linking,
  StatusBar,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { type FlashListRef } from '@shopify/flash-list';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { ImageLightbox } from '../../components/ImageLightbox';
import { SafeAreaView } from 'react-native-safe-area-context';
import Clipboard from '@react-native-clipboard/clipboard';
import { ResponsiveContainer } from '../../hooks/useResponsive';
import ScreenMotion from '../../motion/ScreenMotion';
import { RevealSection } from '../GuruChatRevealSection';
import { shouldShowGuruChatSkeleton } from '../guruChatLoadingState';
import { addLlmStateListener } from '../../services/aiService';
import { showInfo, showError, confirm, confirmDestructive } from '../../components/dialogService';
import { useProfileQuery } from '../../hooks/queries/useProfile';

import { ChatNav } from '../../navigation/typedHooks';
// === REFACTOR: New Hooks (Phase 1 & 3) ===
import { useGuruChatSession } from '../../hooks/useGuruChatSession';
import { useGuruChatModels } from '../../hooks/useGuruChatModels';
import { useGuruChat } from '../../hooks/useGuruChat';
// =========================================

// === REFACTOR: New Components (Phase 2) ===
import { GuruChatHistoryDrawer } from '../../components/chat/GuruChatHistoryDrawer';
import { GuruChatRenameSheet } from '../../components/chat/GuruChatRenameSheet';
import { GuruChatModelSelector } from '../../components/chat/GuruChatModelSelector';
import { GuruChatMessageList } from '../../components/chat/GuruChatMessageList';
import { GuruChatInput } from '../../components/chat/GuruChatInput';
// ========================================

import {
  getChatHistory,
  getOrCreateLatestGuruChatThread,
  type GuruChatThread,
} from '../../db/queries/aiCache';
import { getSessionMemoryRow } from '../../db/queries/guruChatMemory';
import { getLocalLlmRamWarning } from '../../services/deviceMemory';
import { linearTheme as n } from '../../theme/linearTheme';
import {
  listGeneratedStudyImagesForTopic,
  type GeneratedStudyImageRecord,
  type GeneratedStudyImageStyle,
} from '../../db/queries/generatedStudyImages';
import { buildChatImageContextKey, generateStudyImage } from '../../services/studyImageService';
import { buildBoundedGuruChatStudyContext } from '../../services/guruChatStudyContext';
import type { ChatItem, ChatMessage } from '../../types/chat';
import {
  isExplicitImageRequest,
  inferRequestedImageStyle,
  canAutoGenerateStudyImage,
  getLastUserPrompt,
} from '../../services/ai/imageIntent';
import { getStartersForTopic, getDynamicStarters, FALLBACK_STARTERS } from './chatHelpers';
import { GuruChatHeader, GuruChatInfoBanner, GuruChatSkeletonFrame } from './GuruChatScreenChrome';

const CHAT_HISTORY_LIMIT = 100;
const GURU_CHAT_SCREEN_MOTION_TRIGGER = 'first-mount' as const;

export default function GuruChatScreenContent() {
  const navigation = ChatNav.useNav<'GuruChat'>();
  const route = ChatNav.useRoute<'GuruChat'>();
  const { width: viewportWidth } = useWindowDimensions();
  const topicName = route.params?.topicName ?? 'General Medicine';
  const syllabusTopicId = route.params?.topicId;
  const requestedThreadId = route.params?.threadId;
  const groundingTitle = route.params?.groundingTitle;
  const groundingContext = route.params?.groundingContext;
  const profileQuery = useProfileQuery();
  const profile = profileQuery?.data;

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
      const { createGuruFallbackModel } = require('../../services/ai/v2');
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
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err);
      setMessages((current) => [
        ...current,
        {
          id: `g-err-${Date.now()}`,
          role: 'guru',
          text: `⚠️ Error: ${message}`,
          timestamp: Date.now(),
        },
      ]);
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
    let cancelled = false;
    if (!currentThreadId) {
      setSessionSummary('');
      setSessionStateJson('{}');
      setIsHydratingHistory(false);
      return () => {
        cancelled = true;
      };
    }
    setIsHydratingHistory(true);
    void getSessionMemoryRow(currentThreadId).then((r) => {
      if (!cancelled) {
        setSessionSummary(r?.summaryText ?? '');
        setSessionStateJson(r?.stateJson ?? '{}');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [currentThreadId]);

  useEffect(() => {
    let cancelled = false;
    if (!currentThread) {
      setMessages([]);
      setIsHydratingHistory(false);
      return () => {
        cancelled = true;
      };
    }
    void Promise.all([
      getChatHistory(currentThread.id, CHAT_HISTORY_LIMIT),
      Promise.resolve(listGeneratedStudyImagesForTopic('chat', currentThread.topicName)).catch(
        () => [],
      ),
    ])
      .then(([history, images]) => {
        if (cancelled) return;
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
        if (cancelled) return;
        // Ignore DB failures and keep the chat usable.
        setMessages([]);
        setIsHydratingHistory(false);
      });
    return () => {
      cancelled = true;
    };
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
    return <GuruChatSkeletonFrame />;
  }

  return (
    // eslint-disable-next-line guru/prefer-screen-shell -- SafeAreaView needed here
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']} testID="guru-chat-screen">
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <View style={styles.flex}>
        <ScreenMotion
          style={styles.flex}
          trigger={GURU_CHAT_SCREEN_MOTION_TRIGGER}
          isEntryComplete={() => setEntryComplete(true)}
        >
          <KeyboardAvoidingView
            style={styles.flex}
            behavior="padding"
            keyboardVerticalOffset={0}
            enabled={!lightboxUri}
          >
            <ResponsiveContainer style={styles.flex}>
              <RevealSection active={entryComplete} delayMs={0}>
                <GuruChatHeader
                  canGoBack={navigation.canGoBack()}
                  onBackPress={() => navigation.goBack()}
                  onOpenHistory={() => setShowHistoryDrawer(true)}
                  onNewChat={startNewChat}
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
                  {bannerVisible && messages.length > 0 ? (
                    <GuruChatInfoBanner onDismiss={() => setBannerVisible(false)} />
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
                  />
                </View>
              </RevealSection>

              {!lightboxUri && entryComplete ? (
                <View style={styles.keyboardComposerBar}>
                  <GuruChatInput
                    input={input}
                    onChangeText={setInput}
                    onSend={handleSend}
                    onModelPress={() => setShowModelPicker(true)}
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
  /** Floating composer bar with solid background for visibility. */
  keyboardComposerBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: n.colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  contentWrap: {
    flex: 1,
    paddingHorizontal: 10,
    paddingBottom: 8,
    gap: 0,
  },
});
