import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SettingsToggleRow from '../components/SettingsToggleRow';
import LinearText from '../../../components/primitives/LinearText';
import { linearTheme } from '../../../theme/linearTheme';
import { ALL_CONTENT_TYPES } from '../types';
import { BentoCard } from '../../../components/settings/BentoCard';
import { useSettingsState } from '../../../hooks/useSettingsState';

export function InterventionsSection(props: any) {
  const { styles, subjects } = props;

  const [strictMode, setStrictMode] = useSettingsState('strictModeEnabled', false);
  const [blockedTypes, setBlockedTypes] = useSettingsState('blockedContentTypes', []);
  const [focusSubjectIds, setFocusSubjectIds] = useSettingsState('focusSubjectIds', []);

  return (
    <>
      <BentoCard title="Interventions & Study Flow" className="mb-4">
        <SettingsToggleRow
          label="Strict Mode (Punishment Mode)"
          hint="Nag you instantly if you leave the app or are idle. Idle time won't count towards session duration."
          value={strictMode}
          onValueChange={setStrictMode}
          activeTrackColor={linearTheme.colors.error}
          labelIcon={
            <Ionicons name="shield-checkmark" size={16} color={linearTheme.colors.error} />
          }
        />
        {/* Doomscroll Shield & Face Tracking placeholders per mockup */}
        <SettingsToggleRow
          label="Doomscroll Shield"
          hint="Detect app switching via AppState"
          value={true}
          onValueChange={() => {}}
          style={{ marginTop: 16 }}
        />
        <SettingsToggleRow
          label="Face Tracking (ML Kit)"
          hint="Alert if absent/drowsy during lectures"
          value={true}
          onValueChange={() => {}}
          style={{ marginTop: 16 }}
        />
      </BentoCard>

      <BentoCard title="Focus Subjects" className="mb-4">
        <LinearText style={styles.hint} variant="body" tone="muted">
          Pin subjects to limit sessions to those areas only. Clear all to study everything.
        </LinearText>
        <View style={styles.chipGrid}>
          {subjects.map((s: any) => {
            const isFocused = focusSubjectIds.includes(s.id);
            return (
              <TouchableOpacity
                key={s.id}
                style={[
                  styles.typeChip,
                  isFocused && { backgroundColor: s.colorHex + '33', borderColor: s.colorHex },
                ]}
                onPress={() =>
                  setFocusSubjectIds(
                    isFocused
                      ? focusSubjectIds.filter((subjectId: any) => subjectId !== s.id)
                      : [...focusSubjectIds, s.id],
                  )
                }
                activeOpacity={0.8}
              >
                <LinearText
                  style={[styles.typeChipText, isFocused && { color: s.colorHex }]}
                  variant="body"
                >
                  {s.shortCode}
                </LinearText>
              </TouchableOpacity>
            );
          })}
        </View>
        {focusSubjectIds.length > 0 && (
          <TouchableOpacity onPress={() => setFocusSubjectIds([])} style={styles.clearBtn}>
            <LinearText style={styles.clearBtnText} variant="body">
              Clear focus (study all subjects)
            </LinearText>
          </TouchableOpacity>
        )}
      </BentoCard>

      <BentoCard title="Content Type Preferences" className="mb-4">
        <LinearText style={styles.hint} variant="body" tone="muted">
          Block card types you don't want in sessions. Keypoints can't be blocked.
        </LinearText>
        <View style={styles.chipGrid}>
          {ALL_CONTENT_TYPES.map(({ type, label }) => {
            const isBlocked = blockedTypes.includes(type);
            const isLocked = type === 'keypoints';
            return (
              <TouchableOpacity
                key={type}
                style={[
                  styles.typeChip,
                  isBlocked && styles.typeChipBlocked,
                  isLocked && styles.typeChipLocked,
                ]}
                onPress={() => {
                  if (isLocked) return;
                  setBlockedTypes(
                    isBlocked
                      ? blockedTypes.filter((blockedType: any) => blockedType !== type)
                      : [...blockedTypes, type],
                  );
                }}
                activeOpacity={isLocked ? 1 : 0.8}
              >
                <LinearText
                  style={[styles.typeChipText, isBlocked && styles.typeChipTextBlocked]}
                  variant="body"
                >
                  {label}
                </LinearText>
                {isBlocked && (
                  <LinearText style={styles.typeChipX} variant="body">
                    {' '}
                    X
                  </LinearText>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </BentoCard>
    </>
  );
}
