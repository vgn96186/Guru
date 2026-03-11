import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  StatusBar,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Clipboard,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { HomeStackParamList } from '../navigation/types';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { chatWithGuruGrounded, type MedicalGroundingSource, GROQ_MODELS, OPENROUTER_FREE_MODELS, getApiKeys } from '../services/aiService';
import { useAppStore } from '../store/useAppStore';
import { Modal } from 'react-native';
import { saveChatMessage, getChatHistory, clearChatHistory } from '../db/queries/aiCache';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'GuruChat'>;
type ScreenRoute = RouteProp<HomeStackParamList, 'GuruChat'>;

type ChatMessage = {
  id: string;
  role: 'user' | 'guru';
  text: string;
  sources?: MedicalGroundingSource[];
  modelUsed?: string;
  searchQuery?: string;
  timestamp: number;
};

const STARTERS = [
  { icon: 'heart-outline', text: 'First-line treatment for HFrEF?' },
  { icon: 'fitness-outline', text: 'GLP-1 agonists in obesity — key trials?' },
  { icon: 'pulse-outline', text: 'Sepsis bundle essentials 2024' },
  { icon: 'medical-outline', text: 'Hypertension guidelines — thresholds?' },
  { icon: 'flask-outline', text: 'CKD staging and management approach' },
  { icon: 'brain-outline' as any, text: 'Migraine prophylaxis options ranked' },
];

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// Animated typing dots
function TypingDots() {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
          Animated.delay((2 - i) * 150),
        ]),
      ),
    );
    Animated.parallel(anims).start();
    return () => anims.forEach(a => a.stop());
  }, []);

  return (
    <View style={styles.dotsRow}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            {
              transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }],
              opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
            },
          ]}
        />
      ))}
    </View>
  );
}

interface ModelOption {
  id: string;
  name: string;
  group: 'Local' | 'Groq' | 'OpenRouter';
}

