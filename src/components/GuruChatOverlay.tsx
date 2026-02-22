import React, { useState, useRef, useEffect } from 'react';
import {
  Modal, View, Text, TouchableOpacity, TextInput, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Animated,
} from 'react-native';
import { chatWithGuru } from '../services/aiService';

interface ChatMessage { role: 'user' | 'guru'; text: string; }

interface Props {
  visible: boolean;
  topicName: string;
  apiKey: string;
  orKey?: string;
  onClose: () => void;
}

export default function GuruChatOverlay({ visible, topicName, apiKey, orKey, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 1000, useNativeDriver: true }),
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
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    try {
      const { reply } = await chatWithGuru(q, topicName, next, apiKey, orKey);
      setMessages(prev => [...prev, { role: 'guru', text: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'guru', text: "Couldn't connect. Try again." }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.kvWrapper}>
        <View style={s.panel}>
          <View style={s.header}>
            <Animated.View style={[s.dot, { transform: [{ scale: pulseAnim }] }]} />
            <View style={s.headerText}>
              <Text style={s.headerTitle}>Ask Guru</Text>
              <Text style={s.headerSub}>{topicName}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Text style={s.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView ref={scrollRef} style={s.messages} contentContainerStyle={s.messagesContent}>
            {messages.length === 0 && (
              <Text style={s.emptyHint}>Ask anything about {topicName}...</Text>
            )}
            {messages.map((msg, i) => (
              <View key={i} style={[s.bubble, msg.role === 'user' ? s.userBubble : s.guruBubble]}>
                <Text style={s.bubbleText}>{msg.text}</Text>
              </View>
            ))}
            {loading && (
              <View style={[s.bubble, s.guruBubble]}>
                <ActivityIndicator size="small" color="#6C63FF" />
              </View>
            )}
          </ScrollView>

          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              placeholder="Ask a question..."
              placeholderTextColor="#555"
              value={input}
              onChangeText={setInput}
              onSubmitEditing={handleSend}
              returnKeyType="send"
            />
            <TouchableOpacity
              style={[s.sendBtn, (!input.trim() || loading) && s.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!input.trim() || loading}
            >
              <Text style={s.sendBtnText}>→</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject },
  kvWrapper: { flex: 1, justifyContent: 'flex-end' },
  panel: { backgroundColor: '#1A1A24', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '75%', minHeight: 300 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#2A2A38' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#6C63FF', shadowColor: '#6C63FF', shadowRadius: 6, shadowOpacity: 0.9, elevation: 4, marginRight: 10 },
  headerText: { flex: 1 },
  headerTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  headerSub: { color: '#6C63FF', fontSize: 12, marginTop: 2 },
  closeBtn: { padding: 8 },
  closeBtnText: { color: '#9E9E9E', fontSize: 18 },
  messages: { flex: 1 },
  messagesContent: { padding: 16, gap: 10 },
  emptyHint: { color: '#555', fontSize: 14, textAlign: 'center', marginTop: 20, fontStyle: 'italic' },
  bubble: { borderRadius: 14, padding: 12, maxWidth: '85%', borderWidth: 1 },
  userBubble: { backgroundColor: '#6C63FF22', borderColor: '#6C63FF44', alignSelf: 'flex-end' },
  guruBubble: { backgroundColor: '#0F0F14', borderColor: '#2A2A38', alignSelf: 'flex-start' },
  bubbleText: { color: '#E0E0E0', fontSize: 14, lineHeight: 20 },
  inputRow: { flexDirection: 'row', padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: '#2A2A38' },
  input: { flex: 1, backgroundColor: '#0F0F14', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: '#2A2A38' },
  sendBtn: { backgroundColor: '#6C63FF', borderRadius: 20, width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { backgroundColor: '#333' },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
