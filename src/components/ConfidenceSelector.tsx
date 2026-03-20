import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
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

export default React.memo(function ConfidenceSelector({ value, onChange }: Props) {
  return (
    <View style={styles.row}>
      {([1, 2, 3] as const).map((lvl) => {
        const selected = value === lvl;
        return (
          <TouchableOpacity
            key={lvl}
            style={[
              styles.option,
              selected && { borderColor: COLORS[lvl], backgroundColor: COLORS[lvl] + '22' },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onChange(lvl);
            }}
            activeOpacity={0.7}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={LABELS[lvl]}
            accessibilityHint={selected ? 'Currently selected' : 'Double tap to select'}
            hitSlop={theme.hitSlop}
          >
            <Text style={[styles.optionText, selected && { color: COLORS[lvl] }]}>
              {LABELS[lvl]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.spacing.md },
  option: {
    flex: 1,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
    minHeight: theme.minTouchSize,
    justifyContent: 'center',
  },
  optionText: {
    color: theme.colors.textMuted,
    ...theme.typography.bodySmall,
    fontWeight: '600',
  },
});
