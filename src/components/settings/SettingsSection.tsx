import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import LinearText from '../primitives/LinearText';
import useLinearTheme from '../../hooks/useLinearTheme';

interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

export default function SettingsSection({
  title,
  children,
  style,
  contentStyle,
}: SettingsSectionProps) {
  const theme = useLinearTheme();

  return (
    <View
      style={[
        styles.section,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
        style,
      ]}
    >
      <LinearText variant="sectionTitle" tone="muted" style={styles.sectionTitle}>
        {title}
      </LinearText>
      <View style={contentStyle}>{children}</View>
    </View>
  );
}

// eslint-disable-next-line guru/prefer-settings-primitives -- component-level styles
const styles = StyleSheet.create({
  section: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 16,
  },
});
