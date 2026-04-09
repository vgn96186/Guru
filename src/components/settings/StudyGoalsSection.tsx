import React from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { linearTheme as n } from '../../theme/linearTheme';
import LinearText from '../primitives/LinearText';

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
      <LinearText variant="sectionTitle" tone="muted" style={styles.sectionTitle}>
        STUDY GOALS
      </LinearText>

      <View style={styles.inputGroup}>
        <LinearText variant="label" style={styles.label}>
          INICET Exam Date
        </LinearText>
        <TextInput
          style={[styles.input, errorInicet && styles.inputError]}
          value={inicetDate}
          onChangeText={onInicetDateChange}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={n.colors.textMuted}
        />
        {errorInicet && (
          <LinearText variant="caption" tone="warning" style={styles.errorText}>
            {errorInicet}
          </LinearText>
        )}
      </View>

      <View style={styles.inputGroup}>
        <LinearText variant="label" style={styles.label}>
          NEET-PG Exam Date
        </LinearText>
        <TextInput
          style={[styles.input, errorNeet && styles.inputError]}
          value={neetDate}
          onChangeText={onNeetDateChange}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={n.colors.textMuted}
        />
        {errorNeet && (
          <LinearText variant="caption" tone="warning" style={styles.errorText}>
            {errorNeet}
          </LinearText>
        )}
      </View>

      <View style={styles.row}>
        <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
          <LinearText variant="label" style={styles.label}>
            Session (min)
          </LinearText>
          <TextInput
            style={styles.input}
            value={sessionLength}
            onChangeText={onSessionLengthChange}
            keyboardType="number-pad"
          />
        </View>
        <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
          <LinearText variant="label" style={styles.label}>
            Goal (min/day)
          </LinearText>
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
    backgroundColor: n.colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: n.colors.border,
    marginBottom: 20,
  },
  sectionTitle: {
    color: n.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  inputGroup: { marginBottom: 16 },
  row: { flexDirection: 'row' },
  label: { color: n.colors.textPrimary, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  input: {
    backgroundColor: n.colors.surface,
    color: n.colors.textPrimary,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: n.colors.border,
    fontSize: 14,
  },
  inputError: {
    borderColor: n.colors.warning,
  },
  errorText: {
    color: n.colors.warning,
    fontSize: 12,
    marginTop: 4,
  },
});
