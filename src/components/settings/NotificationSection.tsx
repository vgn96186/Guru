import React from 'react';
import { View, TextInput, StyleSheet, Switch } from 'react-native';
import { linearTheme as n } from '../../theme/linearTheme';
import LinearButton from '../primitives/LinearButton';
import LinearChipButton from '../primitives/LinearChipButton';
import LinearText from '../primitives/LinearText';

interface NotificationSectionProps {
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  hour: string;
  onHourChange: (text: string) => void;
  frequency: 'rare' | 'normal' | 'frequent' | 'off';
  onFrequencyChange: (freq: 'rare' | 'normal' | 'frequent' | 'off') => void;
  onTest: () => void;
  error?: string;
}

function NotificationSection({
  enabled,
  onEnabledChange,
  hour,
  onHourChange,
  frequency,
  onFrequencyChange,
  onTest,
  error,
}: NotificationSectionProps) {
  return (
    <View style={styles.container}>
      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <LinearText variant="label" style={styles.label}>
            Enable Guru's reminders
          </LinearText>
          <LinearText variant="caption" tone="muted" style={styles.hint}>
            Personalized daily accountability messages
          </LinearText>
        </View>
        <Switch value={enabled} onValueChange={onEnabledChange} />
      </View>

      <LinearText variant="label" style={styles.label}>
        Reminder hour (0-23, e.g. 7 = 7:30 AM)
      </LinearText>
      <TextInput
        style={[styles.input, !!error && styles.inputError]}
        value={hour}
        onChangeText={onHourChange}
        keyboardType="number-pad"
      />
      {!!error && (
        <LinearText variant="caption" tone="error" style={styles.errorText}>
          {error}
        </LinearText>
      )}

      <LinearText variant="label" style={styles.label}>
        Guru presence frequency
      </LinearText>
      <View style={styles.frequencyRow}>
        {(['rare', 'normal', 'frequent', 'off'] as const).map((freq) => (
          <LinearChipButton
            key={freq}
            label={freq.charAt(0).toUpperCase() + freq.slice(1)}
            style={styles.freqBtn}
            selected={frequency === freq}
            selectedStyle={styles.freqBtnActive}
            textStyle={styles.freqText}
            selectedTextStyle={styles.freqTextActive}
            onPress={() => onFrequencyChange(freq)}
          />
        ))}
      </View>

      <LinearButton
        label="Schedule Notifications Now"
        variant="outline"
        textTone="accent"
        style={styles.testBtn}
        textStyle={styles.testBtnText}
        onPress={onTest}
      />
    </View>
  );
}

export default React.memo(NotificationSection);

const styles = StyleSheet.create({
  container: { gap: 12 },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: { color: n.colors.textPrimary, fontSize: 13, fontWeight: '700' },
  hint: { color: n.colors.textSecondary, fontSize: 11, marginTop: 2 },
  input: {
    backgroundColor: n.colors.surface,
    color: n.colors.textPrimary,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: n.colors.border,
    fontSize: 14,
  },
  inputError: { borderColor: n.colors.error },
  errorText: { color: n.colors.error, fontSize: 11 },
  frequencyRow: { flexDirection: 'row', gap: 8 },
  freqBtn: {
    flex: 1,
    alignSelf: 'stretch',
    borderRadius: 10,
  },
  freqBtnActive: {},
  freqText: { color: n.colors.textSecondary, fontSize: 12, fontWeight: '600' },
  freqTextActive: { color: n.colors.accent, fontWeight: '700' },
  testBtn: { marginTop: 8 },
  testBtnText: { fontSize: 13 },
});
