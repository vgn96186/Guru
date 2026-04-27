import React, { useEffect, useMemo, useState } from 'react';
import { linearTheme as n } from '../theme/linearTheme';
import { accentAlpha, successAlpha, errorAlpha, warningAlpha } from '../theme/colorUtils';
import { Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import LinearText from './primitives/LinearText';
import { type DialogAction, type DialogRequest, registerDialogListener } from './dialogService';

const VARIANT_STYLES = {
  default: {
    pillBg: accentAlpha['8'],
    pillText: n.colors.accent,
    border: n.colors.borderLight,
  },
  success: {
    pillBg: successAlpha['10'],
    pillText: n.colors.success,
    border: n.colors.success,
  },
  warning: {
    pillBg: warningAlpha['10'],
    pillText: n.colors.warning,
    border: n.colors.warning,
  },
  error: {
    pillBg: errorAlpha['10'],
    pillText: n.colors.error,
    border: n.colors.error,
  },
  focus: {
    pillBg: accentAlpha['20'],
    pillText: n.colors.accent,
    border: n.colors.accent,
  },
  destructive: {
    pillBg: errorAlpha['10'],
    pillText: n.colors.error,
    border: n.colors.error,
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
    backgroundColor: 'rgba(6, 8, 14, 0.72)',
    justifyContent: 'center',
    padding: n.spacing.xl,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  dialog: {
    backgroundColor: 'rgba(10, 12, 16, 0.98)',
    borderRadius: 20,
    borderWidth: 1,
    padding: n.spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 24,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: n.spacing.sm,
    paddingVertical: 4,
    borderRadius: n.radius.full,
    marginBottom: n.spacing.md,
  },
  badgeText: {
    ...n.typography.caption,
    letterSpacing: 0.6,
  },
  title: {
    ...n.typography.title,
    color: n.colors.textPrimary,
    marginBottom: n.spacing.sm,
  },
  message: {
    ...n.typography.body,
    color: n.colors.textSecondary,
    lineHeight: 22,
  },
  actions: {
    gap: n.spacing.sm,
    marginTop: n.spacing.xl,
  },
  actionButton: {
    borderRadius: n.radius.lg,
    paddingVertical: n.spacing.md,
    paddingHorizontal: n.spacing.lg,
    borderWidth: 1,
    alignItems: 'center',
  },
  actionButtonPrimary: {
    backgroundColor: n.colors.accent,
    borderColor: n.colors.accent,
  },
  actionButtonSecondary: {
    backgroundColor: 'transparent',
    borderColor: n.colors.borderLight,
  },
  actionButtonDestructive: {
    backgroundColor: errorAlpha['10'],
    borderColor: n.colors.error,
  },
  actionButtonDisabled: {
    opacity: 0.65,
  },
  actionText: {
    ...n.typography.button,
  },
  actionTextPrimary: {
    color: n.colors.textInverse,
  },
  actionTextSecondary: {
    color: n.colors.textPrimary,
  },
  actionTextDestructive: {
    color: n.colors.error,
  },
});
