import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';

interface StudyGoalsSectionProps {
  inicetDate: string;
  neetDate: string;
  sessionLength: string;
  dailyGoal: string;
  onInicetDateChange: (text: string) => void;
  onNeetDateChange: (text: string) => void;
  onSessionLengthChange: (text: string) => void;
  onDailyGoalChange: (text: string) => void;
  errorInicet?: string;
  errorNeet?: string;
}

const PLACEHOLDER_COLOR = '#7B8193';

function StudyGoalsSection({
  inicetDate,
  neetDate,
  sessionLength,
  dailyGoal,
  onInicetDateChange,
  onNeetDateChange,
  onSessionLengthChange,
  onDailyGoalChange,
  errorInicet,
  errorNeet,
}: StudyGoalsSectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>STUDY GOALS</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>INICET Exam Date</Text>
        <TextInput
          style={[styles.input, errorInicet && styles.inputError]}
          value={inicetDate}
          onChangeText={onInicetDateChange}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={PLACEHOLDER_COLOR}
        />
        {errorInicet && <Text style={styles.errorText}>{errorInicet}</Text>}
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>NEET-PG Exam Date</Text>
        <TextInput
          style={[styles.input, errorNeet && styles.inputError]}
          value={neetDate}
          onChangeText={onNeetDateChange}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={PLACEHOLDER_COLOR}
        />
        {errorNeet && <Text style={styles.errorText}>{errorNeet}</Text>}
      </View>

      <View style={styles.row}>
        <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
          <Text style={styles.label}>Session (min)</Text>
          <TextInput
            style={styles.input}
            value={sessionLength}
            onChangeText={onSessionLengthChange}
            keyboardType="number-pad"
          />
        </View>
        <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
          <Text style={styles.label}>Goal (min/day)</Text>
          <TextInput
            style={styles.input}
            value={dailyGoal}
            onChangeText={onDailyGoalChange}
            keyboardType="number-pad"
          />
        </View>
      </View>
    </View>
  );
}

export default React.memo(StudyGoalsSection);

const styles = StyleSheet.create({
  section: {
    backgroundColor: theme.colors.panel,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 20,
  },
  sectionTitle: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  inputGroup: { marginBottom: 16 },
  row: { flexDirection: 'row' },
  label: { color: theme.colors.textPrimary, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  input: {
    backgroundColor: theme.colors.surface,
    color: theme.colors.textPrimary,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    fontSize: 14,
  },
  inputError: {
    borderColor: theme.colors.warning,
  },
  errorText: {
    color: theme.colors.warning,
    fontSize: 12,
    marginTop: 4,
  },
});
