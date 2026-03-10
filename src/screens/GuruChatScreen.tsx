import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  StatusBar,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { HomeStackParamList } from '../navigation/types';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { chatWithGuruGrounded, type MedicalGroundingSource } from '../services/aiService';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'GuruChat'>;
type ScreenRoute = RouteProp<HomeStackParamList, 'GuruChat'>;

type ChatMessage = {
  id: string;
  role: 'user' | 'guru';
  text: string;
  sources?: MedicalGroundingSource[];
  modelUsed?: string;
  searchQuery?: string;
};

const STARTERS = [
  'Latest first-line treatment for HFrEF?',
  'Current evidence on GLP-1 agonists in obesity',
  'Updated sepsis bundle essentials',
];

export default function GuruChatScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<ScreenRoute>();
  const topicName = route.params?.topicName ?? 'General Medicine';
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState(route.params?.initialQuestion ?? '');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const modelHistory = useMemo(
    () => messages.map(m => ({ role: m.role, text: m.text })),
    [messages],
  );

  async function openSource(url: string) {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      }
    } catch {
      // No-op
    }
  }

  async function handleSend(questionOverride?: string) {
    const q = (questionOverride ?? input).trim();
    if (!q || loading) return;

    const userMessage: ChatMessage = {
      id: `u-${Date.now()}-${Math.random()}`,
      role: 'user',
      text: q,
    };

    const nextHistory = [...modelHistory, { role: 'user' as const, text: q }];
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);

    try {
      const grounded = await chatWithGuruGrounded(q, topicName, nextHistory);
      const guruMessage: ChatMessage = {
        id: `g-${Date.now()}-${Math.random()}`,
        role: 'guru',
        text: grounded.reply,
        sources: grounded.sources,
        modelUsed: grounded.modelUsed,
        searchQuery: grounded.searchQuery,
      };
      setMessages(prev => [...prev, guruMessage]);
    } catch {
      setMessages(prev => [
        ...prev,
        {
          id: `g-${Date.now()}-${Math.random()}`,
          role: 'guru',
          text: 'I could not fetch live medical sources right now. Please retry in a moment.',
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ResponsiveContainer style={styles.flex}>
          <View style={styles.header}>
            {navigation.canGoBack() ? (
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.8}>
                <Text style={styles.backText}>‹ Back</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.backBtn} />
            )}
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>Guru Medical Chat</Text>
              <Text style={styles.subtitle}>{topicName}</Text>
            </View>
          </View>

          <View style={styles.infoBanner}>
            <Text style={styles.infoText}>
              Grounded with live medical search (Europe PMC + PubMed). Responses include source citations.
            </Text>
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.messages}
            contentContainerStyle={styles.messagesContent}
            keyboardShouldPersistTaps="handled"
          >
            {messages.length === 0 && (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyTitle}>Ask a clinical question</Text>
                <Text style={styles.emptyHint}>Examples</Text>
                <View style={styles.starterGrid}>
                  {STARTERS.map(starter => (
                    <TouchableOpacity
                      key={starter}
                      style={styles.starterChip}
                      onPress={() => handleSend(starter)}
                      activeOpacity={0.85}
                      disabled={loading}
                    >
                      <Text style={styles.starterChipText}>{starter}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {messages.map(msg => (
              <View key={msg.id} style={styles.msgWrap}>
                <View style={[styles.bubble, msg.role === 'user' ? styles.userBubble : styles.guruBubble]}>
                  <Text style={styles.bubbleText}>{msg.text}</Text>
                </View>

                {msg.role === 'guru' && !!msg.modelUsed && (
                  <Text style={styles.modelMeta}>Model: {msg.modelUsed}</Text>
                )}
                {msg.role === 'guru' && !!msg.searchQuery && (
                  <Text style={styles.modelMeta}>Search: {msg.searchQuery}</Text>
                )}

                {msg.role === 'guru' && msg.sources && msg.sources.length > 0 && (
                  <View style={styles.sourcesWrap}>
                    <Text style={styles.sourcesLabel}>Sources</Text>
                    {msg.sources.map((src, idx) => (
                      <TouchableOpacity
                        key={`${msg.id}-${src.id}`}
                        style={styles.sourceCard}
                        onPress={() => openSource(src.url)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.sourceTitle}>{idx + 1}. {src.title}</Text>
                        <Text style={styles.sourceMeta}>
                          {src.source}{src.publishedAt ? ` • ${src.publishedAt}` : ''}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            ))}

            {loading && (
              <View style={styles.msgWrap}>
                <View style={[styles.bubble, styles.guruBubble]}>
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color="#6C63FF" />
                    <Text style={styles.loadingText}>Searching latest medical evidence…</Text>
                  </View>
                </View>
              </View>
            )}
          </ScrollView>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Ask a medical question..."
              placeholderTextColor="#7B8193"
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => handleSend()}
              returnKeyType="send"
              multiline
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
              onPress={() => handleSend()}
              activeOpacity={0.85}
              disabled={!input.trim() || loading}
            >
              <Text style={styles.sendText}>Send</Text>
            </TouchableOpacity>
          </View>
        </ResponsiveContainer>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  backBtn: { paddingVertical: 8, paddingRight: 8 },
  backText: { color: '#AEB5C4', fontSize: 14, fontWeight: '700' },
  headerTextWrap: { flex: 1 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  subtitle: { color: '#6C63FF', marginTop: 2, fontSize: 12, fontWeight: '600' },
  infoBanner: {
    marginHorizontal: 16,
    backgroundColor: '#1A1A24',
    borderWidth: 1,
    borderColor: '#2A2A38',
    borderRadius: 12,
    padding: 12,
  },
  infoText: { color: '#AAB0BF', fontSize: 12, lineHeight: 18 },
  messages: { flex: 1, marginTop: 10 },
  messagesContent: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  msgWrap: {},
  bubble: { borderRadius: 14, borderWidth: 1, padding: 12, maxWidth: '92%' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#2A245B', borderColor: '#5F57E8' },
  guruBubble: { alignSelf: 'flex-start', backgroundColor: '#14141D', borderColor: '#2A2A38' },
  bubbleText: { color: '#E8ECF2', fontSize: 14, lineHeight: 21 },
  modelMeta: { color: '#8E95A5', fontSize: 11, marginTop: 6, marginLeft: 2 },
  sourcesWrap: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#2A2A38',
    borderRadius: 10,
    backgroundColor: '#101018',
    padding: 10,
  },
  sourcesLabel: { color: '#C8CDDA', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  sourceCard: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#23232E' },
  sourceTitle: { color: '#DCE1EB', fontSize: 12, lineHeight: 17, fontWeight: '600' },
  sourceMeta: { color: '#8E95A5', fontSize: 11, marginTop: 3 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingText: { color: '#B0B7C6', fontSize: 13 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#2A2A38',
    backgroundColor: '#0F0F14',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: '#151521',
    borderWidth: 1,
    borderColor: '#2A2A38',
    borderRadius: 12,
    color: '#FFFFFF',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sendBtn: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#6C63FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#3E4254' },
  sendText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  emptyWrap: { marginTop: 18 },
  emptyTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginBottom: 6 },
  emptyHint: { color: '#A2A9B8', fontSize: 13, marginBottom: 10 },
  starterGrid: { gap: 8 },
  starterChip: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A38',
    backgroundColor: '#14141D',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  starterChipText: { color: '#D2D7E2', fontSize: 13 },
});
