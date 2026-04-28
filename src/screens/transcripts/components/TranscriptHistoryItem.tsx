import React from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import LinearText from '../../../components/primitives/LinearText';
import LinearSurface from '../../../components/primitives/LinearSurface';
import SubjectChip from '../../../components/SubjectChip';
import TopicPillRow from '../../../components/TopicPillRow';
import { linearTheme as n } from '../../../theme/linearTheme';
import { CONFIDENCE_LABELS } from '../../../constants/gamification';
import { type LectureHistoryItem } from '../../../db/queries/aiCache';
import { resolveLectureSubjectLabel } from '../../../services/lecture/lectureIdentity';
import { extractFirstLine, getLectureTitle } from '../../../services/transcripts/formatters';
import { lectureNeedsAiNote, lectureNeedsReview } from '../../../services/lecture/lectureManager';
import { styles } from '../TranscriptHistoryScreen.styles';

const SUBJECT_COLORS: Record<string, string> = {
  Physiology: n.colors.success,
  Anatomy: '#2196F3',
  Biochemistry: '#9C27B0',
  Pathology: '#E91E63',
  Microbiology: n.colors.warning,
  Pharmacology: '#00BCD4',
  Medicine: '#3F51B5',
  Surgery: n.colors.error,
  OBG: '#E91E63',
  Pediatrics: '#8BC34A',
  Ophthalmology: '#03A9F4',
  ENT: '#FFEB3B',
  Psychiatry: '#673AB7',
  Radiology: '#607D8B',
  Anesthesia: '#795548',
  Dermatology: '#FF5722',
  Orthopedics: '#009688',
  'Forensic Medicine': '#455A64',
  SPM: '#CDDC39',
  Unknown: n.colors.textMuted,
  General: n.colors.textMuted,
};

interface TranscriptHistoryItemProps {
  item: LectureHistoryItem;
  isSelected: boolean;
  isSelectionMode: boolean;
  onLongPress: (id: number) => void;
  onToggleSelection: (id: number) => void;
  onSelect: (item: LectureHistoryItem) => void;
  formatDate: (timestamp: number) => string;
  formatDuration: (mins: number | null) => string;
}

export const TranscriptHistoryItem = React.memo(function TranscriptHistoryItem({
  item,
  isSelected,
  isSelectionMode,
  onLongPress,
  onToggleSelection,
  onSelect,
  formatDate,
  formatDuration,
}: TranscriptHistoryItemProps) {
  const subjectLabel = resolveLectureSubjectLabel(item);
  return (
    <Pressable
      onLongPress={() => onLongPress(item.id)}
      delayLongPress={220}
      onPress={() => {
        if (isSelectionMode) {
          Haptics.selectionAsync();
          onToggleSelection(item.id);
          return;
        }
        Haptics.selectionAsync();
        onSelect(item);
      }}
    >
      <LinearSurface
        padded={false}
        style={[styles.noteCard, isSelected && styles.noteCardSelected]}
      >
        {isSelectionMode ? (<View style={styles.selectionTickWrap}>
          <Ionicons
            name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
            size={22}
            color={isSelected ? n.colors.accent : n.colors.textMuted}
          />
        </View>) : null}
        <View style={styles.noteHeader}>
          <SubjectChip
            subject={subjectLabel}
            color="#fff"
            backgroundColor={SUBJECT_COLORS[subjectLabel] ?? n.colors.textMuted}
            borderColor={SUBJECT_COLORS[subjectLabel] ?? n.colors.textMuted}
            style={styles.subjectChip}
          />
          <LinearText style={styles.dateText}>{formatDate(item.createdAt)}</LinearText>
        </View>

        {item.appName ? <LinearText style={styles.appBadge}>via {item.appName}</LinearText> : null}

        <LinearText style={styles.summaryText} numberOfLines={3}>
          {getLectureTitle(item)}
        </LinearText>
        <LinearText style={styles.summaryPreviewText} numberOfLines={3}>
          {item.summary || extractFirstLine(item.note)}
        </LinearText>
        <View style={styles.statusRow}>
          {item.recordingPath ? (
            <LinearText style={styles.statusBadge}>Recording</LinearText>
          ) : null}
          {item.transcript ? (
            <LinearText style={styles.statusBadge}>Transcript</LinearText>
          ) : null}
          {lectureNeedsAiNote(item) ? (
            <LinearText style={styles.statusBadgeWarn}>Needs AI Note</LinearText>
          ) : null}
          {lectureNeedsReview(item) ? (
            <LinearText style={styles.statusBadgeWarn}>Needs Review</LinearText>
          ) : null}
        </View>

        <View style={styles.noteFooter}>
          {item.topics.length > 0 ? (<TopicPillRow
            topics={item.topics}
            wrap
            maxVisible={3}
            rowStyle={styles.topicsRow}
            pillStyle={styles.topicPill}
            moreBadgeStyle={styles.moreBadge}
          />) : null}
          <View style={styles.metaRow}>
            {item.durationMinutes ? (
              <LinearText style={styles.metaText}>
                <Ionicons name="time-outline" size={12} color={n.colors.textMuted} />{' '}
                {formatDuration(item.durationMinutes)}
              </LinearText>
            ) : null}
            <LinearText
              style={[
                styles.confidenceBadge,
                {
                  backgroundColor:
                    item.confidence === 3
                      ? n.colors.success
                      : item.confidence === 2
                        ? n.colors.warning
                        : n.colors.error,
                },
              ]}
            >
              {CONFIDENCE_LABELS[item.confidence as 1 | 2 | 3]}
            </LinearText>
          </View>
        </View>
      </LinearSurface>
    </Pressable>
  );
});
