import React, { useEffect, useMemo, useState } from 'react';
import { linearTheme as n } from '../theme/linearTheme';
import { Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import LinearText from './primitives/LinearText';
import { theme } from '../constants/theme';
import { type DialogAction, type DialogRequest, registerDialogListener } from './dialogService';

const VARIANT_STYLES = {
  default: {
    pillBg: theme.colors.primaryTintSoft,
    pillText: theme.colors.primaryLight,
    border: theme.colors.borderLight,
  },
  success: {
    pillBg: theme.colors.successTintSoft,
    pillText: theme.colors.success,
    border: theme.colors.success,
  },
  warning: {
    pillBg: theme.colors.warningTintSoft,
    pillText: theme.colors.warning,
    border: theme.colors.warning,
  },
  error: {
    pillBg: theme.colors.errorTintSoft,
    pillText: theme.colors.error,
    border: theme.colors.error,
  },
  focus: {
    pillBg: theme.colors.primaryTintMedium,
    pillText: theme.colors.primaryLight,
    border: theme.colors.primary,
  },
  destructive: {
    pillBg: theme.colors.errorTintSoft,
    pillText: theme.colors.error,
    border: theme.colors.error,
  },
} as const;

function actionStyle(action: DialogAction, loadingActionId: string | null) {
  const destructive = action.variant === 'destructive' || action.isDestructive;
  const isLoading = loadingActionId === action.id || action.isLoading;
  return {
    container: [
      styles.actionButton,
      destructive
        ? styles.actionButtonDestructive
        : action.variant === 'secondary'
          ? styles.actionButtonSecondary
          : styles.actionButtonPrimary,
      isLoading ? styles.actionButtonDisabled : null,
    ],
    text: [
      styles.actionText,
      destructive
        ? styles.actionTextDestructive
        : action.variant === 'secondary'
          ? styles.actionTextSecondary
          : styles.actionTextPrimary,
    ],
  };
}

export function DialogHost() {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);
  const activeDialog = queue[0] ?? null;

  useEffect(() => {
    registerDialogListener((request) => {
      setQueue((current) => [...current, request]);
    });

    return () => {
      registerDialogListener(null);
    };
  }, []);

  const variantPalette = useMemo(() => {
    const variant = activeDialog?.variant ?? 'default';
    return VARIANT_STYLES[variant];
  }, [activeDialog?.variant]);

  const shiftQueue = (result: string | 'dismissed') => {
    setQueue((current) => {
      if (current.length === 0) return current;
      current[0]?.resolve(result);
      return current.slice(1);
    });
    setLoadingActionId(null);
  };

  const handleDismiss = () => {
    const canDismiss =
      activeDialog?.allowDismiss ??
      !activeDialog?.actions.some(
        (action) => action.variant === 'destructive' || action.isDestructive,
      );
    if (!canDismiss || loadingActionId) return;
    shiftQueue('dismissed');
  };

  const handleActionPress = async (action: DialogAction) => {
    if (!activeDialog) return;

    if (action.onPress) {
      setLoadingActionId(action.id);
      await action.onPress();
    }

    shiftQueue(action.id);
  };

  return (
    <Modal
      visible={Boolean(activeDialog)}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleDismiss} />
        {activeDialog ? (
          <View style={[styles.dialog, { borderColor: variantPalette.border }]}>
            <View style={[styles.badge, { backgroundColor: variantPalette.pillBg }]}>
              <LinearText
                variant="badge"
                style={[styles.badgeText, { color: variantPalette.pillText }]}
              >
                {(activeDialog.variant ?? 'default').toUpperCase()}
              </LinearText>
            </View>
            <LinearText accessibilityRole="header" variant="title" style={styles.title}>
              {activeDialog.title}
            </LinearText>
            {activeDialog.message ? (
              <LinearText variant="body" style={styles.message}>
                {activeDialog.message}
              </LinearText>
            ) : null}
            <View style={styles.actions}>
              {activeDialog.actions.map((action) => {
                const style = actionStyle(action, loadingActionId);
                return (
                  <TouchableOpacity
                    key={action.id}
                    onPress={() => void handleActionPress(action)}
                    style={style.container}
                    disabled={Boolean(loadingActionId)}
                  >
                    <LinearText variant="body" style={style.text}>
                      {loadingActionId === action.id ? 'Working...' : action.label}
                    </LinearText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  dialog: {
    backgroundColor: theme.colors.panel,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    padding: theme.spacing.xl,
    shadowColor: n.colors.background,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 12,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
    marginBottom: theme.spacing.md,
  },
  badgeText: {
    ...theme.typography.captionSmall,
    letterSpacing: 0.6,
  },
  title: {
    ...theme.typography.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  message: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    lineHeight: 22,
  },
  actions: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xl,
  },
  actionButton: {
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderWidth: 1,
    alignItems: 'center',
  },
  actionButtonPrimary: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  actionButtonSecondary: {
    backgroundColor: 'transparent',
    borderColor: theme.colors.borderLight,
  },
  actionButtonDestructive: {
    backgroundColor: theme.colors.errorTintSoft,
    borderColor: theme.colors.error,
  },
  actionButtonDisabled: {
    opacity: 0.65,
  },
  actionText: {
    ...theme.typography.button,
  },
  actionTextPrimary: {
    color: theme.colors.textInverse,
  },
  actionTextSecondary: {
    color: theme.colors.textPrimary,
  },
  actionTextDestructive: {
    color: theme.colors.error,
  },
});
