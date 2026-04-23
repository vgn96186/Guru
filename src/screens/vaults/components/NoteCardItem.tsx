import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import LinearText from '../../../components/primitives/LinearText';
import SubjectChip from '../../../components/SubjectChip';
import TopicPillRow from '../../../components/TopicPillRow';
import { linearTheme as n } from '../../../theme/linearTheme';
import { LectureHistoryItem } from '../../../db/queries/aiCache';
import { CONFIDENCE_LABELS } from '../../../constants/gamification';

type NoteItem = LectureHistoryItem;

interface NoteCardItemProps {
  item: NoteItem;
  isSelected: boolean;
  isSelectionMode: boolean;
  onPress: (item: NoteItem) => void;
  onLongPress: (id: number) => void;
  wordCount: number;
  subjectLabel: string;
  title: string;
}

export function formatDate(timestamp: number): string {
  if (!timestamp) return 'Unknown Date';
  const d = new Date(timestamp);
  const isToday = new Date().toDateString() === d.toDateString();
  return isToday
    ? `Today, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const SUBJECT_COLORS: Record<string, string> = {
  Physiology: n.colors.success,
  Anatomy: '#2196F3',
  Biochemistry: n.colors.warning,
  Pathology: n.colors.error,
  Pharmacology: '#9C27B0',
  Microbiology: '#00BCD4',
  'Forensic Medicine': '#795548',
  ENT: '#607D8B',
  Ophthalmology: '#3F51B5',
  'Community Medicine': '#8BC34A',
  Surgery: '#E91E63',
  Medicine: '#009688',
  OBG: '#FF5722',
  Pediatrics: '#CDDC39',
  Orthopedics: '#FFC107',
  Dermatology: '#673AB7',
  Psychiatry: '#00ACC1',
  Radiology: '#546E7A',
  Anesthesia: '#D32F2F',
};

export function NoteCardItem({
  item,
  isSelected,
  isSelectionMode,
  onPress,
  onLongPress,
  wordCount,
  subjectLabel,
  title,
}: NoteCardItemProps) {
  return (
    <TouchableOpacity
      style={[styles.card, isSelected && styles.cardSelected]}
      activeOpacity={0.7}
      onLongPress={() => onLongPress(item.id)}
      delayLongPress={220}
      onPress={() => onPress(item)}
    >
      {isSelectionMode && (
        <View style={styles.selectIcon}>
          <Ionicons
            name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
            size={22}
            color={isSelected ? n.colors.accent : n.colors.textMuted}
          />
        </View>
      )}
      <View style={styles.cardHeader}>
        <SubjectChip
          subject={subjectLabel}
          color="#fff"
          backgroundColor={SUBJECT_COLORS[subjectLabel] ?? n.colors.textMuted}
          borderColor={SUBJECT_COLORS[subjectLabel] ?? n.colors.textMuted}
          style={styles.subjectChip}
        />
      </View>
      <View style={styles.dateRow}>
        <LinearText style={styles.dateText}>{formatDate(item.createdAt)}</LinearText>
      </View>
      <LinearText style={styles.titleText} numberOfLines={3}>
        {title}
      </LinearText>
      {item.topics.length > 0 && (
        <TopicPillRow
          topics={item.topics}
          wrap
          maxVisible={4}
          rowStyle={styles.topicsRow}
          pillStyle={styles.topicPill}
          moreBadgeStyle={styles.moreBadge}
        />
      )}
      <View style={styles.cardFooter}>
        {item.confidence > 0 && (
          <LinearText
            style={[
              styles.confidenceBadge,
              item.confidence === 3
                ? styles.confidenceBadgeStrong
                : item.confidence === 2
                  ? styles.confidenceBadgeMid
                  : styles.confidenceBadgeLight,
            ]}
          >
            {CONFIDENCE_LABELS[item.confidence as 1 | 2 | 3]}
          </LinearText>
        )}
        <LinearText style={styles.wordCount}>
          {wordCount.toLocaleString()} words
        </LinearText>
        {item.appName ? (
          <LinearText style={styles.appBadge}>via {item.appName}</LinearText>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: n.colors.surface,
    borderRadius: n.radius.md,
    padding: n.spacing.xl,
    marginBottom: n.spacing.md,
    borderWidth: 1,
    borderColor: n.colors.borderLight,
    position: 'relative',
    overflow: 'hidden',
  },
  cardSelected: {
    borderColor: n.colors.accent,
    backgroundColor: n.colors.background,
  },
  selectIcon: {
    position: 'absolute',
    top: n.spacing.lg,
    right: n.spacing.lg,
    zIndex: 10,
    backgroundColor: n.colors.surface,
    borderRadius: n.radius.full,
    padding: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: n.spacing.md,
  },
  subjectChip: {
    paddingHorizontal: n.spacing.md,
    paddingVertical: 6,
    borderRadius: n.radius.md,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: n.spacing.xs,
  },
  dateText: {
    color: n.colors.textMuted,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  titleText: {
    fontSize: 18,
    color: n.colors.textPrimary,
    marginBottom: n.spacing.md,
    lineHeight: 24,
    maxWidth: '90%',
  },
  topicsRow: {
    marginBottom: n.spacing.md,
  },
  topicPill: {
    backgroundColor: n.colors.background,
    borderColor: n.colors.border,
  },
  moreBadge: {
    backgroundColor: n.colors.border,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: n.spacing.sm,
    paddingTop: n.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: n.colors.borderLight,
  },
  confidenceBadge: {
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
  confidenceBadgeStrong: {
    backgroundColor: '#E8F5E9',
    color: '#2E7D32',
  },
  confidenceBadgeMid: {
    backgroundColor: '#FFF3E0',
    color: '#E65100',
  },
  confidenceBadgeLight: {
    backgroundColor: '#FFEBEE',
    color: '#C62828',
  },
  wordCount: {
    fontSize: 12,
    color: n.colors.textMuted,
  },
  appBadge: {
    fontSize: 12,
    color: n.colors.accent,
    backgroundColor: n.colors.accent + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
});
