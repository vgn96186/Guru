import React from 'react';
import { View, StyleSheet } from 'react-native';
import SettingsSection from './SettingsSection';
import TextField from './TextField';

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
    <SettingsSection title="STUDY GOALS">
      <TextField
        label="INICET Exam Date"
        value={inicetDate}
        onChangeText={onInicetDateChange}
        placeholder="YYYY-MM-DD"
        error={errorInicet}
        errorTone="warning"
      />

      <TextField
        label="NEET-PG Exam Date"
        value={neetDate}
        onChangeText={onNeetDateChange}
        placeholder="YYYY-MM-DD"
        error={errorNeet}
        errorTone="warning"
      />

      <View style={styles.row}>
        <TextField
          label="Session (min)"
          value={sessionLength}
          onChangeText={onSessionLengthChange}
          keyboardType="number-pad"
          containerStyle={[styles.rowField, styles.rowFieldStart]}
        />
        <TextField
          label="Goal (min/day)"
          value={dailyGoal}
          onChangeText={onDailyGoalChange}
          keyboardType="number-pad"
          containerStyle={[styles.rowField, styles.rowFieldEnd]}
        />
      </View>
    </SettingsSection>
  );
}

export default React.memo(StudyGoalsSection);

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  rowField: { flex: 1 },
  rowFieldStart: { marginRight: 8 },
  rowFieldEnd: { marginLeft: 8, marginBottom: 0 },
});
