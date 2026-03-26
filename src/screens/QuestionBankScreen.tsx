import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  StatusBar,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../constants/theme';
import ScreenHeader from '../components/ScreenHeader';
import {
  getQuestions,
  getQuestionCount,
  getDueForReview,
  getPracticeSet,
  toggleBookmark,
  markMastered,
  deleteQuestion,
  recordAttempt,
} from '../db/queries/questionBank';
import type { QuestionBankItem, QuestionFilters } from '../types';

type FilterMode = 'all' | 'due' | 'bookmarked' | 'mastered';

export default function QuestionBankScreen() {
  const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [totalCount, setTotalCount] = useState(0);
  const [dueCount, setDueCount] = useState(0);
  const [bookmarkedCount, setBookmarkedCount] = useState(0);
  const [masteredCount, setMasteredCount] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Practice mode
  const [practiceQuestions, setPracticeQuestions] = useState<QuestionBankItem[]>([]);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [practiceAnswer, setPracticeAnswer] = useState<number | null>(null);
  const [practiceScore, setPracticeScore] = useState(0);
  const [practiceActive, setPracticeActive] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const filters: QuestionFilters = {};
      if (filterMode === 'due') filters.dueForReview = true;
      if (filterMode === 'bookmarked') filters.isBookmarked = true;
      if (filterMode === 'mastered') filters.isMastered = true;

      const [items, total, due, bm, ms] = await Promise.all([
        getQuestions(filters),
        getQuestionCount(),
        getQuestionCount({ dueForReview: true }),
        getQuestionCount({ isBookmarked: true }),
        getQuestionCount({ isMastered: true }),
      ]);
      setQuestions(items);
      setTotalCount(total);
      setDueCount(due);
      setBookmarkedCount(bm);
      setMasteredCount(ms);
    } catch (err) {
      if (__DEV__) console.warn('[QuestionBank] Load error:', err);
    }
    setLoading(false);
  }, [filterMode]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const handleToggleBookmark = useCallback(
    async (id: number) => {
      await toggleBookmark(id);
      loadData();
    },
    [loadData],
  );

  const handleMarkMastered = useCallback(
    async (id: number, mastered: boolean) => {
      await markMastered(id, mastered);
      loadData();
    },
    [loadData],
  );

  const handleDelete = useCallback(
    (id: number) => {
      Alert.alert('Delete Question', 'Remove this question from your bank?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteQuestion(id);
            loadData();
          },
        },
      ]);
    },
    [loadData],
  );

  // ── Practice Mode ───────────────────────────────────────────────────────────
  const startPractice = useCallback(async () => {
    const set = await getPracticeSet(10);
    if (set.length === 0) {
      Alert.alert('No Questions', 'Add some questions first by studying topics or taking quizzes.');
      return;
    }
    setPracticeQuestions(set);
    setPracticeIndex(0);
    setPracticeAnswer(null);
    setPracticeScore(0);
    setPracticeActive(true);
  }, []);

  const currentPracticeQ = practiceQuestions[practiceIndex] ?? null;

  const handlePracticeAnswer = useCallback(
    async (optIndex: number) => {
      if (practiceAnswer !== null || !currentPracticeQ) return;
      setPracticeAnswer(optIndex);
      const correct = optIndex === currentPracticeQ.correctIndex;
      if (correct) setPracticeScore((s) => s + 1);
      await recordAttempt(currentPracticeQ.id, correct);
    },
    [practiceAnswer, currentPracticeQ],
  );

  const handlePracticeNext = useCallback(() => {
    if (practiceIndex + 1 >= practiceQuestions.length) {
      // End of practice
      setPracticeActive(false);
      loadData();
      Alert.alert(
        'Practice Complete',
        `Score: ${practiceScore + (practiceAnswer === currentPracticeQ?.correctIndex ? 0 : 0)}/${practiceQuestions.length}`,
      );
      return;
    }
    setPracticeIndex((i) => i + 1);
    setPracticeAnswer(null);
  }, [practiceIndex, practiceQuestions.length, practiceScore, practiceAnswer, currentPracticeQ, loadData]);

  // ── Render ──────────────────────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item }: { item: QuestionBankItem }) => {
      const isExpanded = expandedId === item.id;
      const accuracy =
        item.timesSeen > 0 ? Math.round((item.timesCorrect / item.timesSeen) * 100) : null;

      return (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.85}
          onPress={() => setExpandedId(isExpanded ? null : item.id)}
        >
          <View style={styles.cardHeader}>
            {item.subjectName ? (
              <View style={[styles.subjectChip, { backgroundColor: '#E040FB22' }]}>
                <Text style={styles.subjectChipText}>{item.subjectName}</Text>
              </View>
            ) : null}
            {item.topicName ? (
              <Text style={styles.topicLabel} numberOfLines={1}>
                {item.topicName}
              </Text>
            ) : null}
          </View>

          <Text style={styles.questionText} numberOfLines={isExpanded ? undefined : 2}>
            {item.question}
          </Text>

          {isExpanded && (
            <View style={styles.expandedContent}>
              {item.options.map((opt, i) => (
                <View
                  key={i}
                  style={[
                    styles.optionRow,
                    i === item.correctIndex && styles.correctOption,
                  ]}
                >
                  <Text style={styles.optionLetter}>
                    {String.fromCharCode(65 + i)}.
                  </Text>
                  <Text
                    style={[
                      styles.optionText,
                      i === item.correctIndex && styles.correctOptionText,
                    ]}
                  >
                    {opt}
                  </Text>
                </View>
              ))}
              {item.explanation ? (
                <Text style={styles.explanation}>{item.explanation}</Text>
              ) : null}
            </View>
          )}

          <View style={styles.cardFooter}>
            <View style={styles.statsRow}>
              {accuracy !== null && (
                <Text style={styles.statText}>
                  {accuracy}% ({item.timesCorrect}/{item.timesSeen})
                </Text>
              )}
              <Text style={styles.sourceChip}>{item.source.replace('_', ' ')}</Text>
            </View>
            <View style={styles.actions}>
              <TouchableOpacity onPress={() => handleToggleBookmark(item.id)} hitSlop={8}>
                <Ionicons
                  name={item.isBookmarked ? 'star' : 'star-outline'}
                  size={20}
                  color={item.isBookmarked ? '#FFD700' : theme.colors.textMuted}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleMarkMastered(item.id, !item.isMastered)}
                hitSlop={8}
              >
                <Ionicons
                  name={item.isMastered ? 'checkmark-circle' : 'checkmark-circle-outline'}
                  size={20}
                  color={item.isMastered ? theme.colors.success : theme.colors.textMuted}
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item.id)} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [expandedId, handleToggleBookmark, handleMarkMastered, handleDelete],
  );

  const keyExtractor = useCallback((item: QuestionBankItem) => item.id.toString(), []);

  const filters: { mode: FilterMode; label: string; count: number }[] = [
    { mode: 'all', label: 'All', count: totalCount },
    { mode: 'due', label: 'Due', count: dueCount },
    { mode: 'bookmarked', label: 'Starred', count: bookmarkedCount },
    { mode: 'mastered', label: 'Mastered', count: masteredCount },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <ScreenHeader title="Question Bank" subtitle={`${totalCount} questions saved`} />

      {/* Stats + Filter bar */}
      <View style={styles.filterBar}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f.mode}
            style={[styles.filterChip, filterMode === f.mode && styles.filterChipActive]}
            onPress={() => setFilterMode(f.mode)}
          >
            <Text
              style={[styles.filterChipText, filterMode === f.mode && styles.filterChipTextActive]}
            >
              {f.label} ({f.count})
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Action row */}
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.practiceBtn} onPress={startPractice} activeOpacity={0.8}>
          <Ionicons name="play-circle-outline" size={20} color={theme.colors.textPrimary} />
          <Text style={styles.practiceBtnText}>Practice</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : questions.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="help-circle-outline" size={48} color={theme.colors.textMuted} />
          <Text style={styles.emptyText}>No questions yet</Text>
          <Text style={styles.emptyHint}>
            Study topics or take quizzes to auto-save questions here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={questions}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ── Practice Modal ───────────────────────────────────────────────── */}
      <Modal visible={practiceActive} animationType="slide" transparent={false}>
        <SafeAreaView style={styles.safe}>
          <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
          <View style={styles.practiceHeader}>
            <TouchableOpacity
              onPress={() => {
                setPracticeActive(false);
                loadData();
              }}
            >
              <Ionicons name="close" size={28} color={theme.colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.practiceProgress}>
              {practiceIndex + 1} / {practiceQuestions.length}
            </Text>
            <Text style={styles.practiceScoreText}>
              {practiceScore} correct
            </Text>
          </View>

          {currentPracticeQ && (
            <View style={styles.practiceBody}>
              {currentPracticeQ.subjectName ? (
                <View style={[styles.subjectChip, { backgroundColor: '#E040FB22', marginBottom: 8 }]}>
                  <Text style={styles.subjectChipText}>{currentPracticeQ.subjectName}</Text>
                </View>
              ) : null}

              <Text style={styles.practiceQuestion}>{currentPracticeQ.question}</Text>

              <View style={styles.practiceOptions}>
                {currentPracticeQ.options.map((opt, i) => {
                  const isSelected = practiceAnswer === i;
                  const isCorrect = i === currentPracticeQ.correctIndex;
                  const showResult = practiceAnswer !== null;
                  const optStyle =
                    showResult && isCorrect
                      ? styles.practiceOptionCorrect
                      : showResult && isSelected && !isCorrect
                        ? styles.practiceOptionWrong
                        : styles.practiceOption;

                  return (
                    <TouchableOpacity
                      key={i}
                      style={optStyle}
                      onPress={() => handlePracticeAnswer(i)}
                      disabled={practiceAnswer !== null}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.practiceOptionLetter}>
                        {String.fromCharCode(65 + i)}.
                      </Text>
                      <Text style={styles.practiceOptionText}>{opt}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {practiceAnswer !== null && currentPracticeQ.explanation ? (
                <Text style={styles.practiceExplanation}>{currentPracticeQ.explanation}</Text>
              ) : null}

              {practiceAnswer !== null && (
                <TouchableOpacity style={styles.nextBtn} onPress={handlePracticeNext}>
                  <Text style={styles.nextBtnText}>
                    {practiceIndex + 1 >= practiceQuestions.length ? 'Finish' : 'Next'}
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color={theme.colors.textPrimary} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: theme.colors.surface,
  },
  filterChipActive: {
    backgroundColor: theme.colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  filterChipTextActive: {
    color: theme.colors.textPrimary,
  },
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 10,
  },
  practiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.md,
  },
  practiceBtnText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptyHint: {
    color: theme.colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  subjectChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  subjectChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E040FB',
  },
  topicLabel: {
    fontSize: 11,
    color: theme.colors.textMuted,
    flex: 1,
  },
  questionText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
  expandedContent: { marginTop: 10 },
  optionRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 4,
  },
  correctOption: {
    backgroundColor: '#4CAF5022',
  },
  optionLetter: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    width: 24,
  },
  optionText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  correctOptionText: {
    color: theme.colors.success,
    fontWeight: '600',
  },
  explanation: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 8,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statText: { color: theme.colors.textMuted, fontSize: 11 },
  sourceChip: {
    fontSize: 10,
    color: theme.colors.textMuted,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    textTransform: 'uppercase',
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14 },

  // ── Practice modal ──────────────────────────────────────────────────────────
  practiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  practiceProgress: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  practiceScoreText: {
    color: theme.colors.success,
    fontSize: 14,
    fontWeight: '600',
  },
  practiceBody: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  practiceQuestion: {
    color: theme.colors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 24,
    marginBottom: 20,
  },
  practiceOptions: { gap: 10 },
  practiceOption: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    padding: 14,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  practiceOptionCorrect: {
    flexDirection: 'row' as const,
    backgroundColor: '#4CAF5022',
    padding: 14,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.success,
  },
  practiceOptionWrong: {
    flexDirection: 'row' as const,
    backgroundColor: '#F4433622',
    padding: 14,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.error,
  },
  practiceOptionLetter: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
    width: 28,
  },
  practiceOptionText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    flex: 1,
  },
  practiceExplanation: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 16,
    lineHeight: 20,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: theme.borderRadius.md,
    marginTop: 20,
  },
  nextBtnText: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
});
