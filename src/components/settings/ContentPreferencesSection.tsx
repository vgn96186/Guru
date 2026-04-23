import React from 'react';
import { View, StyleSheet } from 'react-native';
import { linearTheme as n } from '../../theme/linearTheme';
import LinearButton from '../primitives/LinearButton';
import LinearChipButton from '../primitives/LinearChipButton';
import LinearText from '../primitives/LinearText';
import type { ContentType, Subject } from '../../types';

interface ContentPreferencesSectionProps {
  subjects: Subject[];
  focusSubjectIds: number[];
  onFocusSubjectToggle: (id: number) => void;
  onClearFocus: () => void;
  allContentTypes: { type: ContentType; label: string }[];
  blockedTypes: ContentType[];
  onContentTypeToggle: (type: ContentType) => void;
}

function ContentPreferencesSection({
  subjects,
  focusSubjectIds,
  onFocusSubjectToggle,
  onClearFocus,
  allContentTypes,
  blockedTypes,
  onContentTypeToggle,
}: ContentPreferencesSectionProps) {
  return (
    <View style={styles.container}>
      <LinearText variant="title" style={styles.subTitle}>
        Focus Subjects
      </LinearText>
      <LinearText variant="caption" tone="muted" style={styles.hint}>
        Pin subjects to limit sessions to those areas only.
      </LinearText>
      <View style={styles.chipGrid}>
        {subjects.map((subject) => {
          const isFocused = focusSubjectIds.includes(subject.id);
          return (
            <LinearChipButton
              key={subject.id}
              label={subject.shortCode}
              style={styles.chip}
              selected={isFocused}
              selectedStyle={
                isFocused
                  ? {
                      backgroundColor: subject.colorHex + '33',
                      borderColor: subject.colorHex,
                    }
                  : undefined
              }
              textStyle={styles.chipText}
              selectedTextStyle={isFocused ? { color: subject.colorHex } : undefined}
              onPress={() => onFocusSubjectToggle(subject.id)}
            />
          );
        })}
      </View>
      {focusSubjectIds.length > 0 ? (
        <LinearButton
          label="Clear focus (study all)"
          size="sm"
          variant="ghost"
          textTone="accent"
          style={styles.clearBtn}
          textStyle={styles.clearBtnText}
          onPress={onClearFocus}
        />
      ) : null}

      <View style={styles.divider} />

      <LinearText variant="title" style={styles.subTitle}>
        Card Type Preferences
      </LinearText>
      <LinearText variant="caption" tone="muted" style={styles.hint}>
        Block types you don't want in sessions.
      </LinearText>
      <View style={styles.chipGrid}>
        {allContentTypes.map(({ type, label }) => {
          const isBlocked = blockedTypes.includes(type);
          const isLocked = type === 'keypoints';

          return (
            <LinearChipButton
              key={type}
              label={label}
              style={[styles.chip, isLocked && styles.chipLocked]}
              selected={isBlocked}
              tone={isBlocked ? 'error' : 'accent'}
              selectedStyle={isBlocked ? styles.chipBlocked : undefined}
              textStyle={styles.chipText}
              selectedTextStyle={isBlocked ? styles.chipTextBlocked : undefined}
              rightIcon={
                isBlocked ? (
                  <LinearText variant="badge" tone="error" style={styles.chipX}>
                    X
                  </LinearText>
                ) : undefined
              }
              onPress={() => !isLocked && onContentTypeToggle(type)}
              disabled={isLocked}
            />
          );
        })}
      </View>
    </View>
  );
}

export default React.memo(ContentPreferencesSection);

// eslint-disable-next-line guru/prefer-settings-primitives -- component-level styles
const styles = StyleSheet.create({
  container: { gap: 12 },
  subTitle: {
    color: n.colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  hint: { color: n.colors.textSecondary, fontSize: 11, lineHeight: 16, marginBottom: 4 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {},
  chipText: { color: n.colors.textSecondary, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  chipBlocked: { borderColor: n.colors.error },
  chipTextBlocked: { color: n.colors.error },
  chipLocked: { opacity: 0.5 },
  chipX: { color: n.colors.error, fontSize: 10, lineHeight: 14, marginLeft: 4 },
  clearBtn: { alignSelf: 'center' },
  clearBtnText: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
  divider: { height: 1, backgroundColor: n.colors.border, marginVertical: 8 },
});
