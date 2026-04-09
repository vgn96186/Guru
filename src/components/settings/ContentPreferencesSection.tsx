import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { linearTheme as n } from '../../theme/linearTheme';
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
        {subjects.map((s) => {
          const isFocused = focusSubjectIds.includes(s.id);
          return (
            <TouchableOpacity
              key={s.id}
              style={[
                styles.chip,
                isFocused && { backgroundColor: s.colorHex + '33', borderColor: s.colorHex },
              ]}
              onPress={() => onFocusSubjectToggle(s.id)}
            >
              <LinearText
                variant="chip"
                style={[styles.chipText, isFocused && { color: s.colorHex }]}
              >
                {s.shortCode}
              </LinearText>
            </TouchableOpacity>
          );
        })}
      </View>
      {focusSubjectIds.length > 0 && (
        <TouchableOpacity onPress={onClearFocus} style={styles.clearBtn}>
          <LinearText variant="bodySmall" tone="accent" style={styles.clearBtnText}>
            Clear focus (study all)
          </LinearText>
        </TouchableOpacity>
      )}

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
            <TouchableOpacity
              key={type}
              style={[styles.chip, isBlocked && styles.chipBlocked, isLocked && styles.chipLocked]}
              onPress={() => !isLocked && onContentTypeToggle(type)}
              disabled={isLocked}
            >
              <LinearText
                variant="chip"
                style={[styles.chipText, isBlocked && styles.chipTextBlocked]}
              >
                {label}
              </LinearText>
              {isBlocked && (
                <LinearText variant="badge" tone="error" style={styles.chipX}>
                  {' '}
                  ✕
                </LinearText>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default React.memo(ContentPreferencesSection);

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
  chip: {
    backgroundColor: n.colors.surface,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: n.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipText: { color: n.colors.textSecondary, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  chipBlocked: { backgroundColor: `${n.colors.error}22`, borderColor: n.colors.error },
  chipTextBlocked: { color: n.colors.error },
  chipLocked: { opacity: 0.5 },
  chipX: { color: n.colors.error, fontSize: 10, lineHeight: 14, marginLeft: 4 },
  clearBtn: { padding: 8, alignItems: 'center' },
  clearBtnText: { color: n.colors.accent, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  divider: { height: 1, backgroundColor: n.colors.border, marginVertical: 8 },
});
