import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { theme } from '../../constants/theme';

interface ShortcutTileProps {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  onPress: () => void;
}

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export default function ShortcutTile({ title, icon, accent, onPress }: ShortcutTileProps) {
  const scale = useSharedValue(1);

  function handlePressIn() {
    scale.value = withSpring(0.95, { damping: 15, stiffness: 200 });
  }

  function handlePressOut() {
    scale.value = withSpring(1, { damping: 15, stiffness: 200 });
  }

  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedTouchableOpacity
      style={[styles.tile, animatedStyle]}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
      accessibilityRole="button"
    >
      <View style={[styles.iconBox, { backgroundColor: accent + '1A', borderColor: accent + '33' }]}>
        <Ionicons name={icon} size={22} color={accent} />
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
    </AnimatedTouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.soft,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
    borderWidth: 1,
  },
  title: {
    ...theme.typography.caption,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
});
