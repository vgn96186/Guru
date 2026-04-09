import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  StatusBar,
  Alert,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { chatWithGuru, fetchChatRelevantImage } from '../services/aiService';
import { markTopicDiscussedInChat } from '../db/queries/topics';
import { useAppStore } from '../store/useAppStore';
import { buildBoundedGuruChatStudyContext } from '../services/guruChatStudyContext';
import { linearTheme as n } from '../theme/linearTheme';
import { MarkdownRender } from './MarkdownRender';

interface ChatMessage {
  role: 'user' | 'guru';
  text: string;
}

interface Props {
  visible: boolean;
  topicName: string;
  /** Optional syllabus leaf topic id for disambiguation in the prompt. */
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
  const profile = useAppStore((s) => s.profile);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  // imageUrls[msgIndex] = resolved image URL for that Guru message (fetched fresh from Brave)
  const [chatImages, setChatImages] = useState<Record<number, string>>({});

  const scrollRef = useRef<ScrollView>(null);
  const isMountedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasPersistedTopicProgressRef = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(300)).current;
  const pulseAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const slideAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  // Track if component is mounted to prevent state updates after unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Cleanup animations and abort controller on unmount
  useEffect(() => {
    return () => {
      if (pulseAnimationRef.current) {
        pulseAnimationRef.current.stop();
      }
      if (slideAnimationRef.current) {
        slideAnimationRef.current.stop();
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Handle animations when visibility changes
  useEffect(() => {
    if (visible) {
      // Reset animations
      slideAnim.setValue(300);
      pulseAnim.setValue(1);

      // Slide in animation
      slideAnimationRef.current = Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      });
      slideAnimationRef.current.start();

      // Pulse animation for the indicator
      pulseAnimationRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.4, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        ]),
      );
      pulseAnimationRef.current.start();

      // Reset error state when opening
      setError(null);
      setRetryCount(0);
    } else {
      // Stop animations when closing
      if (pulseAnimationRef.current) {
        pulseAnimationRef.current.stop();
      }
      if (slideAnimationRef.current) {
        slideAnimationRef.current.stop();
      }
      // Abort any in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    }
  }, [visible, slideAnim, pulseAnim]);

  const scrollToEnd = useCallback(() => {
    if (scrollRef.current && isMountedRef.current) {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, []);

  async function handleSend() {
    const q = input.trim();
    if (!q || loading) return;

    // Prevent sending while another request is in flight
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const userMsg: ChatMessage = { role: 'user', text: q };
    const next = [...messages, userMsg];

    // Create new abort controller BEFORE setting loading state to avoid race with visibility effect
    abortControllerRef.current = new AbortController();

    // Update state immediately
    setMessages(next);
    setInput('');
    setLoading(true);
    setError(null);

    scrollToEnd();

    try {
      const dbStudy = await buildBoundedGuruChatStudyContext(profile, syllabusTopicId);
      const topicMeta =
        syllabusTopicId != null ? `Syllabus topic id: ${syllabusTopicId}` : undefined;
      const clippedContext = contextText ? contextText.slice(0, 4000) : undefined;
      const merged = [topicMeta, dbStudy, clippedContext].filter(Boolean).join('\n\n');
      // Pass history WITHOUT the current user message — chatWithGuru appends `q` as its own user message
      const { reply } = await chatWithGuru(
        q,
        topicName,
        messages.slice(-10),
        undefined,
        merged || undefined,
      );

      if (isMountedRef.current) {
        const guruMsgIndex = next.length; // index of the Guru reply about to be added
        setMessages((prev) => [...prev, { role: 'guru', text: reply }]);
        setRetryCount(0);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        scrollToEnd();
        // Fire-and-forget: fetch a relevant image fresh from Brave for this response
        fetchChatRelevantImage(topicName, reply)
          .then((url) => {
            if (url && isMountedRef.current) {
              setChatImages((prev) => ({ ...prev, [guruMsgIndex]: url }));
            }
          })
          .catch(() => {});
      }
      if (syllabusTopicId != null && !hasPersistedTopicProgressRef.current) {
        try {
          await markTopicDiscussedInChat(syllabusTopicId);
          hasPersistedTopicProgressRef.current = true;
        } catch {
          // Progress persistence should not block the conversation flow.
        }
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        if (err.name === 'AbortError') {
          if (__DEV__) console.log('[GuruChatOverlay] Request aborted');
          return;
        }

        const errorMessage = err.message || "Couldn't connect. Try again.";
        setError(errorMessage);
        setRetryCount((prev) => prev + 1);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }

  const handleRetry = useCallback(() => {
    if (messages.length > 0 && messages[messages.length - 1].role === 'user') {
      const lastUserMessage = messages[messages.length - 1].text;
      // Remove the failed user message so it won't duplicate on resend
      setMessages((prev) => prev.slice(0, -1));
      setInput(lastUserMessage);
      setError(null);
    }
  }, [messages]);

  const handleClose = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    Haptics.selectionAsync();
    onClose();
  }, [onClose]);

  // Clear input when modal closes
  useEffect(() => {
    if (!visible) {
      setInput('');
      setError(null);
      setChatImages({});
      hasPersistedTopicProgressRef.current = false;
    }
  }, [visible]);

  useEffect(() => {
    hasPersistedTopicProgressRef.current = false;
  }, [syllabusTopicId, topicName]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      accessibilityViewIsModal
    >
      <StatusBar barStyle="light-content" />
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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.kvWrapper}
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
                <Text style={s.headerTitle}>Study Guru</Text>
                <Text style={s.headerSub} numberOfLines={1} ellipsizeMode="tail">
                  {topicName}
                </Text>
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

          <ScrollView
            ref={scrollRef}
            style={s.messages}
            contentContainerStyle={s.messagesContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {messages.length === 0 && (
              <View style={s.emptyContainer}>
                <View style={s.emptyIconCircle}>
                  <Ionicons name="sparkles" size={32} color={n.colors.accent} />
                </View>
                <Text style={s.emptyTitle}>Ask anything about this topic</Text>
                <Text style={s.emptyHint}>
                  Guru can explain concepts, quiz you, or help clarify tricky points.
                </Text>
              </View>
            )}

            {messages.map((msg, i) => (
              <View
                key={`${msg.role}-${i}-${msg.text.slice(0, 20)}`}
                style={[s.bubbleContainer, msg.role === 'user' ? s.userContainer : s.guruContainer]}
              >
                {msg.role === 'guru' && (
                  <View style={[s.avatar, s.guruAvatar]}>
                    <Text style={s.avatarText}>G</Text>
                  </View>
                )}
                <View
                  style={[
                    s.bubble,
                    msg.role === 'user' ? s.userBubble : s.guruBubble,
                    msg.role === 'user' ? s.userBubbleTail : s.guruBubbleTail,
                  ]}
                >
                  {msg.role === 'guru' ? (
                    <>
                      <MarkdownRender content={msg.text} />
                      {chatImages[i] ? (
                        <Image
                          source={{ uri: chatImages[i] }}
                          style={s.chatImage}
                          resizeMode="contain"
                          accessibilityLabel="Relevant medical image"
                        />
                      ) : null}
                    </>
                  ) : (
                    <Text style={s.userBubbleText}>{msg.text}</Text>
                  )}
                </View>
                {msg.role === 'user' && (
                  <View style={[s.avatar, s.userAvatar]}>
                    <Ionicons name="person" size={16} color="#fff" />
                  </View>
                )}
              </View>
            ))}

            {loading && (
              <View style={s.guruContainer}>
                <View style={[s.avatar, s.guruAvatar]}>
                  <ActivityIndicator size="small" color={n.colors.accent} />
                </View>
                <View style={[s.bubble, s.guruBubble, s.loadingBubble]}>
                  <View style={s.typingIndicator}>
                    <Animated.View style={[s.typingDot, { opacity: pulseAnim }]} />
                    <Animated.View style={[s.typingDot, { opacity: pulseAnim }]} />
                    <Animated.View style={[s.typingDot, { opacity: pulseAnim }]} />
                  </View>
                </View>
              </View>
            )}

            {error && !loading && (
              <View style={s.errorContainer}>
                <Text style={s.errorText}>{error}</Text>
                {retryCount > 0 && (
                  <TouchableOpacity
                    style={s.retryBtn}
                    onPress={handleRetry}
                    accessibilityRole="button"
                    accessibilityLabel={`Retry, ${retryCount} attempts left`}
                  >
                    <Text style={s.retryBtnText}>Retry ({retryCount})</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </ScrollView>

          <View style={s.inputWrapper}>
            <View style={s.inputRow}>
              <TextInput
                style={[s.input, error && s.inputError]}
                placeholder="Ask a question..."
                placeholderTextColor={n.colors.textMuted}
                value={input}
                onChangeText={setInput}
                onSubmitEditing={handleSend}
                returnKeyType="send"
                multiline={false}
                maxLength={500}
                editable={!loading}
                importantForAutofill="no"
                autoComplete="off"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[s.sendBtn, (!input.trim() || loading) && s.sendBtnDisabled]}
                onPress={handleSend}
                disabled={!input.trim() || loading}
                accessibilityRole="button"
                accessibilityLabel="Send message"
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons
                    name="arrow-up"
                    size={20}
                    color={!input.trim() ? n.colors.textMuted : n.colors.textPrimary}
                  />
                )}
              </TouchableOpacity>
            </View>
            {error && (
              <Text style={s.inputErrorHint}>
                Connection failed. Check your internet or API keys in Settings.
              </Text>
            )}
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject },
  backdropOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.65)' },
  kvWrapper: { flex: 1, justifyContent: 'flex-end' },
  panel: {
    backgroundColor: 'rgba(5, 5, 5, 0.98)',
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
    shadowColor: '#5E6AD2',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
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
  messages: { flex: 1 },
  messagesContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 48,
    paddingHorizontal: 36,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(94, 106, 210, 0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(94, 106, 210, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#5E6AD2',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  emptyTitle: {
    color: n.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyHint: {
    color: n.colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  bubbleContainer: {
    flexDirection: 'row',
    maxWidth: '85%',
    alignItems: 'flex-end',
    position: 'relative',
  },
  userContainer: {
    alignSelf: 'flex-end',
    justifyContent: 'flex-end',
  },
  guruContainer: {
    alignSelf: 'flex-start',
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  guruAvatar: {
    backgroundColor: 'rgba(94, 106, 210, 0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(94, 106, 210, 0.3)',
    shadowColor: '#5E6AD2',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  userAvatar: {
    backgroundColor: 'rgba(94, 106, 210, 0.2)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(94, 106, 210, 0.35)',
  },
  avatarText: {
    color: n.colors.accent,
    fontSize: 13,
    fontWeight: '900',
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  userBubble: {
    backgroundColor: 'rgba(94, 106, 210, 0.14)',
    borderColor: 'rgba(94, 106, 210, 0.35)',
    borderBottomRightRadius: 6,
    borderTopRightRadius: 18,
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
    shadowColor: '#5E6AD2',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  guruBubble: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomLeftRadius: 6,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
  },
  userBubbleTail: {},
  guruBubbleTail: {},
  chatImage: {
    width: '100%',
    height: 180,
    borderRadius: 10,
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  userBubbleText: {
    color: n.colors.textPrimary,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    minWidth: 80,
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: n.colors.accent,
    opacity: 0.6,
  },

  errorContainer: {
    alignSelf: 'center',
    backgroundColor: 'rgba(241, 76, 76, 0.08)',
    padding: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(241, 76, 76, 0.2)',
    marginVertical: 8,
    alignItems: 'center',
    maxWidth: '90%',
  },
  errorText: {
    color: n.colors.error,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
  },
  retryBtn: {
    backgroundColor: n.colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
    shadowColor: '#5E6AD2',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  retryBtnText: {
    color: n.colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },

  inputWrapper: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 32 : 18,
    backgroundColor: 'transparent',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.025)',
    borderRadius: 22,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  input: {
    flex: 1,
    color: n.colors.textPrimary,
    fontSize: 15,
    maxHeight: 100,
    paddingVertical: 8,
  },
  inputError: {
    borderColor: 'rgba(241, 76, 76, 0.4)',
  },
  inputErrorHint: {
    color: n.colors.error,
    fontSize: 11,
    marginTop: 4,
    marginLeft: 14,
  },
  sendBtn: {
    backgroundColor: n.colors.accent,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#5E6AD2',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  sendBtnDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    shadowOpacity: 0,
    elevation: 0,
  },
});
