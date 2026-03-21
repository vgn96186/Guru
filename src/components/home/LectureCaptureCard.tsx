import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../constants/theme';

interface Props {
  onPress: () => void;
  isTablet?: boolean;
}

export default function LectureCaptureCard({ onPress, isTablet = false }: Props) {
  return (
    <TouchableOpacity
      style={[styles.card, isTablet && styles.cardTablet]}
      onPress={onPress}
      activeOpacity={theme.alpha.pressed}
      accessibilityRole="button"
      accessibilityLabel="Lecture Capture"
    >
      <View style={styles.iconWrap}>
        <Ionicons name="mic-outline" size={20} color={theme.colors.textPrimary} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>Lecture Capture</Text>
        <Text style={styles.subtitle}>
          Jump into Hostage Mode and turn lecture time into structured notes.
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 78,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  cardTablet: {
    minHeight: 92,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.lg,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
});
