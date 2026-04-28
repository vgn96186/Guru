import { View } from 'react-native';
import LinearSurface from '../../../../components/primitives/LinearSurface';
import LinearText from '../../../../components/primitives/LinearText';
import { styles } from '../styles';

interface SummaryCardProps {
  visibleCount: number;
  notesCount: number;
  subjectCount: number;
  taggedCount: number;
  unlabeledCount: number;
}

export default function NotesVaultSummaryCard({
  visibleCount,
  notesCount,
  subjectCount,
  taggedCount,
  unlabeledCount,
}: SummaryCardProps) {
  const summaryCards = [
    { label: 'Notes', value: notesCount.toString(), tone: 'accent' as const },
    { label: 'Subjects', value: subjectCount.toString(), tone: 'primary' as const },
    { label: 'Tagged', value: taggedCount.toString(), tone: 'success' as const },
    {
      label: 'Need labels',
      value: unlabeledCount.toString(),
      tone: unlabeledCount > 0 ? ('warning' as const) : ('success' as const),
    },
  ];

  return (
    <LinearSurface compact style={styles.summaryCard}>
      <View style={styles.summaryHeader}>
        <View style={styles.summaryCopy}>
          <LinearText variant="meta" tone="accent" style={styles.summaryEyebrow}>
            STUDY LIBRARY
          </LinearText>
          <LinearText variant="sectionTitle" style={styles.summaryTitle}>
            Processed notes ready for revision
          </LinearText>
          <LinearText variant="bodySmall" tone="secondary" style={styles.summaryText}>
            Search by subject or topic, clean up weak notes, and send the current note set straight
            into Guru.
          </LinearText>
        </View>
        <View style={styles.summaryPill}>
          <LinearText variant="chip" tone="accent">
            {visibleCount} visible
          </LinearText>
        </View>
      </View>
      <View style={styles.summaryMetricsRow}>
        {summaryCards.map((card) => (
          <View key={card.label} style={styles.summaryMetricCard}>
            <LinearText variant="title" tone={card.tone} style={styles.summaryMetricValue}>
              {card.value}
            </LinearText>
            <LinearText variant="caption" tone="secondary" style={styles.summaryMetricLabel}>
              {card.label}
            </LinearText>
          </View>
        ))}
      </View>
    </LinearSurface>
  );
}
