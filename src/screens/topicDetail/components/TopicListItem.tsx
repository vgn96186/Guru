import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme as n } from '../../../theme/linearTheme';
import LinearText from '../../../components/primitives/LinearText';
import LinearSurface from '../../../components/primitives/LinearSurface';
import LinearBadge from '../../../components/primitives/LinearBadge';
import { STATUS_COLORS, STATUS_LABELS, formatReviewDate } from '../logic/topicDetailLogic';
import { TopicExpandedNotes } from './TopicExpandedNotes';
import { styles } from '../TopicDetailScreen.styles';
import type { TopicWithProgress } from '../../../types';
import type {
  GeneratedStudyImageStyle,
  GeneratedStudyImageRecord,
} from '../../../db/queries/generatedStudyImages';

interface TopicListItemProps {
  item: TopicWithProgress;
  isParent: boolean;
  depth: number;
  isCollapsed: boolean;
  isHighYield: boolean;
  isDue: boolean;
  isWeak: boolean;
  parentChildren: TopicWithProgress[];
  parentCompleted: number;
  parentDue: number;
  parentHighYield: number;
  handleTopicPress: (t: TopicWithProgress) => void;
  expandedId: number | null;
  noteText: string;
  setNoteText: (text: string) => void;
  savingNoteId: number | null;
  handleSaveNote: (topicId: number) => void;
  confirmDiscardUnsavedNotes: (onDiscard: () => void) => void;
  setExpandedId: (id: number | null) => void;
  navigateToSession: (topicId: number) => void;
  markTopicMastered: (topic: TopicWithProgress) => void;
  masteringTopicId: number | null;
  imageJobKey: string | null;
  handleGenerateNoteImage: (topic: TopicWithProgress, style: GeneratedStudyImageStyle) => void;
  noteImages: GeneratedStudyImageRecord[];
  today: string;
}

export function TopicListItem({
  item,
  isParent,
  depth,
  isCollapsed,
  isHighYield,
  isDue,
  isWeak,
  parentChildren,
  parentCompleted,
  parentDue,
  parentHighYield,
  handleTopicPress,
  expandedId,
  noteText,
  setNoteText,
  savingNoteId,
  handleSaveNote,
  confirmDiscardUnsavedNotes,
  setExpandedId,
  navigateToSession,
  markTopicMastered,
  masteringTopicId,
  imageJobKey,
  handleGenerateNoteImage,
  noteImages,
  today,
}: TopicListItemProps) {
  return (
    <View>
      <TouchableOpacity
        onPress={() => handleTopicPress(item)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={isParent ? `Topic group: ${item.name}` : item.name}
        accessibilityHint={
          isParent ? 'Double tap to expand or collapse' : 'Double tap to open topic'
        }
      >
        <LinearSurface
          compact
          padded={false}
          style={[
            styles.topicRow,
            isParent && styles.parentRow,
            depth > 0 && { marginLeft: Math.min(depth * 12, 48) },
          ]}
        >
          <View
            style={[styles.statusBar, { backgroundColor: STATUS_COLORS[item.progress.status] }]}
          />
          <View style={styles.topicInfo}>
            <View style={styles.nameRow}>
              {isParent ? (
                <Ionicons
                  name={isCollapsed ? 'chevron-forward' : 'chevron-down'}
                  size={14}
                  color={n.colors.accent}
                  style={styles.folderIcon}
                />
              ) : null}
              <LinearText
                variant={isParent ? 'label' : 'body'}
                style={[styles.topicName, isParent && styles.parentName]}
                numberOfLines={3}
                ellipsizeMode="tail"
              >
                {item.name}
              </LinearText>
            </View>
            {isParent && parentChildren.length > 0 ? (
              <View style={styles.parentSummaryRow}>
                <LinearText variant="caption" style={styles.parentSummaryText}>
                  {parentCompleted}/{parentChildren.length} micro-topics covered
                </LinearText>
                {parentDue > 0 ? (
                  <LinearText variant="caption" style={styles.parentDueText}>
                    {parentDue} due
                  </LinearText>
                ) : null}
                {parentHighYield > 0 ? (
                  <LinearText variant="caption" style={styles.parentHighYieldText}>
                    {parentHighYield} HY
                  </LinearText>
                ) : null}
              </View>
            ) : null}
            {!isParent ? (
              <View style={styles.topicMeta}>
                <LinearText variant="caption" style={styles.topicMetaText}>
                  {item.estimatedMinutes}min - Priority {item.inicetPriority}/10
                </LinearText>
                {item.progress.timesStudied > 0 ? (
                  <LinearText variant="caption" style={styles.studiedText}>
                    {' '}
                    - Studied {item.progress.timesStudied}x
                  </LinearText>
                ) : null}
              </View>
            ) : null}
            {!isParent ? (
              <View style={styles.badgeRow}>
                {isHighYield ? <LinearBadge label="High Yield" variant="warning" /> : null}
                {isDue ? <LinearBadge label="Due" variant="error" /> : null}
                {isWeak ? <LinearBadge label="Weak" variant="accent" /> : null}
              </View>
            ) : null}
            {item.progress.fsrsDue && !isParent ? (
              <View
                style={[
                  styles.reviewBadge,
                  item.progress.fsrsDue.slice(0, 10) < today && styles.reviewOverdue,
                ]}
              >
                <LinearText
                  variant="caption"
                  style={[
                    styles.reviewText,
                    item.progress.fsrsDue.slice(0, 10) < today && styles.reviewTextOverdue,
                  ]}
                >
                  {formatReviewDate(item.progress.fsrsDue.slice(0, 10))}
                </LinearText>
              </View>
            ) : null}
            {item.progress.userNotes ? (
              <LinearText
                variant="bodySmall"
                tone="accent"
                style={styles.notePreview}
                numberOfLines={3}
              >
                Notes: {item.progress.userNotes}
              </LinearText>
            ) : null}
          </View>
          <View style={styles.topicRight}>
            {item.progress.confidence > 0 ? (
              <View
                style={styles.confRow}
                accessibilityLabel={`Confidence: ${item.progress.confidence} of 5`}
                accessibilityRole="text"
              >
                <LinearText variant="meta" style={styles.confLabel}>
                  {item.progress.confidence}/5
                </LinearText>
                {[1, 2, 3, 4, 5].map((i) => (
                  <View
                    key={i}
                    style={[
                      styles.confDot,
                      {
                        backgroundColor:
                          i <= item.progress.confidence ? n.colors.warning : n.colors.border,
                      },
                    ]}
                  />
                ))}
              </View>
            ) : null}
            <LinearText
              variant="caption"
              style={[styles.statusLabel, { color: STATUS_COLORS[item.progress.status] }]}
            >
              {STATUS_LABELS[item.progress.status]}
            </LinearText>
          </View>
        </LinearSurface>
      </TouchableOpacity>
      {expandedId === item.id && (
        <TopicExpandedNotes
          topic={item}
          noteText={noteText}
          setNoteText={setNoteText}
          savingNoteId={savingNoteId}
          handleSaveNote={handleSaveNote}
          confirmDiscardUnsavedNotes={confirmDiscardUnsavedNotes}
          setExpandedId={setExpandedId}
          navigateToSession={navigateToSession}
          markTopicMastered={markTopicMastered}
          masteringTopicId={masteringTopicId}
          imageJobKey={imageJobKey}
          handleGenerateNoteImage={handleGenerateNoteImage}
          noteImages={noteImages}
        />
      )}
    </View>
  );
}
