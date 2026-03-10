import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Animated, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { chatWithGuru } from '../services/aiService';
import { useAppStore } from '../store/useAppStore';

interface ChatMessage { role: 'user' | 'guru'; text: string; }

const SUGGESTED_TOPICS = [
  'Pharmacology', 'Pathology', 'Medicine', 'Surgery',
  'Cardiology', 'Microbiology', 'Biochemistry', 'Anatomy',
];

export default function GuruChatScreen() {
  const profile = useAppStore(s => s.profile);

  const [topicContext, setTopicContext] = useState('');
  const [editingTopic, setEditingTopic] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  async function handleSend() {
    const q = input.trim();
    if (!q || loading) return;
    const apiKey = profile?.openrouterApiKey ?? '';
    const orKey = profile?.openrouterKey ?? undefined;
    const userMsg: ChatMessage = { role: 'user', text: q };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setLoading(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    try {
      const { reply } = await chatWithGuru(q, topicContext || 'General Medicine', next, apiKey, orKey);
      setMessages(prev => [...prev, { role: 'guru', text: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'guru', text: "Couldn't connect. Check your API key in Settings." }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />

      {/* Header */}
      <View style={s.header}>
        <Animated.View style={[s.dot, { transform: [{ scale: pulseAnim }] }]} />
        <View style={s.headerInfo}>
          <Text style={s.headerTitle}>Ask Guru</Text>
          <Text style={s.headerSub}>AI medical tutor</Text>
        </View>
        {messages.length > 0 && (
          <TouchableOpacity
            style={s.clearBtn}
            onPress={() => { setMessages([]); setTopicContext(''); }}
            activeOpacity={0.7}
          >
            <Text style={s.clearBtnText}>New chat</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Topic context bar */}
      <View style={s.contextBar}>
        {editingTopic ? (
          <TextInput
            style={s.contextInput}
            placeholder="Topic or subject (e.g. Heart Failure, Pharmacology...)"
            placeholderTextColor="#555"
            value={topicContext}
            onChangeText={setTopicContext}
            onBlur={() => setEditingTopic(false)}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => setEditingTopic(false)}
          />
        ) : (
          <TouchableOpacity style={s.contextPill} onPress={() => setEditingTopic(true)} activeOpacity={0.8}>
            <Text style={s.contextLabel}>📌 </Text>
            <Text style={topicContext ? s.contextValue : s.contextValueEmpty} numberOfLines={1}>
              {topicContext || 'Tap to set topic context'}
            </Text>
            <Text style={s.contextEdit}>✎</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Suggested topics (only when no context set and no messages) */}
      {!topicContext && messages.length === 0 && !editingTopic && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.suggestions}>
          {SUGGESTED_TOPICS.map(t => (
            <TouchableOpacity
              key={t}
              style={s.suggestionChip}
              onPress={() => setTopicContext(t)}
              activeOpacity={0.8}
            >
              <Text style={s.suggestionText}>{t}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={s.messages}
          contentContainerStyle={s.messagesContent}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.length === 0 && !editingTopic && (
            <View style={s.emptyState}>
              <Text style={s.emptyEmoji}>🧑‍⚕️</Text>
              <Text style={s.emptyTitle}>What would you like to learn?</Text>
              <Text style={s.emptySub}>
                Ask anything — classifications, mechanisms, drug doses, exam tips, or "explain like I'm dumb."
              </Text>
            </View>
          )}
          {messages.map((msg, i) => (
            <View key={i} style={[s.bubble, msg.role === 'user' ? s.userBubble : s.guruBubble]}>
              {msg.role === 'guru' && <Text style={s.bubbleLabel}>Guru</Text>}
              <Text style={s.bubbleText}>{msg.text}</Text>
            </View>
          ))}
          {loading && (
            <View style={[s.bubble, s.guruBubble]}>
              <ActivityIndicator size="small" color="#6C63FF" />
            </View>
          )}
        </ScrollView>

        {/* Input */}
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            placeholder="Ask anything..."
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
          >
            <Text style={s.sendBtnText}>→</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1A1A24' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#6C63FF', shadowColor: '#6C63FF', shadowRadius: 6, shadowOpacity: 0.9, elevation: 4, marginRight: 10 },
  headerInfo: { flex: 1 },
  headerTitle: { color: '#fff', fontWeight: '800', fontSize: 17 },
  headerSub: { color: '#6C63FF', fontSize: 11, marginTop: 1 },
  clearBtn: { backgroundColor: '#1A1A2E', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#6C63FF44' },
  clearBtnText: { color: '#6C63FF', fontSize: 12, fontWeight: '600' },
  contextBar: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1A1A24' },
  contextInput: { backgroundColor: '#1A1A24', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: '#6C63FF66' },
  contextPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A24', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  contextLabel: { fontSize: 13 },
  contextValue: { flex: 1, color: '#D0C8FF', fontSize: 13 },
  contextValueEmpty: { flex: 1, color: '#555', fontSize: 13 },
  contextEdit: { color: '#555', fontSize: 14, marginLeft: 8 },
  suggestions: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  suggestionChip: { backgroundColor: '#1A1A2E', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#6C63FF33' },
  suggestionText: { color: '#D0C8FF', fontSize: 13 },
  messages: { flex: 1 },
  messagesContent: { padding: 16, gap: 10, flexGrow: 1 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { color: '#fff', fontWeight: '700', fontSize: 18, textAlign: 'center', marginBottom: 10 },
  emptySub: { color: '#9E9E9E', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  bubble: { borderRadius: 16, padding: 14, maxWidth: '88%', borderWidth: 1 },
  userBubble: { backgroundColor: '#6C63FF22', borderColor: '#6C63FF44', alignSelf: 'flex-end' },
  guruBubble: { backgroundColor: '#1A1A24', borderColor: '#2A2A38', alignSelf: 'flex-start' },
  bubbleLabel: { color: '#6C63FF', fontSize: 10, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase' },
  bubbleText: { color: '#E0E0E0', fontSize: 14, lineHeight: 22 },
  inputRow: { flexDirection: 'row', padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: '#1A1A24', alignItems: 'flex-end' },
  input: { flex: 1, backgroundColor: '#1A1A24', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: '#2A2A38', maxHeight: 100 },
  sendBtn: { backgroundColor: '#6C63FF', borderRadius: 22, width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { backgroundColor: '#2A2A38' },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
