import React from 'react';
import { View, StyleSheet } from 'react-native';
import { DBMCI_SUBJECT_ORDER, DBMCI_WORKLOAD_OVERRIDES } from '../../../services/studyPlannerBuckets';
import { SUBJECTS_SEED } from '../../../constants/syllabus';
import { linearTheme as n } from '../../../theme/linearTheme';
import LinearSurface from '../../../components/primitives/LinearSurface';
import LinearText from '../../../components/primitives/LinearText';
import type { TopicWithProgress } from '../../../types';

const SUBJECT_MAP = new Map(SUBJECTS_SEED.map((s) => [s.shortCode, s]));
const DBMCI_TOTAL_DAYS = 137;

const cardStyles = StyleSheet.create({
  card: { marginBottom: n.spacing.sm, backgroundColor: 'transparent', borderWidth: 0 },
  title: { color: n.colors.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  subtitle: { color: n.colors.textSecondary, fontSize: 12, marginBottom: n.spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 0 },
  idx: { fontSize: 12, fontWeight: '800', width: 24 },
  dot: { width: 8, height: 8, borderRadius: 4, marginHorizontal: 8 },
  rowContent: { flex: 1 },
  subjectName: { color: n.colors.textPrimary, fontSize: 13, fontWeight: '600' },
  topicCount: { color: n.colors.textMuted, fontSize: 10, marginTop: 2 },
  meta: { marginLeft: 8 },
  days: { color: n.colors.textMuted, fontSize: 12, fontWeight: '700' },
});

export default function DBMCISyllabusCard({ allTopics }: { allTopics: TopicWithProgress[] }) {
  const subjectTopicCount = new Map<string, number>();
  for (const t of allTopics) {
    subjectTopicCount.set(t.subjectCode, (subjectTopicCount.get(t.subjectCode) ?? 0) + 1);
  }

  return (
    <LinearSurface style={cardStyles.card}>
      <LinearText style={cardStyles.title}>📋 DBMCI One — Study Sequence</LinearText>
      <LinearText style={cardStyles.subtitle}>
        Follow this order · {DBMCI_TOTAL_DAYS} lecture days · Topics auto-tracked from recordings
      </LinearText>
      {DBMCI_SUBJECT_ORDER.map((code, idx) => {
        const subject = SUBJECT_MAP.get(code);
        if (!subject) return null;
        const multiplier = DBMCI_WORKLOAD_OVERRIDES[code] ?? 1;
        const days = Math.round(multiplier * (DBMCI_TOTAL_DAYS / DBMCI_SUBJECT_ORDER.length));
        const topicCount = subjectTopicCount.get(code) ?? 0;

        return (
          <View key={code} style={cardStyles.row}>
            <LinearText style={[cardStyles.idx, { color: subject.colorHex }]}>{idx + 1}</LinearText>
            <View style={[cardStyles.dot, { backgroundColor: subject.colorHex }]} />
            <View style={cardStyles.rowContent}>
              <LinearText style={cardStyles.subjectName}>{subject.name}</LinearText>
              <LinearText style={cardStyles.topicCount}>{topicCount} topics</LinearText>
            </View>
            <View style={cardStyles.meta}>
              <LinearText style={cardStyles.days}>{days}d</LinearText>
            </View>
          </View>
        );
      })}
    </LinearSurface>
  );
}