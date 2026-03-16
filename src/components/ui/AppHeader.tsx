import React from 'react';
import { View, Text, StyleSheet, ViewProps, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../constants/theme';
import { useNavigation } from '@react-navigation/native';

interface AppHeaderProps extends ViewProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightPress?: () => void;
}

export function AppHeader({
  title,
  subtitle,
  showBack,
  rightIcon,
  onRightPress,
  style,
  ...props
}: AppHeaderProps) {
  const navigation = useNavigation();

  return (
    <View style={[s.header, style]} {...props}>
      {showBack && (
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => navigation.canGoBack() && navigation.goBack()}
          activeOpacity={theme.alpha.pressed}
        >
          <Ionicons name="chevron-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
      )}

      <View style={s.titleContainer}>
        <Text style={s.title}>{title}</Text>
        {subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
      </View>

      {rightIcon ? (
        <TouchableOpacity
          style={s.rightBtn}
          onPress={onRightPress}
          activeOpacity={theme.alpha.pressed}
        >
          <Ionicons name={rightIcon} size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
      ) : (
        <View style={s.placeholder} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: 'transparent',
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    ...theme.typography.h3,
    color: theme.colors.textPrimary,
  },
  subtitle: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  backBtn: {
    padding: theme.spacing.xs,
    marginLeft: -theme.spacing.xs,
  },
  rightBtn: {
    padding: theme.spacing.xs,
    marginRight: -theme.spacing.xs,
  },
  placeholder: {
    width: 32, // Matches icon size + padding to keep title centered
  },
});
