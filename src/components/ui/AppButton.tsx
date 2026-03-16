import React, { useRef } from 'react';
import {
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  TouchableOpacityProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { theme } from '../../constants/theme';

interface AppButtonProps extends TouchableOpacityProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  haptic?: boolean;
}

export function AppButton({
  label,
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  style,
  disabled,
  onPress,
  haptic = true,
  ...props
}: AppButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.96, useNativeDriver: true, speed: 20 }).start();
    if (haptic && !disabled && !loading) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
  };

  const handlePress = (e: any) => {
    if (haptic && !disabled && !loading) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (onPress) onPress(e);
  };

  const containerStyle = [
    s.btn,
    s[`variant_${variant}`],
    s[`size_${size}`],
    (disabled || loading) && s.disabled,
    style,
  ];

  const textStyle = [s.text, s[`text_${variant}`], s[`textSize_${size}`]];

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, disabled && { opacity: 0.6 }]}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        style={containerStyle}
        {...props}
      >
        {loading ? (
          <ActivityIndicator
            color={variant === 'outline' || variant === 'ghost' ? theme.colors.primary : '#fff'}
          />
        ) : (
          <>
            {icon && (
              <Ionicons
                name={icon}
                size={size === 'sm' ? 16 : 20}
                color={(StyleSheet.flatten(textStyle) as any).color}
                style={s.icon}
              />
            )}
            <Text style={textStyle}>{label}</Text>
          </>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.full,
  },
  icon: {
    marginRight: theme.spacing.sm,
  },
  text: {
    fontWeight: theme.typography.button.fontWeight,
    letterSpacing: 0.3,
  },
  disabled: {
    backgroundColor: theme.colors.surfaceAlt,
    borderColor: theme.colors.border,
    elevation: 0,
    shadowOpacity: 0,
  },

  size_sm: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  textSize_sm: {
    fontSize: 13,
  },
  size_md: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  textSize_md: {
    fontSize: theme.typography.button.fontSize,
  },
  size_lg: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: theme.borderRadius.xl,
  },
  textSize_lg: {
    fontSize: 18,
  },

  variant_primary: {
    backgroundColor: theme.colors.primary,
    ...theme.shadows.sm,
  },
  text_primary: {
    color: '#fff',
  },
  variant_secondary: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  text_secondary: {
    color: theme.colors.textPrimary,
  },
  variant_danger: {
    backgroundColor: theme.colors.errorSurface,
    borderWidth: 1,
    borderColor: theme.colors.error,
  },
  text_danger: {
    color: theme.colors.error,
  },
  variant_outline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  text_outline: {
    color: theme.colors.primary,
  },
  variant_ghost: {
    backgroundColor: 'transparent',
  },
  text_ghost: {
    color: theme.colors.primaryLight,
  },
});
