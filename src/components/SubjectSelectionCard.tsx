import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getAllSubjects } from '../db/queries/topics';
import type { Subject } from '../types';
import { linearTheme as n } from '../theme/linearTheme';
import LinearSurface from './primitives/LinearSurface';

interface Props {
  detectedSubjectName?: string | null;
  selectedSubjectName: string | null;
  onSelectSubject: (subjectName: string) => void;
}

export default function SubjectSelectionCard({
  detectedSubjectName,
  selectedSubjectName,
  onSelectSubject,
}: Props) {
  const [subjects, setSubjects] = React.useState<Subject[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let isMounted = true;
    void getAllSubjects()
      .then((rows) => {
        if (!isMounted) return;
        setSubjects(rows);
      })
      .finally(() => {
        if (!isMounted) return;
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <LinearSurface padded={false} borderColor={`${n.colors.warning}55`} style={styles.card}>
      <Text style={styles.title}>Subject required</Text>
      <Text style={styles.body}>
        Choose the lecture subject before saving so topics get filed correctly.
      </Text>
      {!!detectedSubjectName?.trim() && (
        <Text style={styles.detectedText}>Detected: {detectedSubjectName}</Text>
      )}
      {isLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={n.colors.accent} size="small" />
          <Text style={styles.loadingText}>Loading subjects…</Text>
        </View>
      ) : (
        <View style={styles.chipGrid}>
          {subjects.map((subject) => {
            const isSelected = selectedSubjectName === subject.name;
            return (
              <TouchableOpacity
                key={subject.id}
                style={[styles.chip, isSelected && styles.chipSelected]}
                onPress={() => onSelectSubject(subject.name)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={subject.name}
              >
                <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                  {subject.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </LinearSurface>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    padding: 16,
    gap: 10,
  },
  title: {
    color: n.colors.textPrimary,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
  },
  body: {
    color: n.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  detectedText: {
    color: n.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: n.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: n.colors.borderHighlight,
    backgroundColor: n.colors.card,
  },
  chipSelected: {
    borderColor: n.colors.accent,
    backgroundColor: n.colors.primaryTintSoft,
  },
  chipText: {
    color: n.colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  chipTextSelected: {
    color: n.colors.accent,
  },
});
