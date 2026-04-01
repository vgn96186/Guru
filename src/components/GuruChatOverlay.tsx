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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { chatWithGuru } from '../services/aiService';
import { markTopicDiscussedInChat } from '../db/queries/topics';
import { useAppStore } from '../store/useAppStore';
import { buildBoundedGuruChatStudyContext } from '../services/guruChatStudyContext';
import { theme } from '../constants/theme';
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
    isMountedRef.current = visible;
    return () => {
      isMountedRef.current = false;
    };
  }, [visible]);

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

    // Update state immediately
    setMessages(next);
    setInput('');
    setLoading(true);
    setError(null);

    scrollToEnd();

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      const dbStudy = await buildBoundedGuruChatStudyContext(profile, syllabusTopicId);
      const topicMeta =
        syllabusTopicId != null ? `Syllabus topic id: ${syllabusTopicId}` : undefined;
      const merged = [topicMeta, dbStudy, contextText].filter(Boolean).join('\n\n');
      const { reply } = await chatWithGuru(
        q,
        topicName,
        next.slice(-10),
        undefined,
        merged || undefined,
      );

      if (isMountedRef.current) {
        setMessages((prev) => [...prev, { role: 'guru', text: reply }]);
        setRetryCount(0);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        scrollToEnd();
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
      // Retry the last user message
      const lastUserMessage = messages[messages.length - 1].text;
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
              <Ionicons name="close-circle" size={28} color={theme.colors.textMuted} />
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
                  <Ionicons name="sparkles" size={32} color={theme.colors.primary} />
                </View>
                <Text style={s.emptyTitle}>Ask anything about this topic</Text>
                <Text style={s.emptyHint}>
                  Guru can explain concepts, quiz you, or help clarify tricky points.
                </Text>
              </View>
            )}

            {messages.map((msg, i) => (
              <View
                key={i}
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
                    <MarkdownRender content={msg.text} />
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
                  <ActivityIndicator size="small" color={theme.colors.primary} />
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
                placeholderTextColor={theme.colors.textMuted}
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
                    color={!input.trim() ? theme.colors.textMuted : '#fff'}
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
  backdropOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  kvWrapper: { flex: 1, justifyContent: 'flex-end' },
  panel: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    height: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: theme.colors.borderLight,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
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
    backgroundColor: theme.colors.primary,
    opacity: 0.3,
  },
  innerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.primary,
    position: 'absolute',
  },
  headerText: { flex: 1 },
  headerTitle: {
    color: theme.colors.textPrimary,
    fontWeight: '900',
    fontSize: 18,
    letterSpacing: 0.5,
  },
  headerSub: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 1,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  closeBtn: {
    padding: 4,
  },
  messages: { flex: 1 },
  messagesContent: {
    padding: 20,
    paddingBottom: 40,
    gap: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 60,
    paddingHorizontal: 40,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.primaryTintSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyHint: {
    color: theme.colors.textMuted,
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
    backgroundColor: theme.colors.primary,
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  userAvatar: {
    backgroundColor: theme.colors.primary,
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  avatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  bubble: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  userBubble: {
    backgroundColor: theme.colors.primary,
    borderBottomRightRadius: 4,
    borderTopRightRadius: 20,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  guruBubble: {
    backgroundColor: theme.colors.surfaceAlt,
    borderBottomLeftRadius: 4,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  userBubbleTail: {
    // Tail effect for user messages (pointing left)
    borderLeftWidth: 0,
  },
  guruBubbleTail: {
    // Tail effect for guru messages (pointing right)
    borderRightWidth: 0,
  },
  userBubbleText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    minWidth: 80,
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.textMuted,
  },

  errorContainer: {
    alignSelf: 'center',
    backgroundColor: theme.colors.error + '15',
    padding: 12,
    borderRadius: 12,
    marginVertical: 8,
    alignItems: 'center',
    maxWidth: '90%',
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
  },
  retryBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },

  inputWrapper: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.inputBg,
    borderRadius: 24,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  input: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 15,
    maxHeight: 100,
    paddingVertical: 8,
  },
  inputError: {
    borderColor: theme.colors.error,
  },
  inputErrorHint: {
    color: theme.colors.error,
    fontSize: 11,
    marginTop: 4,
    marginLeft: 12,
  },
  sendBtn: {
    backgroundColor: theme.colors.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: theme.colors.surface,
  },
});
