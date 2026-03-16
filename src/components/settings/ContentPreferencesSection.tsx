import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../../constants/theme';
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
  subjects, focusSubjectIds, onFocusSubjectToggle, onClearFocus,
  allContentTypes, blockedTypes, onContentTypeToggle
}: ContentPreferencesSectionProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.subTitle}>Focus Subjects</Text>
      <Text style={styles.hint}>Pin subjects to limit sessions to those areas only.</Text>
      <View style={styles.chipGrid}>
        {subjects.map(s => {
          const isFocused = focusSubjectIds.includes(s.id);
          return (
            <TouchableOpacity
              key={s.id}
              style={[styles.chip, isFocused && { backgroundColor: s.colorHex + '33', borderColor: s.colorHex }]}
              onPress={() => onFocusSubjectToggle(s.id)}
            >
              <Text style={[styles.chipText, isFocused && { color: s.colorHex }]}>{s.shortCode}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {focusSubjectIds.length > 0 && (
        <TouchableOpacity onPress={onClearFocus} style={styles.clearBtn}>
          <Text style={styles.clearBtnText}>Clear focus (study all)</Text>
        </TouchableOpacity>
      )}

      <View style={styles.divider} />

      <Text style={styles.subTitle}>Card Type Preferences</Text>
      <Text style={styles.hint}>Block types you don't want in sessions.</Text>
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
              <Text style={[styles.chipText, isBlocked && styles.chipTextBlocked]}>{label}</Text>
              {isBlocked && <Text style={styles.chipX}> ✕</Text>}
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
  subTitle: { color: theme.colors.textPrimary, fontSize: 14, fontWeight: '700', marginTop: 4 },
  hint: { color: theme.colors.textSecondary, fontSize: 11, marginBottom: 4 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipText: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: '600' },
  chipBlocked: { backgroundColor: `${theme.colors.error}22`, borderColor: theme.colors.error },
  chipTextBlocked: { color: theme.colors.error },
  chipLocked: { opacity: 0.5 },
  chipX: { color: theme.colors.error, fontSize: 10, marginLeft: 4 },
  clearBtn: { padding: 8, alignItems: 'center' },
  clearBtnText: { color: theme.colors.primary, fontSize: 12, fontWeight: '600' },
  divider: { height: 1, backgroundColor: theme.colors.divider, marginVertical: 8 },
});
