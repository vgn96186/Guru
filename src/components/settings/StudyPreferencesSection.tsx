import React from 'react';
import { View, StyleSheet, Switch } from 'react-native';
import { linearTheme as n } from '../../theme/linearTheme';
import LinearText from '../primitives/LinearText';

interface StudyPreferencesSectionProps {
  strictMode: boolean;
  onStrictModeChange: (value: boolean) => void;
  visualTimers: boolean;
  onVisualTimersChange: (value: boolean) => void;
  bodyDoubling: boolean;
  onBodyDoublingChange: (value: boolean) => void;
}

function StudyPreferencesSection({
  strictMode,
  onStrictModeChange,
  visualTimers,
  onVisualTimersChange,
  bodyDoubling,
  onBodyDoublingChange,
}: StudyPreferencesSectionProps) {
  return (
    <View style={styles.container}>
      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <LinearText variant="label" style={styles.label}>
            Strict Mode
          </LinearText>
          <LinearText variant="caption" tone="muted" style={styles.hint}>
            Nag you instantly if you leave the app or are idle.
          </LinearText>
        </View>
        <Switch value={strictMode} onValueChange={onStrictModeChange} />
      </View>

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <LinearText variant="label" style={styles.label}>
            Visual Timers
          </LinearText>
          <LinearText variant="caption" tone="muted" style={styles.hint}>
            Circular timers during breaks instead of plain text.
          </LinearText>
        </View>
        <Switch value={visualTimers} onValueChange={onVisualTimersChange} />
      </View>

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <LinearText variant="label" style={styles.label}>
            Guru presence (Body Doubling)
          </LinearText>
          <LinearText variant="caption" tone="muted" style={styles.hint}>
            Ambient messages and pulsing dot while you study.
          </LinearText>
        </View>
        <Switch value={bodyDoubling} onValueChange={onBodyDoublingChange} />
      </View>
    </View>
  );
}

export default React.memo(StudyPreferencesSection);

// eslint-disable-next-line guru/prefer-settings-primitives -- component-level styles
const styles = StyleSheet.create({
  container: { gap: 16 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: n.colors.textPrimary, fontSize: 14, fontWeight: '600' },
  hint: { color: n.colors.textSecondary, fontSize: 11, marginTop: 2, paddingRight: 10 },
});
