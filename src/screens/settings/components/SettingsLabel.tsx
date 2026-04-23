import React from 'react';
import { StyleSheet } from 'react-native';
import LinearText from '../../../components/primitives/LinearText';

export default function SettingsLabel({ text }: { text: string }) {
  return (
    <LinearText variant="label" tone="secondary" style={styles.label}>
      {text}
    </LinearText>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    marginBottom: 6,
    marginTop: 8,
  },
});
