import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../constants/theme';

interface Props {
  subject: string;
}

export default function SubjectChip({ subject }: Props) {
  return (
    <View style={styles.chip}>
      <Text style={styles.text}>{subject}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.primary + '22',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.colors.primary + '66',
  },
  text: { color: theme.colors.primary, fontWeight: '700', fontSize: 14 },
});