export default function GuruChatScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<ScreenRoute>();
  const topicName = route.params?.topicName ?? 'General Medicine';
  const { profile } = useAppStore();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState(route.params?.initialQuestion ?? '');

  // Load persisted chat history on mount
  useEffect(() => {
    if (topicName && topicName !== 'General Medicine') {
      try {
        const history = getChatHistory(topicName, 20);
        if (history.length > 0) {
          setMessages(history.map(h => ({
            id: `hist-${h.id}`,
            role: h.role,
            text: h.message,
            timestamp: h.timestamp,
          })));
          setBannerVisible(false);
        }
      } catch { /* ignore DB errors */ }
    }
  }, []);
  const [loading, setLoading] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(true);
  const [chosenModel, setChosenModel] = useState<string>('auto');
  const [showModelPicker, setShowModelPicker] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const availableModels = useMemo(() => {
    const { orKey, groqKey } = getApiKeys();
    const list: ModelOption[] = [{ id: 'auto', name: 'Auto Route (Smart)', group: 'Local' }];

    if (profile?.useLocalModel && profile?.localModelPath) {
      list.push({ id: 'local', name: 'On-Device LLM', group: 'Local' });
    }

    if (groqKey) {
      GROQ_MODELS.forEach(m => {
        list.push({ id: `groq/${m}`, name: m.split('-').slice(0, 2).join(' ').toUpperCase(), group: 'Groq' });
      });
    }

    if (orKey) {
      OPENROUTER_FREE_MODELS.forEach(m => {
        list.push({ id: m, name: m.split('/')[1].split(':')[0].toUpperCase(), group: 'OpenRouter' });
      });
    }

    return list;
  }, [profile]);

  const currentModelName = useMemo(() => {
    const found = availableModels.find(m => m.id === chosenModel);
    return found ? found.name : 'Auto';
  }, [chosenModel, availableModels]);

  const modelHistory = useMemo(
    () => messages.map(m => ({ role: m.role, text: m.text })),
    [messages],
  );

  const scrollToBottom = useCallback((delay = 80) => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), delay);
  }, []);

  async function openSource(url: string) {
    try {
      if (await Linking.canOpenURL(url)) await Linking.openURL(url);
    } catch { /* no-op */ }
  }

  function copyMessage(text: string) {
    Clipboard.setString(text);
    Alert.alert('Copied', 'Message copied to clipboard.');
  }

  async function handleSend(questionOverride?: string) {
    const q = (questionOverride ?? input).trim();
    if (!q || loading) return;

    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: q,
      timestamp: Date.now(),
    };

    const nextHistory = [...modelHistory, { role: 'user' as const, text: q }];
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setBannerVisible(false);
    setLoading(true);
    scrollToBottom();
    try { saveChatMessage(topicName, 'user', q, Date.now()); } catch { /* ignore */ }

    try {
      const grounded = await chatWithGuruGrounded(
        q, 
        topicName, 
        nextHistory, 
        chosenModel === 'auto' ? undefined : chosenModel
      );
      const guruTs = Date.now();
      setMessages(prev => [
        ...prev,
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
      try { saveChatMessage(topicName, 'guru', grounded.reply, guruTs); } catch { /* ignore */ }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      setMessages(prev => [
        ...prev,
        {
          id: `g-${Date.now()}`,
          role: 'guru',
          text: `⚠️ ${errMsg}`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
      scrollToBottom(120);
    }
  }

  function clearChat() {
    Alert.alert('Clear Chat', 'Start a new conversation?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => {
        setMessages([]);
        setBannerVisible(true);
        try { clearChatHistory(topicName); } catch { /* ignore */ }
      }},
    ]);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ResponsiveContainer style={styles.flex}>

          {/* Header */}
          <View style={styles.header}>
            {navigation.canGoBack() ? (
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} activeOpacity={0.7}>
                <Ionicons name="arrow-back" size={22} color="#AEB5C4" />
              </TouchableOpacity>
            ) : (
              <View style={styles.iconBtn} />
            )}
            <View style={styles.headerCenter}>
              <View style={styles.guruAvatarSmall}>
                <Ionicons name="sparkles" size={14} color="#6C63FF" />
              </View>
              <TouchableOpacity onPress={() => setShowModelPicker(true)} style={styles.modelSelector} activeOpacity={0.7}>
                <View>
                  <Text style={styles.title}>Guru Chat</Text>
                  <View style={styles.modelBadge}>
                    <Text style={styles.modelBadgeText}>{currentModelName}</Text>
                    <Ionicons name="chevron-down" size={10} color="#6C63FF" />
                  </View>
                </View>
              </TouchableOpacity>
            </View>
            {messages.length > 0 ? (
              <TouchableOpacity onPress={clearChat} style={styles.iconBtn} activeOpacity={0.7}>
                <Ionicons name="trash-outline" size={20} color="#666" />
              </TouchableOpacity>
            ) : (
              <View style={styles.iconBtn} />
            )}
          </View>

          {/* Model Picker Modal */}
          <Modal visible={showModelPicker} transparent animationType="slide" onRequestClose={() => setShowModelPicker(false)}>
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Choose Brain</Text>
                <ScrollView>
                  {['Local', 'Groq', 'OpenRouter'].map(group => {
                    const groupModels = availableModels.filter(m => m.group === group);
                    if (groupModels.length === 0) return null;
                    return (
                      <View key={group} style={styles.modelGroup}>
                        <Text style={styles.modelGroupLabel}>{group}</Text>
                        {groupModels.map(m => (
                          <TouchableOpacity
                            key={m.id}
                            style={[styles.modelItem, chosenModel === m.id && styles.modelItemActive]}
                            onPress={() => { setChosenModel(m.id); setShowModelPicker(false); }}
                          >
                            <Text style={[styles.modelItemText, chosenModel === m.id && styles.modelItemTextActive]}>{m.name}</Text>
                            {chosenModel === m.id && <Ionicons name="checkmark-circle" size={18} color="#6C63FF" />}
                          </TouchableOpacity>
                        ))}
                      </View>
                    );
                  })}
                </ScrollView>
                <TouchableOpacity onPress={() => setShowModelPicker(false)} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* Collapsible info banner */}
          {bannerVisible && (
            <View style={styles.infoBanner}>
              <Ionicons name="library-outline" size={14} color="#6C63FF" style={{ marginTop: 1 }} />
              <Text style={styles.infoText}>
                Grounded with live Europe PMC + PubMed search. Sources cited inline.
              </Text>
              <TouchableOpacity onPress={() => setBannerVisible(false)} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <Ionicons name="close" size={14} color="#555" />
              </TouchableOpacity>
            </View>
          )}

          {/* Messages */}
          <ScrollView
            ref={scrollRef}
            style={styles.messages}
            contentContainerStyle={styles.messagesContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Empty state */}
            {messages.length === 0 && (
              <View style={styles.emptyWrap}>
                <View style={styles.guruAvatarLarge}>
                  <Ionicons name="sparkles" size={32} color="#6C63FF" />
                </View>
                <Text style={styles.emptyTitle}>What do you want to know?</Text>
                <Text style={styles.emptyHint}>Try a question or pick a topic below</Text>
                <View style={styles.starterGrid}>
                  {STARTERS.map(starter => (
                    <TouchableOpacity
                      key={starter.text}
                      style={styles.starterChip}
                      onPress={() => handleSend(starter.text)}
                      activeOpacity={0.8}
                      disabled={loading}
                    >
                      <Ionicons name={starter.icon as any} size={16} color="#6C63FF" style={styles.starterIcon} />
                      <Text style={styles.starterChipText}>{starter.text}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Message list */}
            {messages.map(msg => (
              <View key={msg.id} style={[styles.msgRow, msg.role === 'user' ? styles.msgRowUser : styles.msgRowGuru]}>
                {msg.role === 'guru' && (
                  <View style={styles.guruAvatarTiny}>
                    <Ionicons name="sparkles" size={11} color="#6C63FF" />
                  </View>
                )}

                <View style={styles.msgContent}>
                  <TouchableOpacity
                    onLongPress={() => copyMessage(msg.text)}
                    activeOpacity={0.9}
                    delayLongPress={400}
                  >
                    <View style={[styles.bubble, msg.role === 'user' ? styles.userBubble : styles.guruBubble]}>
                      <Text style={[styles.bubbleText, msg.role === 'user' && styles.userBubbleText]}>
                        {msg.text}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <Text style={[styles.timestamp, msg.role === 'user' && styles.timestampRight]}>
                    {formatTime(msg.timestamp)}
                    {msg.role === 'guru' && msg.modelUsed ? `  ·  ${msg.modelUsed.split('/').pop()}` : ''}
                  </Text>

                  {/* Sources */}
                  {msg.role === 'guru' && msg.sources && msg.sources.length > 0 && (
                    <View style={styles.sourcesWrap}>
                      <View style={styles.sourcesHeader}>
                        <Ionicons name="documents-outline" size={13} color="#6C63FF" />
                        <Text style={styles.sourcesLabel}>Sources  ({msg.sources.length})</Text>
                      </View>
                      {msg.sources.map((src, idx) => (
                        <TouchableOpacity
                          key={`${msg.id}-${src.id}`}
                          style={styles.sourceCard}
                          onPress={() => openSource(src.url)}
                          activeOpacity={0.8}
                        >
                          <View style={styles.sourceNumBadge}>
                            <Text style={styles.sourceNum}>{idx + 1}</Text>
                          </View>
                          <View style={styles.sourceBody}>
                            <Text style={styles.sourceTitle} numberOfLines={2}>{src.title}</Text>
                            <Text style={styles.sourceMeta}>
                              {src.source}{src.publishedAt ? `  ·  ${src.publishedAt}` : ''}
                            </Text>
                          </View>
                          <Ionicons name="open-outline" size={13} color="#555" />
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            ))}

            {/* Typing indicator */}
            {loading && (
              <View style={[styles.msgRow, styles.msgRowGuru]}>
                <View style={styles.guruAvatarTiny}>
                  <Ionicons name="sparkles" size={11} color="#6C63FF" />
                </View>
                <View style={[styles.bubble, styles.guruBubble, { paddingVertical: 14, paddingHorizontal: 18 }]}>
                  <TypingDots />
                </View>
              </View>
            )}
          </ScrollView>

          {/* Input row */}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Ask a medical question…"
              placeholderTextColor="#4A4F62"
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => handleSend()}
              returnKeyType="send"
              multiline
              maxLength={1000}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
              onPress={() => handleSend()}
              activeOpacity={0.8}
              disabled={!input.trim() || loading}
            >
              <Ionicons name="send" size={18} color="#fff" />
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

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E2A',
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  guruAvatarSmall: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#1A1630', borderWidth: 1, borderColor: '#3D37A0',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: '#fff', fontSize: 16, fontWeight: '800' },
  subtitle: { color: '#6C63FF', fontSize: 11, fontWeight: '600', marginTop: 1 },

  modelSelector: { flex: 1, paddingVertical: 2 },
  modelBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  modelBadgeText: { color: '#6C63FF', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#1A1A24', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, maxHeight: '80%',
  },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: '900', marginBottom: 20, textAlign: 'center' },
  modelGroup: { marginBottom: 20 },
  modelGroupLabel: { color: '#555B78', fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, marginLeft: 4 },
  modelItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12,
    backgroundColor: '#13131E', marginBottom: 8, borderWidth: 1, borderColor: '#23233A',
  },
  modelItemActive: { backgroundColor: '#25205A', borderColor: '#4A43B0' },
  modelItemText: { color: '#AEB5C4', fontSize: 15, fontWeight: '600' },
  modelItemTextActive: { color: '#fff' },
  closeBtn: { marginTop: 8, padding: 16, alignItems: 'center', backgroundColor: '#23233A', borderRadius: 14 },
  closeBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Banner
  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    marginHorizontal: 12, marginVertical: 8,
    backgroundColor: '#12121E', borderWidth: 1, borderColor: '#2A2A42',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
  },
  infoText: { color: '#7A80A0', fontSize: 11, lineHeight: 16, flex: 1 },

  // Messages
  messages: { flex: 1 },
  messagesContent: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 20, gap: 16 },

  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  msgRowUser: { flexDirection: 'row-reverse' },
  msgRowGuru: {},

  guruAvatarTiny: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#1A1630', borderWidth: 1, borderColor: '#3D37A0',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    marginBottom: 2,
  },

  msgContent: { flex: 1, maxWidth: '88%' },

  bubble: {
    borderRadius: 16, padding: 12,
    borderWidth: 1,
  },
  userBubble: {
    backgroundColor: '#25205A', borderColor: '#4A43B0',
    borderBottomRightRadius: 4,
  },
  guruBubble: {
    backgroundColor: '#13131E', borderColor: '#23233A',
    borderBottomLeftRadius: 4,
  },
  bubbleText: { color: '#D8DCE8', fontSize: 14, lineHeight: 22 },
  userBubbleText: { color: '#E8ECFF' },

  timestamp: { color: '#404560', fontSize: 10, marginTop: 4, marginLeft: 2 },
  timestampRight: { textAlign: 'right', marginRight: 2 },

  // Sources
  sourcesWrap: {
    marginTop: 8, borderRadius: 12,
    backgroundColor: '#0E0E18', borderWidth: 1, borderColor: '#1E1E30',
    overflow: 'hidden',
  },
  sourcesHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6,
  },
  sourcesLabel: { color: '#6C63FF', fontSize: 12, fontWeight: '700' },
  sourceCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 9,
    borderTopWidth: 1, borderTopColor: '#1A1A28',
  },
  sourceNumBadge: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#1E1A40', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  sourceNum: { color: '#6C63FF', fontSize: 10, fontWeight: '800' },
  sourceBody: { flex: 1 },
  sourceTitle: { color: '#C8CEDF', fontSize: 12, lineHeight: 17, fontWeight: '600' },
  sourceMeta: { color: '#555B78', fontSize: 10, marginTop: 2 },

  // Typing dots
  dotsRow: { flexDirection: 'row', gap: 5, alignItems: 'center', height: 16 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#6C63FF' },

  // Input
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12,
    borderTopWidth: 1, borderTopColor: '#1E1E2A',
    backgroundColor: '#0F0F14',
  },
  input: {
    flex: 1, minHeight: 44, maxHeight: 120,
    backgroundColor: '#13131E', borderWidth: 1, borderColor: '#252535',
    borderRadius: 14, color: '#E8ECF2', fontSize: 14,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#6C63FF', alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#252535' },

  // Empty state
  emptyWrap: { alignItems: 'center', paddingTop: 24, paddingBottom: 12 },
  guruAvatarLarge: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#1A1630', borderWidth: 2, borderColor: '#3D37A0',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 6 },
  emptyHint: { color: '#555B78', fontSize: 13, marginBottom: 20 },
  starterGrid: { width: '100%', gap: 8 },
  starterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, borderWidth: 1, borderColor: '#1E1E30',
    backgroundColor: '#12121E', paddingHorizontal: 14, paddingVertical: 12,
  },
  starterIcon: { flexShrink: 0 },
  starterChipText: { color: '#B8BDCF', fontSize: 13, flex: 1 },
});
