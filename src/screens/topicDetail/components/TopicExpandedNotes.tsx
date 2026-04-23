import React from 'react';
import { View, TouchableOpacity, TextInput, Image } from 'react-native';
import { linearTheme as n } from '../../../theme/linearTheme';
import LinearText from '../../../components/primitives/LinearText';
import LinearSurface from '../../../components/primitives/LinearSurface';
import type { TopicWithProgress } from '../../../types';
import type {
  GeneratedStudyImageStyle,
  GeneratedStudyImageRecord,
} from '../../../db/queries/generatedStudyImages';
import { clearTopicCache } from '../../../db/queries/aiCache';
import { showSuccess, confirmDestructive } from '../../../components/dialogService';
import { TopicImage } from './TopicImage';
import { MasterButton } from './MasterButton';
import { styles } from '../TopicDetailScreen.styles';

interface TopicExpandedNotesProps {
  topic: TopicWithProgress;
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
}

export function TopicExpandedNotes({
  topic,
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
}: TopicExpandedNotesProps) {
  return (
    <LinearSurface padded={false} style={styles.notesExpanded}>
      <View style={styles.notesExpandedContent}>
        <TopicImage topicName={topic.name} />

        <TouchableOpacity
          style={styles.studyNowBtn}
          onPress={() => navigateToSession(topic.id)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Study this topic now"
        >
          <LinearText variant="label" tone="inverse" style={styles.studyNowText}>
            Start focused session
          </LinearText>
        </TouchableOpacity>

        <MasterButton
          onPress={() => markTopicMastered(topic)}
          isLoading={masteringTopicId === topic.id}
        />

        <LinearText variant="label" tone="accent" style={styles.notesLabel}>
          Your Notes / Mnemonic
        </LinearText>

        <TextInput
          style={styles.notesInput}
          value={noteText}
          onChangeText={setNoteText}
          placeholder="Write your own notes..."
          placeholderTextColor={n.colors.textMuted}
          multiline
          autoFocus
        />

        <View style={styles.imageActionRow}>
          {(['illustration', 'chart'] as GeneratedStudyImageStyle[]).map((style) => {
            const isGenerating = imageJobKey === `${topic.id}:${style}`;
            return (
              <TouchableOpacity
                key={`${topic.id}-${style}`}
                style={[styles.imageActionBtn, isGenerating && styles.imageActionBtnBusy]}
                onPress={() => handleGenerateNoteImage(topic, style)}
                disabled={!!imageJobKey}
                accessibilityRole="button"
                accessibilityLabel={
                  style === 'illustration' ? 'Generate note illustration' : 'Generate note chart'
                }
              >
                <LinearText variant="label" tone="accent" style={styles.imageActionBtnText}>
                  {isGenerating
                    ? 'Generating...'
                    : style === 'illustration'
                      ? 'Illustration'
                      : 'Chart'}
                </LinearText>
              </TouchableOpacity>
            );
          })}
        </View>

        {noteImages.length > 0 ? (
          <View style={styles.noteImagesWrap}>
            {noteImages.map((image) => (
              <Image
                key={`topic-note-image-${image.id}`}
                source={{ uri: image.localUri }}
                style={styles.noteGeneratedImage}
                resizeMode="cover"
              />
            ))}
          </View>
        ) : null}

        <View style={styles.notesActions}>
          <TouchableOpacity
            style={[styles.notesSave, savingNoteId === topic.id && styles.buttonLoading]}
            onPress={() => handleSaveNote(topic.id)}
            disabled={savingNoteId === topic.id}
            accessibilityRole="button"
            accessibilityLabel="Save note"
            accessibilityState={{ busy: savingNoteId === topic.id }}
          >
            <LinearText variant="label" tone="inverse" style={styles.notesSaveText}>
              {savingNoteId === topic.id ? 'Saving...' : 'Save note'}
            </LinearText>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.notesCancel}
            onPress={() => {
              const savedNote = topic.progress.userNotes ?? '';
              if (noteText.trim() !== savedNote.trim()) {
                confirmDiscardUnsavedNotes(() => setExpandedId(null));
              } else {
                setExpandedId(null);
              }
            }}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <LinearText variant="label" tone="secondary" style={styles.notesCancelText}>
              Cancel
            </LinearText>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.notesCancel, styles.clearCacheBtn]}
          onPress={async () => {
            const ok = await confirmDestructive(
              'Clear AI Cache?',
              'This will remove cached AI content for this topic. It will be regenerated next time you study it.',
              { confirmLabel: 'Clear' },
            );
            if (ok) {
              await clearTopicCache(topic.id);
              await showSuccess('Success', 'AI content cache cleared for this topic.');
            }
          }}
        >
          <LinearText variant="label" tone="error" style={styles.notesCancelText}>
            Clear AI Cache
          </LinearText>
        </TouchableOpacity>
      </View>
    </LinearSurface>
  );
}
