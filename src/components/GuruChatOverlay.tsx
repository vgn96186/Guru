import React, { useState, useRef, useEffect } from 'react';
import {
  Modal, View, Text, TouchableOpacity, TextInput, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { chatWithGuru } from '../services/aiService';

interface ChatMessage { role: 'user' | 'guru'; text: string; }

interface Props {
  visible: boolean;
  topicName: string;
  apiKey: string;
  orKey?: string;
  onClose: () => void;
}

function TypingIndicator() {
  const dots = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(600 - i * 150),
        ])
      )
    );
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, []);

  return (
    <View style={s.typingRow}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={[s.typingDot, { opacity: dot, transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] }]}
        />
      ))}
    </View>
  );
}

export default function GuruChatOverlay({ visible, topicName, apiKey, orKey, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const insets = useSafeAreaInsets();

  // Reset chat when topic changes
  useEffect(() => {
    if (visible) {
      setMessages([]);
      setInput('');
    }
  }, [topicName, visible]);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.5, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  async function handleSend() {
    const q = input.trim();
    if (!q || loading) return;
    const userMsg: ChatMessage = { role: 'user', text: q };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setLoading(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    try {
      const { reply } = await chatWithGuru(q, topicName, next, apiKey, orKey);
      setMessages(prev => [...prev, { role: 'guru', text: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'guru', text: "Couldn't connect. Try again." }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Dimmed backdrop — tap to close */}
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.kvWrapper}
      >
        <View style={[s.panel, { paddingBottom: Math.max(insets.bottom, 8) }]}>

          {/* Drag handle */}
          <View style={s.handle} />

          {/* Header */}
          <View style={s.header}>
            <Animated.View style={[s.dot, { transform: [{ scale: pulseAnim }] }]} />
            <View style={s.headerText}>
              <Text style={s.headerTitle}>Ask Guru</Text>
              <Text style={s.headerSub} numberOfLines={1}>{topicName}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={s.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Messages */}
          <ScrollView
            ref={scrollRef}
            style={s.messages}
            contentContainerStyle={s.messagesContent}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
            showsVerticalScrollIndicator={false}
          >
            {messages.length === 0 && (
              <View style={s.emptyState}>
                <Text style={s.emptyHint}>Ask anything about</Text>
                <Text style={s.emptyTopic}>{topicName}</Text>
              </View>
            )}
            {messages.map((msg, i) => (
              <View key={i} style={msg.role === 'user' ? s.userRow : s.guruRow}>
                {msg.role === 'guru' && (
                  <View style={s.guruAvatar}>
                    <Text style={s.guruAvatarText}>G</Text>
                  </View>
                )}
                <View style={[s.bubble, msg.role === 'user' ? s.userBubble : s.guruBubble]}>
                  <Text style={msg.role === 'user' ? s.userText : s.guruText}>{msg.text}</Text>
                </View>
              </View>
            ))}
            {loading && (
              <View style={s.guruRow}>
                <View style={s.guruAvatar}>
                  <Text style={s.guruAvatarText}>G</Text>
                </View>
                <View style={[s.bubble, s.guruBubble]}>
                  <TypingIndicator />
                </View>
              </View>
            )}
          </ScrollView>

          {/* Input row */}
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              placeholder="Ask a question..."
              placeholderTextColor="#555"
              value={input}
              onChangeText={setInput}
              onSubmitEditing={handleSend}
              returnKeyType="send"
              multiline
            />
            <TouchableOpacity
              style={[s.sendBtn, (!input.trim() || loading) && s.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!input.trim() || loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={s.sendBtnText}>↑</Text>
              )}
            </TouchableOpacity>
          </View>

        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  kvWrapper: { flex: 1, justifyContent: 'flex-end' },
  panel: {
    backgroundColor: '#13131C',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: '82%',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#2A2A3C',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    backgroundColor: '#3A3A4A',
    borderRadius: 2,
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E2E',
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#6C63FF',
    marginRight: 10,
    shadowColor: '#6C63FF',
    shadowRadius: 8,
    shadowOpacity: 1,
    elevation: 6,
  },
  headerText: { flex: 1 },
  headerTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  headerSub: { color: '#6C63FF', fontSize: 12, marginTop: 2 },
  closeBtn: { padding: 4 },
  closeBtnText: { color: '#555', fontSize: 20 },
  messages: { flex: 1 },
  messagesContent: { paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
  emptyState: { alignItems: 'center', paddingTop: 32 },
  emptyHint: { color: '#555', fontSize: 13, fontStyle: 'italic' },
  emptyTopic: { color: '#6C63FF', fontSize: 14, fontWeight: '700', marginTop: 4 },
  guruRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  userRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  guruAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#6C63FF22',
    borderWidth: 1,
    borderColor: '#6C63FF44',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  guruAvatarText: { color: '#6C63FF', fontSize: 12, fontWeight: '800' },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexShrink: 1,
    maxWidth: '80%',
  },
  guruBubble: {
    backgroundColor: '#1C1C2E',
    borderWidth: 1,
    borderColor: '#2A2A3C',
    borderBottomLeftRadius: 4,
  },
  userBubble: {
    backgroundColor: '#6C63FF',
    borderBottomRightRadius: 4,
  },
  guruText: { color: '#E8E8F0', fontSize: 14, lineHeight: 22 },
  userText: { color: '#fff', fontSize: 14, lineHeight: 22 },
  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 },
  typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#6C63FF' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#1E1E2E',
  },
  input: {
    flex: 1,
    backgroundColor: '#1C1C2E',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2A2A3C',
    maxHeight: 100,
    lineHeight: 20,
  },
  sendBtn: {
    backgroundColor: '#6C63FF',
    borderRadius: 22,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  sendBtnDisabled: { backgroundColor: '#2A2A3C' },
  sendBtnText: { color: '#fff', fontSize: 20, fontWeight: '700' },
});
