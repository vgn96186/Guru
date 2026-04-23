import React, { useCallback, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, FlatList, StatusBar, Modal } from 'react-native';
import LinearText from '../components/primitives/LinearText';
import { EmptyState } from '../components/primitives';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import LinearButton from '../components/primitives/LinearButton';
import LinearBadge from '../components/primitives/LinearBadge';
import LinearSurface from '../components/primitives/LinearSurface';
import { linearTheme as n } from '../theme/linearTheme';
import LoadingOrb from '../components/LoadingOrb';
import { MarkdownRender } from '../components/MarkdownRender';
import ScreenHeader from '../components/ScreenHeader';
import { ResponsiveContainer } from '../hooks/useResponsive';
import {
  getQuestions,
  getQuestionCount,
  getPracticeSet,
  toggleBookmark,
  markMastered,
  deleteQuestion,
  recordAttempt,
} from '../db/queries/questionBank';
import type { QuestionBankItem, QuestionFilters } from '../types';
import { emphasizeHighYieldMarkdown } from '../utils/highlightMarkdown';
import { confirmDestructive, showInfo } from '../components/dialogService';

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
    async (id: number) => {
      const ok = await confirmDestructive(
        'Delete Question',
        'Remove this question from your bank?',
      );
      if (ok) {
        await deleteQuestion(id);
        loadData();
      }
    },
    [loadData],
  );

  // ── Practice Mode ───────────────────────────────────────────────────────────
  const startPractice = useCallback(async () => {
    const set = await getPracticeSet(10);
    if (set.length === 0) {
      showInfo('No Questions', 'Add some questions first by studying topics or taking quizzes.');
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
      showInfo('Practice Complete', `Score: ${practiceScore}/${practiceQuestions.length}`);
      return;
    }
    setPracticeIndex((i) => i + 1);
    setPracticeAnswer(null);
  }, [practiceIndex, practiceQuestions.length, practiceScore, loadData]);

  // ── Render ──────────────────────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item }: { item: QuestionBankItem }) => {
      const isExpanded = expandedId === item.id;
      const accuracy =
        item.timesSeen > 0 ? Math.round((item.timesCorrect / item.timesSeen) * 100) : null;

      return (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setExpandedId(isExpanded ? null : item.id)}
        >
          <LinearSurface padded={false} style={styles.card}>
            <View style={styles.cardHeader}>
              {item.subjectName ? (
                <LinearBadge label={item.subjectName} variant="accent" style={styles.subjectChip} />
              ) : null}
              {item.topicName ? (
                <LinearText style={styles.topicLabel} numberOfLines={1}>
                  {item.topicName}
                </LinearText>
              ) : null}
            </View>

            <LinearText style={styles.questionText} numberOfLines={isExpanded ? undefined : 2}>
              {item.question}
            </LinearText>

            {isExpanded && (
              <View style={styles.expandedContent}>
                {item.options.map((opt, i) => (
                  <View
                    key={i}
                    style={[styles.optionRow, i === item.correctIndex && styles.correctOption]}
                  >
                    <LinearText style={styles.optionLetter}>
                      {String.fromCharCode(65 + i)}.
                    </LinearText>
                    <LinearText
                      style={[
                        styles.optionText,
                        i === item.correctIndex && styles.correctOptionText,
                      ]}
                    >
                      {opt}
                    </LinearText>
                  </View>
                ))}
                {item.explanation ? (
                  <View style={styles.explanationWrap}>
                    <MarkdownRender
                      content={emphasizeHighYieldMarkdown(item.explanation)}
                      compact
                    />
                  </View>
                ) : null}
              </View>
            )}

            <View style={styles.cardFooter}>
              <View style={styles.statsRow}>
                {accuracy !== null && (
                  <LinearText style={styles.statText}>
                    {accuracy}% ({item.timesCorrect}/{item.timesSeen})
                  </LinearText>
                )}
                <LinearText style={styles.sourceChip}>{item.source.replace('_', ' ')}</LinearText>
              </View>
              <View style={styles.actions}>
                <TouchableOpacity onPress={() => handleToggleBookmark(item.id)} hitSlop={8}>
                  <Ionicons
                    name={item.isBookmarked ? 'star' : 'star-outline'}
                    size={20}
                    color={item.isBookmarked ? n.colors.warning : n.colors.textMuted}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleMarkMastered(item.id, !item.isMastered)}
                  hitSlop={8}
                >
                  <Ionicons
                    name={item.isMastered ? 'checkmark-circle' : 'checkmark-circle-outline'}
                    size={20}
                    color={item.isMastered ? n.colors.success : n.colors.textMuted}
                  />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(item.id)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color={n.colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
          </LinearSurface>
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

  const summaryCards = [
    { label: 'Saved', value: totalCount.toString(), tone: 'primary' as const },
    { label: 'Due', value: dueCount.toString(), tone: 'warning' as const },
    { label: 'Starred', value: bookmarkedCount.toString(), tone: 'accent' as const },
    { label: 'Mastered', value: masteredCount.toString(), tone: 'success' as const },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ResponsiveContainer style={styles.flex}>
        <ScreenHeader title="Question Bank" showSettings />

        <View style={styles.summaryRow}>
          {summaryCards.map((card) => (
            <LinearSurface key={card.label} compact padded={false} style={styles.summaryCard}>
              <View style={styles.summaryCardContent}>
                <LinearText variant="title" tone={card.tone} style={styles.summaryValue}>
                  {card.value}
                </LinearText>
                <LinearText variant="caption" tone="secondary" style={styles.summaryLabel}>
                  {card.label}
                </LinearText>
              </View>
            </LinearSurface>
          ))}
        </View>

        <View style={styles.filterBar}>
          {filters.map((f) => (
            <TouchableOpacity
              key={f.mode}
              onPress={() => setFilterMode(f.mode)}
              activeOpacity={0.8}
            >
              <LinearSurface
                compact
                padded={false}
                style={[styles.filterChip, filterMode === f.mode && styles.filterChipActive]}
              >
                <LinearText
                  variant="caption"
                  style={[
                    styles.filterChipText,
                    filterMode === f.mode && styles.filterChipTextActive,
                  ]}
                >
                  {f.label} ({f.count})
                </LinearText>
              </LinearSurface>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.actionRow}>
          <LinearButton
            variant="secondary"
            style={styles.practiceBtn}
            onPress={startPractice}
            leftIcon={
              <Ionicons name="play-circle-outline" size={20} color={n.colors.textPrimary} />
            }
            label="Practice 10-question set"
          />
        </View>

        {loading ? (
          <View style={styles.center}>
            <LoadingOrb message="Loading questions..." size={120} />
          </View>
        ) : (
          <FlatList
            data={questions}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={[styles.list, questions.length === 0 && { flex: 1 }]}
            showsVerticalScrollIndicator={false}
            initialNumToRender={8}
            maxToRenderPerBatch={10}
            windowSize={8}
            ListEmptyComponent={
              <EmptyState
                icon="help-circle-outline"
                iconSize={48}
                title="No questions saved yet"
                subtitle="Questions are generated automatically as you study topics."
              />
            }
          />
        )}
      </ResponsiveContainer>

      {/* ── Practice Modal ───────────────────────────────────────────────── */}
      <Modal visible={practiceActive} animationType="slide" transparent={false}>
        <SafeAreaView style={styles.safe}>
          <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
          <View style={styles.practiceHeader}>
            <TouchableOpacity
              onPress={() => {
                setPracticeActive(false);
                loadData();
              }}
            >
              <Ionicons name="close" size={28} color={n.colors.textPrimary} />
            </TouchableOpacity>
            <LinearText style={styles.practiceProgress}>
              {practiceIndex + 1} / {practiceQuestions.length}
            </LinearText>
            <LinearText style={styles.practiceScoreText}>{practiceScore} correct</LinearText>
          </View>

          {currentPracticeQ && (
            <View style={styles.practiceBody}>
              {currentPracticeQ.subjectName ? (
                <LinearBadge
                  label={currentPracticeQ.subjectName}
                  variant="accent"
                  style={styles.subjectChip}
                />
              ) : null}

              <LinearText style={styles.practiceQuestion}>{currentPracticeQ.question}</LinearText>

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
                      <LinearText style={styles.practiceOptionLetter}>
                        {String.fromCharCode(65 + i)}.
                      </LinearText>
                      <LinearText style={styles.practiceOptionText}>{opt}</LinearText>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {practiceAnswer !== null && currentPracticeQ.explanation ? (
                <View style={styles.practiceExplanationWrap}>
                  <MarkdownRender
                    content={emphasizeHighYieldMarkdown(currentPracticeQ.explanation)}
                    compact
                  />
                </View>
              ) : null}

              {practiceAnswer !== null && (
                <TouchableOpacity style={styles.nextBtn} onPress={handlePracticeNext}>
                  <LinearText style={styles.nextBtnText}>
                    {practiceIndex + 1 >= practiceQuestions.length ? 'Finish' : 'Next'}
                  </LinearText>
                  <Ionicons name="arrow-forward" size={18} color={n.colors.textPrimary} />
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
  safe: { flex: 1, backgroundColor: n.colors.background },
  flex: { flex: 1 },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: n.spacing.sm,
    paddingHorizontal: n.spacing.md,
    paddingBottom: n.spacing.sm,
  },
  summaryCard: {
    width: '48%',
  },
  summaryCardContent: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  summaryValue: {
    color: n.colors.textPrimary,
  },
  summaryLabel: {
    letterSpacing: 0.2,
  },
  filterBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  filterChip: {
    minHeight: 0,
  },
  filterChipActive: {
    borderColor: `${n.colors.accent}66`,
    backgroundColor: n.colors.primaryTintSoft,
  },
  filterChipText: {
    color: n.colors.textSecondary,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipTextActive: {
    color: n.colors.accent,
  },
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 10,
  },
  practiceBtn: {
    minWidth: 220,
    minHeight: 52,
  },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emptyText: {
    color: n.colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptyHint: {
    color: n.colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  card: {
    borderRadius: n.radius.md,
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  subjectChip: {
    marginBottom: 2,
  },
  topicLabel: {
    fontSize: 11,
    lineHeight: 16,
    color: n.colors.textMuted,
    flex: 1,
  },
  questionText: {
    color: n.colors.textPrimary,
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
    backgroundColor: `${n.colors.success}18`,
  },
  optionLetter: {
    color: n.colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    width: 24,
  },
  optionText: {
    color: n.colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  correctOptionText: {
    color: n.colors.success,
    fontWeight: '600',
  },
  explanationWrap: { marginTop: 8 },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statText: { color: n.colors.textMuted, fontSize: 11 },
  sourceChip: {
    fontSize: 10,
    color: n.colors.textMuted,
    backgroundColor: n.colors.background,
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
    color: n.colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  practiceScoreText: {
    color: n.colors.success,
    fontSize: 14,
    fontWeight: '600',
  },
  practiceBody: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  practiceQuestion: {
    color: n.colors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 24,
    marginBottom: 20,
  },
  practiceOptions: { gap: 10 },
  practiceOption: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: n.radius.md,
  },
  practiceOptionCorrect: {
    flexDirection: 'row' as const,
    backgroundColor: `${n.colors.success}18`,
    padding: 14,
    borderRadius: n.radius.md,
    borderWidth: 1,
    borderColor: n.colors.success,
  },
  practiceOptionWrong: {
    flexDirection: 'row' as const,
    backgroundColor: `${n.colors.error}18`,
    padding: 14,
    borderRadius: n.radius.md,
    borderWidth: 1,
    borderColor: n.colors.error,
  },
  practiceOptionLetter: {
    color: n.colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
    width: 28,
  },
  practiceOptionText: {
    color: n.colors.textPrimary,
    fontSize: 14,
    flex: 1,
  },
  practiceExplanationWrap: { marginTop: 16 },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: n.colors.accent,
    paddingVertical: 14,
    borderRadius: n.radius.md,
    marginTop: 20,
  },
  nextBtnText: {
    color: n.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
});
