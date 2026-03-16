import React from 'react';
import { View, StyleSheet, ViewProps, TouchableOpacity } from 'react-native';
import { theme } from '../../constants/theme';

interface AppCardProps extends ViewProps {
  onPress?: () => void;
  variant?: 'elevated' | 'flat' | 'outlined';
}

export function AppCard({
  style,
  children,
  onPress,
  variant = 'elevated',
  ...props
}: AppCardProps) {
  const cardStyle = [
    s.card,
    variant === 'flat' && s.flat,
    variant === 'outlined' && s.outlined,
    style,
  ];

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={theme.alpha.pressed} onPress={onPress} style={cardStyle}>
        {children}
      </TouchableOpacity>
    );
  }

  return (
    <View style={cardStyle} {...props}>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    ...theme.shadows.md,
  },
  flat: {
    shadowOpacity: 0,
    elevation: 0,
    backgroundColor: theme.colors.surface,
  },
  outlined: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowOpacity: 0,
    elevation: 0,
  },
});
