import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme as n } from '../theme/linearTheme';
import LinearText from './primitives/LinearText';

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
          <Ionicons name="alert-circle-outline" size={34} color={n.colors.warning} />
        </View>

        <View style={styles.badge}>
          <Ionicons name="shield-checkmark-outline" size={14} color={n.colors.accent} />
          <LinearText variant="badge" tone="accent">
            {statusLabel}
          </LinearText>
        </View>

        <LinearText variant="title" tone="primary">
          {title}
        </LinearText>
        <LinearText variant="body" tone="secondary">
          {message}
        </LinearText>

        {tips.length > 0 ? (
          <View style={styles.tipCard}>
            {tips.map((tip, index) => (
              <View key={`${index}-${tip}`} style={styles.tipRow}>
                <Ionicons
                  name={index === 0 ? 'refresh-outline' : 'checkmark-circle-outline'}
                  size={16}
                  color={index === 0 ? n.colors.textSecondary : n.colors.success}
                />
                <LinearText variant="body" tone="secondary">
                  {tip}
                </LinearText>
              </View>
            ))}
          </View>
        ) : null}

        {safeDetail ? (
          <View style={styles.errorBox}>
            <LinearText variant="label" tone="muted">
              Technical note
            </LinearText>
            <LinearText variant="bodySmall" tone="secondary" numberOfLines={3}>
              {safeDetail}
            </LinearText>
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={onPrimary}
          accessibilityRole="button"
          accessibilityLabel={primaryAccessibilityLabel}
        >
          <LinearText variant="body" tone="inverse">
            {primaryLabel}
          </LinearText>
        </TouchableOpacity>

        {secondaryLabel && onSecondary ? (
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={onSecondary}
            accessibilityRole="button"
            accessibilityLabel={secondaryAccessibilityLabel ?? secondaryLabel}
          >
            <LinearText variant="body" tone="secondary">
              {secondaryLabel}
            </LinearText>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: n.colors.background,
    justifyContent: 'center',
    padding: n.spacing.xl,
    overflow: 'hidden',
  },
  glowPrimary: {
    position: 'absolute',
    top: -110,
    right: -50,
    width: 240,
    height: 240,
    borderRadius: 999,
    backgroundColor: n.colors.primaryTintSoft,
    opacity: 0.9,
  },
  glowAccent: {
    position: 'absolute',
    bottom: -120,
    left: -60,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(241,76,76,0.08)',
    opacity: 0.7,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    backgroundColor: n.colors.surface,
    borderRadius: n.radius.lg,
    borderWidth: 1,
    borderColor: n.colors.border,
    padding: n.spacing.xl,
    ...{
      shadowColor: n.colors.background,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 6,
    },
  },
  iconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(217,119,6,0.08)',
    borderWidth: 1,
    borderColor: n.colors.warning,
    marginBottom: n.spacing.lg,
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: n.spacing.xs,
    backgroundColor: n.colors.primaryTintSoft,
    borderColor: n.colors.borderHighlight,
    borderWidth: 1,
    paddingHorizontal: n.spacing.md,
    paddingVertical: n.spacing.sm,
    borderRadius: n.radius.full,
    marginBottom: n.spacing.lg,
  },
  badgeText: {
    color: n.colors.accent,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  title: {
    color: n.colors.textPrimary,
    fontSize: 28,
    fontWeight: '900',
    marginBottom: n.spacing.sm,
  },
  sub: {
    color: n.colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: n.spacing.xl,
  },
  tipCard: {
    backgroundColor: n.colors.surface,
    borderRadius: n.radius.lg,
    borderWidth: 1,
    borderColor: n.colors.border,
    padding: n.spacing.lg,
    rowGap: n.spacing.md,
    marginBottom: n.spacing.lg,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    columnGap: n.spacing.sm,
  },
  tipText: {
    flex: 1,
    color: n.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  errorBox: {
    backgroundColor: n.colors.surface,
    borderRadius: n.radius.md,
    borderWidth: 1,
    borderColor: n.colors.border,
    padding: n.spacing.md,
    marginBottom: n.spacing.lg,
  },
  errorLabel: {
    color: n.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: n.spacing.xs,
  },
  errorValue: {
    color: n.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  primaryBtn: {
    backgroundColor: n.colors.accent,
    minHeight: 44,
    borderRadius: n.radius.lg,
    paddingHorizontal: n.spacing.xl,
    paddingVertical: n.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: n.spacing.md,
  },
  primaryBtnText: {
    color: n.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryBtn: {
    minHeight: 44,
    borderRadius: n.radius.lg,
    paddingHorizontal: n.spacing.xl,
    paddingVertical: n.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.borderLight,
  },
  secondaryBtnText: {
    color: n.colors.textSecondary,
    fontSize: 15,
    fontWeight: '700',
  },
});
