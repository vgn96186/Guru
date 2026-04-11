import React from 'react';
import { View, StyleSheet } from 'react-native';
import LinearText from '../primitives/LinearText';
import { linearTheme as n } from '../../theme/linearTheme';
import { HOME_SECTION_GAP } from './homeLayout';

interface HomeSectionHeaderProps {
  label: string;
  action?: React.ReactNode;
}

export default function HomeSectionHeader({ label, action }: HomeSectionHeaderProps) {
  return (
    <View style={styles.row}>
      <LinearText variant="label" tone="muted" style={styles.label}>
        {label}
      </LinearText>
      {action ? <View style={styles.actionWrap}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: n.spacing.sm,
    minHeight: 24,
    marginBottom: HOME_SECTION_GAP,
  },
  label: {
    color: n.colors.textMuted,
    fontWeight: '800' as const,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  actionWrap: {
    minHeight: 24,
    justifyContent: 'center',
  },
});
