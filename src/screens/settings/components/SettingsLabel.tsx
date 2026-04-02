import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { linearTheme } from '../../../theme/linearTheme';

export default function SettingsLabel({ text }: { text: string }) {
  return <Text style={styles.label}>{text}</Text>;
}

const styles = StyleSheet.create({
  label: {
    color: linearTheme.colors.textSecondary,
    fontSize: 13,
    marginBottom: 6,
    marginTop: 8,
  },
});
