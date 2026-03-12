import React from 'react';
import { View, Text, TextInput, StyleSheet, Switch, TouchableOpacity } from 'react-native';
import { theme } from '../../constants/theme';

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

export default function NotificationSection({
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

const styles = StyleSheet.create({
  container: { gap: 12 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  label: { color: theme.colors.textPrimary, fontSize: 13, fontWeight: '700' },
  hint: { color: theme.colors.textSecondary, fontSize: 11, marginTop: 2 },
  input: {
    backgroundColor: theme.colors.surface,
    color: theme.colors.textPrimary,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    fontSize: 14,
  },
  inputError: { borderColor: theme.colors.error },
  errorText: { color: theme.colors.error, fontSize: 11 },
  frequencyRow: { flexDirection: 'row', gap: 8 },
  freqBtn: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  freqBtnActive: { backgroundColor: `${theme.colors.primary}22`, borderColor: theme.colors.primary },
  freqText: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: '600' },
  freqTextActive: { color: theme.colors.primary, fontWeight: '700' },
  testBtn: {
    marginTop: 8,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  testBtnText: { color: theme.colors.primary, fontWeight: '700', fontSize: 13 },
});
