import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import LoadingOrb from '../components/LoadingOrb';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MenuStackParamList } from '../navigation/types';
import { getFlaggedContentReview, resolveContentFlags } from '../db/queries/contentFlags';
import type { FlaggedContentItem } from '../db/queries/contentFlags';
import { clearSpecificContentCache } from '../db/queries/aiCache';
import { fetchContent } from '../services/ai/content';
import { getDb } from '../db/database';
import type { TopicWithProgress } from '../types';
import { linearTheme as n } from '../theme/linearTheme';
import { Ionicons } from '@expo/vector-icons';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { EmptyState } from '../components/primitives';

const FLAG_REASON_LABELS: Record<string, string> = {
  incorrect_fact: 'Incorrect medical fact',
  outdated_info: 'Outdated information',
  wrong_dosage: 'Wrong drug dosage',
  missing_concept: 'Missing key concept',
  auto_flagged: 'Auto-flagged (fact-check)',
  other: 'Other',
};

export default function FlaggedContentScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<MenuStackParamList, 'FlaggedContent'>>();
  const [flaggedItems, setFlaggedItems] = useState<FlaggedContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<number | null>(null);

  const loadFlagged = useCallback(async () => {
    setLoading(true);
    try {
      const items = await getFlaggedContentReview();
      setFlaggedItems(items);
    } catch (_err) {
      if (__DEV__) console.error('[FlaggedContent] Failed to load:', _err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFlagged();
    }, [loadFlagged]),
  );

  const [regenerate] = useAsyncAction(
    async (item: FlaggedContentItem) => {
      setProcessing(item.topicId);
      try {
        await clearSpecificContentCache(item.topicId, item.contentType);

        const db = getDb();
        const topic = await db.getFirstAsync<
          { id: number; subjectName?: string } & Record<string, unknown>
        >(
          `SELECT t.*, s.name as subjectName FROM topics t JOIN subjects s ON t.subject_id = s.id WHERE t.id = ?`,
          [item.topicId],
        );

        if (topic) {
          const topicWithProgress: TopicWithProgress = {
            id: Number(topic.id),
            name: String(topic.name ?? ''),
            subjectId: Number(topic.subject_id),
            subjectName: String(topic.subjectName ?? ''),
            subjectCode: '',
            subjectColor: '',
            subtopics: [],
            estimatedMinutes: 35,
            inicetPriority: 5,
            progress: {
              topicId: Number(topic.id),
              status: 'unseen' as const,
              confidence: 0,
              lastStudiedAt: null,
              timesStudied: 0,
              xpEarned: 0,
              nextReviewDate: null,
              userNotes: '',
              fsrsDue: null,
              fsrsStability: 0,
              fsrsDifficulty: 0,
              fsrsElapsedDays: 0,
              fsrsScheduledDays: 0,
              fsrsReps: 0,
              fsrsLapses: 0,
              fsrsState: 0,
              fsrsLastReview: null,
              wrongCount: 0,
              isNemesis: false,
            },
          };
          await fetchContent(topicWithProgress, item.contentType);
        }

        await resolveContentFlags(item.topicId, item.contentType);
        await loadFlagged();
      } finally {
        setProcessing(null);
      }
    },
    { fallbackMessage: 'Failed to regenerate content.' },
  );

  const [dismiss] = useAsyncAction(
    async (item: FlaggedContentItem) => {
      await resolveContentFlags(item.topicId, item.contentType);
      await loadFlagged();
    },
    { fallbackMessage: 'Failed to dismiss flag.' },
  );

  const renderItem = ({ item }: { item: FlaggedContentItem }) => (
    <View style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <View style={styles.itemInfo}>
          <Text style={styles.itemTitle}>{item.topicName}</Text>
          <Text style={styles.itemSubject}>{item.subjectName}</Text>
        </View>
        <View style={styles.itemType}>
          <Text style={styles.itemTypeText}>{item.contentType}</Text>
        </View>
      </View>

      <View style={styles.flagReason}>
        <Ionicons name="warning" size={14} color={n.colors.error} />
        <Text style={styles.flagReasonText}>
          {FLAG_REASON_LABELS[item.flagReason] ?? item.flagReason}
        </Text>
      </View>

      {item.userNote && <Text style={styles.userNote}>"{item.userNote}"</Text>}

      <View style={styles.itemActions}>
        <Pressable
          style={styles.dismissButton}
          onPress={() => dismiss(item)}
          disabled={processing === item.topicId}
        >
          <Text style={styles.dismissButtonText}>Dismiss</Text>
        </Pressable>
        <Pressable
          style={[
            styles.regenerateButton,
            processing === item.topicId && styles.regenerateButtonDisabled,
          ]}
          onPress={() => regenerate(item)}
          disabled={processing === item.topicId}
        >
          {processing === item.topicId ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={styles.regenerateButtonText}>Regenerate</Text>
          )}
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={n.colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Flagged Content</Text>
        <View style={styles.backButton} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <LoadingOrb message="Loading flagged content..." size={120} />
        </View>
      ) : (
        <FlatList
          data={flaggedItems}
          renderItem={renderItem}
          keyExtractor={(item) => `${item.topicId}-${item.contentType}`}
          contentContainerStyle={[styles.listContent, flaggedItems.length === 0 && { flex: 1 }]}
          ListEmptyComponent={
            <EmptyState
              icon="checkmark-circle"
              iconSize={64}
              title="All Clear!"
              subtitle="You haven't flagged any content for review yet."
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: n.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: n.colors.border,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: n.colors.textPrimary,
  },
  listContent: { padding: 16 },
  itemCard: {
    backgroundColor: n.colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: n.colors.error,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  itemInfo: { flex: 1 },
  itemTitle: { fontSize: 16, fontWeight: '700', color: n.colors.textPrimary },
  itemSubject: { fontSize: 13, color: n.colors.textMuted, marginTop: 2 },
  itemType: {
    backgroundColor: `${n.colors.accent}15`,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  itemTypeText: {
    fontSize: 11,
    fontWeight: '600',
    color: n.colors.accent,
    textTransform: 'capitalize',
  },
  flagReason: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  flagReasonText: { fontSize: 13, color: n.colors.error, fontWeight: '500' },
  userNote: { fontSize: 13, color: n.colors.textMuted, fontStyle: 'italic', marginBottom: 12 },
  itemActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  dismissButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  dismissButtonText: { fontSize: 14, fontWeight: '600', color: n.colors.textMuted },
  regenerateButton: {
    backgroundColor: n.colors.accent,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  regenerateButtonDisabled: { opacity: 0.5 },
  regenerateButtonText: { fontSize: 14, fontWeight: '600', color: '#FFF' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
