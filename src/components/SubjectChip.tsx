import React from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import AppText from './AppText';
import { theme } from '../constants/theme';

interface Props {
  subject: string;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

export default React.memo(function SubjectChip({
  subject,
  color = theme.colors.primary,
  backgroundColor = theme.colors.primary + '22',
  borderColor = theme.colors.primary + '66',
  style,
  textStyle,
  numberOfLines,
}: Props) {
  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor,
          borderColor,
          borderWidth: borderColor ? 1 : 0,
        },
        style,
      ]}
    >
      <AppText
        variant="chip"
        numberOfLines={numberOfLines}
        style={[styles.text, { color }, textStyle]}
      >
        {subject}
      </AppText>
    </View>
  );
});

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    minWidth: 0,
    maxWidth: '100%',
  },
  text: {
    fontSize: 13,
    flexShrink: 1,
  },
});
