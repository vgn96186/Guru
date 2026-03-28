import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../constants/theme';

interface Props {
  title: string;
  message: string;
  detail?: string | null;
  statusLabel?: string;
  tips?: string[];
  primaryLabel: string;
  primaryAccessibilityLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  secondaryAccessibilityLabel?: string;
  onSecondary?: () => void;
}

export default function AppRecoveryScreen({
  title,
  message,
  detail,
  statusLabel = 'Recovery mode',
  tips = [],
  primaryLabel,
  primaryAccessibilityLabel,
  onPrimary,
  secondaryLabel,
  secondaryAccessibilityLabel,
  onSecondary,
}: Props) {
  const safeDetail = detail?.trim();

  return (
    <View style={styles.container}>
      <View style={styles.glowPrimary} pointerEvents="none" />
      <View style={styles.glowAccent} pointerEvents="none" />

      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="alert-circle-outline" size={34} color={theme.colors.warning} />
        </View>

        <View style={styles.badge}>
          <Ionicons name="shield-checkmark-outline" size={14} color={theme.colors.primaryLight} />
          <Text style={styles.badgeText}>{statusLabel}</Text>
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{message}</Text>

        {tips.length > 0 ? (
          <View style={styles.tipCard}>
            {tips.map((tip, index) => (
              <View key={`${index}-${tip}`} style={styles.tipRow}>
                <Ionicons
                  name={index === 0 ? 'refresh-outline' : 'checkmark-circle-outline'}
                  size={16}
                  color={index === 0 ? theme.colors.textSecondary : theme.colors.success}
                />
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {safeDetail ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorLabel}>Technical note</Text>
            <Text style={styles.errorValue} numberOfLines={3}>
              {safeDetail}
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={onPrimary}
          accessibilityRole="button"
          accessibilityLabel={primaryAccessibilityLabel}
        >
          <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
        </TouchableOpacity>

        {secondaryLabel && onSecondary ? (
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={onSecondary}
            accessibilityRole="button"
            accessibilityLabel={secondaryAccessibilityLabel ?? secondaryLabel}
          >
            <Text style={styles.secondaryBtnText}>{secondaryLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    padding: theme.spacing.xl,
    overflow: 'hidden',
  },
  glowPrimary: {
    position: 'absolute',
    top: -110,
    right: -50,
    width: 240,
    height: 240,
    borderRadius: 999,
    backgroundColor: theme.colors.primaryTint,
    opacity: 0.9,
  },
  glowAccent: {
    position: 'absolute',
    bottom: -120,
    left: -60,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: theme.colors.errorTintSoft,
    opacity: 0.7,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xxl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.xxl,
    ...theme.shadows.md,
  },
  iconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.warningTintSoft,
    borderWidth: 1,
    borderColor: theme.colors.warning,
    marginBottom: theme.spacing.lg,
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: theme.spacing.xs,
    backgroundColor: theme.colors.primaryTintSoft,
    borderColor: theme.colors.primaryTintMedium,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.full,
    marginBottom: theme.spacing.lg,
  },
  badgeText: {
    color: theme.colors.primaryLight,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    fontWeight: '900',
    marginBottom: theme.spacing.sm,
  },
  sub: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: theme.spacing.xl,
  },
  tipCard: {
    backgroundColor: theme.colors.panel,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    rowGap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    columnGap: theme.spacing.sm,
  },
  tipText: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  errorBox: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  errorLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: theme.spacing.xs,
  },
  errorValue: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  primaryBtn: {
    backgroundColor: theme.colors.primary,
    minHeight: theme.minTouchSize,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
  },
  primaryBtnText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryBtn: {
    minHeight: theme.minTouchSize,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  secondaryBtnText: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    fontWeight: '700',
  },
});
