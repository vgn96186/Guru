import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { getFlaggedContent, setContentFlagged, type FlaggedItem } from '../db/queries/aiCache';

const CONTENT_TYPE_LABELS: Record<string, string> = {
  keypoints: 'Key Points',
  quiz: 'Quiz',
  story: 'Story',
  mnemonic: 'Mnemonic',
  teach_back: 'Teach Back',
  error_hunt: 'Error Hunt',
  detective: 'Detective',
};

export default function FlaggedReviewScreen() {
  const navigation = useNavigation();
  const [items, setItems] = useState<FlaggedItem[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(() => {
    setItems(getFlaggedContent());
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleUnflag(item: FlaggedItem) {
    Alert.alert('Remove flag?', `Unflag "${item.topicName}" (${CONTENT_TYPE_LABELS[item.contentType]})?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unflag', style: 'destructive', onPress: () => {
          setContentFlagged(item.topicId, item.contentType, false);
          load();
        },
      },
    ]);
  }

  function toggleExpand(key: string) {
    setExpanded(prev => prev === key ? null : key);
  }

  function renderPreview(item: FlaggedItem) {
    const c = item.content as any;
    if (item.contentType === 'keypoints') {
      return (c.points as string[]).slice(0, 3).map((p: string, i: number) => (
        <Text key={i} style={styles.previewLine}>• {p}</Text>
      ));
    }
    if (item.contentType === 'quiz') {
      const q = c.questions?.[0];
      if (!q) return null;
      return (
        <>
          <Text style={styles.previewLine}>Q: {q.question}</Text>
          <Text style={styles.previewCorrect}>✓ {q.options[q.correctIndex]}</Text>
          <Text style={styles.previewExplain}>{q.explanation}</Text>
        </>
      );
    }
    if (item.contentType === 'mnemonic') {
      return (
        <>
          <Text style={styles.previewLine}>{c.mnemonic}</Text>
          {(c.expansion as string[]).slice(0, 3).map((e: string, i: number) => (
            <Text key={i} style={styles.previewSub}>  {e}</Text>
          ))}
        </>
      );
    }
    if (item.contentType === 'story') {
      return <Text style={styles.previewLine} numberOfLines={4}>{c.story}</Text>;
    }
    if (item.contentType === 'error_hunt') {
      return (c.errors as any[]).slice(0, 2).map((e: any, i: number) => (
        <Text key={i} style={styles.previewLine}>✗ {e.wrong} → {e.correct}</Text>
      ));
    }
    return null;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>🚩 Flagged for Review</Text>
        <Text style={styles.count}>{items.length}</Text>
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>✅</Text>
          <Text style={styles.emptyTitle}>No flagged content</Text>
          <Text style={styles.emptySub}>Tap the 🏳 flag button on any content card to mark it for review here.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          <Text style={styles.hint}>Tap a card to expand. These are AI-generated — verify against textbooks before relying on them for exams.</Text>
          {items.map(item => {
            const key = `${item.topicId}-${item.contentType}`;
            const isExpanded = expanded === key;
            return (
              <TouchableOpacity key={key} style={styles.card} onPress={() => toggleExpand(key)} activeOpacity={0.85}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardMeta}>
                    <Text style={styles.cardType}>{CONTENT_TYPE_LABELS[item.contentType]}</Text>
                    <Text style={styles.cardSubject}>{item.subjectName}</Text>
                  </View>
                  <TouchableOpacity style={styles.unflagBtn} onPress={() => handleUnflag(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.unflagText}>✕</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.cardTopic}>{item.topicName}</Text>
                <Text style={styles.cardModel}>Model: {item.modelUsed}</Text>

                {isExpanded && (
                  <View style={styles.preview}>
                    {renderPreview(item)}
                  </View>
                )}
                <Text style={styles.expandHint}>{isExpanded ? '▲ collapse' : '▼ show preview'}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  backBtn: { padding: 4 },
  backText: { color: '#6C63FF', fontSize: 22, fontWeight: '700' },
  title: { flex: 1, color: '#fff', fontWeight: '800', fontSize: 18 },
  count: { color: '#FF9800', fontWeight: '700', fontSize: 16, backgroundColor: '#2A1A00', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  hint: { color: '#666', fontSize: 12, lineHeight: 17, marginBottom: 16, fontStyle: 'italic' },
  card: { backgroundColor: '#1A1A24', borderRadius: 14, padding: 16, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#FF9800' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  cardMeta: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center' },
  cardType: { color: '#FF9800', fontWeight: '700', fontSize: 12, backgroundColor: '#2A1A00', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  cardSubject: { color: '#9E9E9E', fontSize: 12 },
  unflagBtn: { backgroundColor: '#2A2A38', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  unflagText: { color: '#9E9E9E', fontSize: 12, fontWeight: '700' },
  cardTopic: { color: '#fff', fontWeight: '700', fontSize: 15, marginBottom: 4 },
  cardModel: { color: '#555', fontSize: 10, marginBottom: 8 },
  preview: { backgroundColor: '#0F0F14', borderRadius: 10, padding: 12, marginTop: 8, marginBottom: 4 },
  previewLine: { color: '#D0C8FF', fontSize: 13, lineHeight: 20, marginBottom: 4 },
  previewSub: { color: '#9E9E9E', fontSize: 12, lineHeight: 18 },
  previewCorrect: { color: '#4CAF50', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  previewExplain: { color: '#9E9E9E', fontSize: 12, fontStyle: 'italic', lineHeight: 18 },
  expandHint: { color: '#555', fontSize: 11, textAlign: 'center', marginTop: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: '#fff', fontWeight: '700', fontSize: 20, marginBottom: 8 },
  emptySub: { color: '#9E9E9E', fontSize: 14, textAlign: 'center', lineHeight: 22 },
});
