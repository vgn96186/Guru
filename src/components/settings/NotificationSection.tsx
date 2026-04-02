import React from 'react';
import { View, Text, TextInput, StyleSheet, Switch, TouchableOpacity } from 'react-native';
import { linearTheme as n } from '../../theme/linearTheme';

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
  enabled, onEnabledChange, hour, onHourChange,
  frequency, onFrequencyChange, onTest, error
}: NotificationSectionProps) {
  return (
    <View style={styles.container}>
      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Enable Guru's reminders</Text>
          <Text style={styles.hint}>Personalized daily accountability messages</Text>
        </View>
        <Switch value={enabled} onValueChange={onEnabledChange} />
      </View>

      <Text style={styles.label}>Reminder hour (0–23, e.g. 7 = 7:30 AM)</Text>
      <TextInput
        style={[styles.input, !!error && styles.inputError]}
        value={hour}
        onChangeText={onHourChange}
        keyboardType="number-pad"
      />
      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <Text style={styles.label}>Guru presence frequency</Text>
      <View style={styles.frequencyRow}>
        {(['rare', 'normal', 'frequent', 'off'] as const).map(freq => (
          <TouchableOpacity
            key={freq}
            style={[styles.freqBtn, frequency === freq && styles.freqBtnActive]}
            onPress={() => onFrequencyChange(freq)}
          >
            <Text style={[styles.freqText, frequency === freq && styles.freqTextActive]}>
              {freq.charAt(0).toUpperCase() + freq.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      
      <TouchableOpacity style={styles.testBtn} onPress={onTest}>
        <Text style={styles.testBtnText}>Schedule Notifications Now</Text>
      </TouchableOpacity>
    </View>
  );
}

export default React.memo(NotificationSection);

const styles = StyleSheet.create({
  container: { gap: 12 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
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
    backgroundColor: n.colors.surface,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  freqBtnActive: { backgroundColor: `${n.colors.accent}22`, borderColor: n.colors.accent },
  freqText: { color: n.colors.textSecondary, fontSize: 12, fontWeight: '600' },
  freqTextActive: { color: n.colors.accent, fontWeight: '700' },
  testBtn: {
    marginTop: 8,
    backgroundColor: n.colors.surface,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  testBtnText: { color: n.colors.accent, fontWeight: '700', fontSize: 13 },
});
