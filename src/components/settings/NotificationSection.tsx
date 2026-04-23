import React from 'react';
import { View, StyleSheet, Switch } from 'react-native';
import LinearButton from '../primitives/LinearButton';
import LinearChipButton from '../primitives/LinearChipButton';
import LinearText from '../primitives/LinearText';
import TextField from './TextField';

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

      <TextField
        label="Reminder hour (0-23, e.g. 7 = 7:30 AM)"
        value={hour}
        onChangeText={onHourChange}
        keyboardType="number-pad"
        error={error}
      />

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
        variant="secondary"
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
  label: { color: '#F2F2F2', fontSize: 13, fontWeight: '700' },
  hint: { color: '#A0A0A5', fontSize: 11, marginTop: 2 },
  frequencyRow: { flexDirection: 'row', gap: 8 },
  freqBtn: {
    flex: 1,
    alignSelf: 'stretch',
    borderRadius: 10,
  },
  freqBtnActive: {},
  freqText: { color: '#A0A0A5', fontSize: 12, fontWeight: '600' },
  freqTextActive: { color: '#5E6AD2', fontWeight: '700' },
  testBtn: { marginTop: 8 },
  testBtnText: { fontSize: 13 },
});
