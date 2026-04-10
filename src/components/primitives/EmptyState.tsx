import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme as n } from '../../theme/linearTheme';
import LinearText from './LinearText';
import LinearButton from './LinearButton';
import LinearSurface from './LinearSurface';

type EmptyStateVariant = 'fullscreen' | 'card';

export interface EmptyStateAction {
  label: string;
  onPress: () => void;
  /** LinearButton variant. Defaults to `ghost` for the first action, `outline` for the rest. */
  buttonVariant?: 'primary' | 'ghost' | 'outline' | 'glass' | 'glassTinted';
  /** Tints the label + icon with the error color (use for Delete / destructive). */
  destructive?: boolean;
  /** Optional Ionicon rendered to the left of the label. */
  icon?: keyof typeof Ionicons.glyphMap;
}

interface EmptyStateProps {
  /** Layout mode — `fullscreen` fills parent (flex:1), `card` renders inline inside a LinearSurface. */
  variant?: EmptyStateVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  iconSize?: number;
  iconColor?: string;
  title: string;
  subtitle?: string;
  /** Single action (kept for backwards-compat). Prefer `actions` for new code. */
  action?: { label: string; onPress: () => void };
  /** Zero or more action buttons rendered below the subtitle. */
  actions?: EmptyStateAction[];
  style?: StyleProp<ViewStyle>;
}

export default function EmptyState({
  variant = 'fullscreen',
  icon = 'document-text-outline',
  iconSize = 56,
  iconColor,
  title,
  subtitle,
  action,
  actions,
  style,
}: EmptyStateProps) {
  // Normalize legacy `action` → `actions`
  const resolvedActions: EmptyStateAction[] =
    actions && actions.length > 0
      ? actions
      : action
        ? [{ label: action.label, onPress: action.onPress }]
        : [];

  const inner = (
    <>
      <Ionicons name={icon} size={iconSize} color={iconColor ?? n.colors.textMuted} />
      <LinearText variant="sectionTitle" tone="primary" style={styles.title}>
        {title}
      </LinearText>
      {subtitle ? (
        <LinearText variant="bodySmall" tone="muted" style={styles.subtitle}>
          {subtitle}
        </LinearText>
      ) : null}
      {resolvedActions.length > 0 ? (
        <View
          style={[
            styles.actionsRow,
            resolvedActions.length === 1 && styles.actionsRowSingle,
          ]}
        >
          {resolvedActions.map((a, idx) => {
            const buttonVariant =
              a.buttonVariant ?? (idx === 0 ? 'ghost' : 'outline');
            const labelColor = a.destructive ? n.colors.error : undefined;
            return (
              <LinearButton
                key={`${a.label}-${idx}`}
                label={a.label}
                variant={buttonVariant}
                onPress={a.onPress}
                leftIcon={
                  a.icon ? (
                    <Ionicons
                      name={a.icon}
                      size={16}
                      color={labelColor ?? n.colors.textPrimary}
                    />
                  ) : undefined
                }
                textStyle={labelColor ? { color: labelColor } : undefined}
                style={
                  a.destructive
                    ? { borderColor: n.colors.error }
                    : undefined
                }
              />
            );
          })}
        </View>
      ) : null}
    </>
  );

  if (variant === 'card') {
    return (
      <LinearSurface padded={false} style={[styles.card, style]}>
        {inner}
      </LinearSurface>
    );
  }

  return <View style={[styles.container, style]}>{inner}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: n.spacing.xl,
  },
  card: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: n.spacing.xl,
  },
  title: {
    marginTop: n.spacing.md,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: n.spacing.sm,
    textAlign: 'center',
  },
  actionsRow: {
    marginTop: n.spacing.lg,
    flexDirection: 'row',
    gap: n.spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  actionsRowSingle: {
    flexDirection: 'column',
  },
});
