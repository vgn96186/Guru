import React, { useState, useRef, useEffect } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { chatWithGuru } from '../services/aiService';
import { theme } from '../constants/theme';
import { MarkdownRender } from './MarkdownRender';

interface ChatMessage {
  role: 'user' | 'guru';
  text: string;
}

interface Props {
  visible: boolean;
  topicName: string;
  onClose: () => void;
}

export default function GuruChatOverlay({ visible, topicName, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();

      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.4, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        ]),
      );
      anim.start();
      return () => anim.stop();
    } else {
      slideAnim.setValue(300);
    }
  }, [visible]);

  async function handleSend() {
    const q = input.trim();
    if (!q || loading) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const userMsg: ChatMessage = { role: 'user', text: q };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setLoading(true);

    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const { reply } = await chatWithGuru(q, topicName, next.slice(-10));
      setMessages((prev) => [...prev, { role: 'guru', text: reply }]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setMessages((prev) => [...prev, { role: 'guru', text: "Couldn't connect. Try again." }]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <StatusBar barStyle="light-content" />
      <TouchableOpacity
        style={s.backdrop}
        activeOpacity={1}
        onPress={() => {
          Haptics.selectionAsync();
          onClose();
        }}
      >
        <View style={s.backdropOverlay} />
      </TouchableOpacity>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
              <View style={s.headerText}>
                <Text style={s.headerTitle}>Study Guru</Text>
                <Text style={s.headerSub} numberOfLines={1}>
                  {topicName}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                onClose();
              }}
              style={s.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close-circle" size={28} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollRef}
            style={s.messages}
            contentContainerStyle={s.messagesContent}
            showsVerticalScrollIndicator={false}
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
                  <View style={s.avatarSmall}>
                    <Text style={s.avatarText}>G</Text>
                  </View>
                )}
                <View style={[s.bubble, msg.role === 'user' ? s.userBubble : s.guruBubble]}>
                  {msg.role === 'guru' ? (
                    <MarkdownRender content={msg.text} />
                  ) : (
                    <Text style={s.userBubbleText}>{msg.text}</Text>
                  )}
                </View>
              </View>
            ))}

            {loading && (
              <View style={s.guruContainer}>
                <View style={s.avatarSmall}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                </View>
                <View style={[s.bubble, s.guruBubble, s.loadingBubble]}>
                  <Text style={s.loadingText}>Thinking...</Text>
                </View>
              </View>
            )}
          </ScrollView>

          <View style={s.inputWrapper}>
            <View style={s.inputRow}>
              <TextInput
                style={s.input}
                placeholder="Ask a question..."
                placeholderTextColor={theme.colors.textMuted}
                value={input}
                onChangeText={setInput}
                onSubmitEditing={handleSend}
                returnKeyType="send"
                multiline={false}
              />
              <TouchableOpacity
                style={[s.sendBtn, (!input.trim() || loading) && s.sendBtnDisabled]}
                onPress={handleSend}
                disabled={!input.trim() || loading}
              >
                <Ionicons
                  name="arrow-up"
                  size={20}
                  color={!input.trim() || loading ? theme.colors.textMuted : '#fff'}
                />
              </TouchableOpacity>
            </View>
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
    gap: 20,
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
    maxWidth: '90%',
    alignItems: 'flex-end',
  },
  userContainer: {
    alignSelf: 'flex-end',
    justifyContent: 'flex-end',
  },
  guruContainer: {
    alignSelf: 'flex-start',
    justifyContent: 'flex-start',
  },
  avatarSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginBottom: 4,
  },
  avatarText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
  bubble: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  userBubble: {
    backgroundColor: theme.colors.primary,
    borderBottomRightRadius: 4,
  },
  guruBubble: {
    backgroundColor: theme.colors.surfaceAlt,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
  },
  loadingText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginLeft: 8,
    fontStyle: 'italic',
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
