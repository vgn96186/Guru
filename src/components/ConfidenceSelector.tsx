import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../constants/theme';

const LABELS: Record<1 | 2 | 3, string> = { 1: 'Introduced', 2: 'Understood', 3: 'Confident' };
const COLORS: Record<1 | 2 | 3, string> = {
  1: theme.colors.error,
  2: theme.colors.warning,
  3: theme.colors.success,
};

interface Props {
  value: 1 | 2 | 3;
  onChange: (v: 1 | 2 | 3) => void;
}

export default function ConfidenceSelector({ value, onChange }: Props) {
  return (
    <View style={styles.row}>
      {([1, 2, 3] as const).map((lvl) => {
        const selected = value === lvl;
        return (
          <TouchableOpacity
            key={lvl}
            style={[styles.option, selected && { borderColor: COLORS[lvl], backgroundColor: COLORS[lvl] + '22' }]}
            onPress={() => onChange(lvl)}
          >
            <Text style={[styles.optionText, selected && { color: COLORS[lvl] }]}>{LABELS[lvl]}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  option: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 10,
    alignItems: 'center',
  },
  optionText: { color: theme.colors.textMuted, fontSize: 13, fontWeight: '700' },
});
