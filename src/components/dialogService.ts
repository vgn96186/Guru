import { Alert } from 'react-native';

// Re-export Alert temporarily — used only by dialogService fallback.
// All app code should use showDialog / showInfo / showSuccess / showWarning / showError / confirm / confirmDestructive.

export type DialogVariant = 'default' | 'success' | 'warning' | 'error' | 'focus' | 'destructive';

export type DialogAction = {
  id: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'destructive';
  onPress?: () => void | Promise<void>;
  isDestructive?: boolean;
  isLoading?: boolean;
};

export type DialogOptions = {
  title: string;
  message?: string;
  variant?: DialogVariant;
  actions: DialogAction[];
  allowDismiss?: boolean;
};

type DialogResolver = (result: string | 'dismissed') => void;

export type DialogRequest = DialogOptions & {
  resolve: DialogResolver;
};

type DialogListener = (request: DialogRequest) => void;

let listener: DialogListener | null = null;

export function registerDialogListener(nextListener: DialogListener | null) {
  listener = nextListener;
}

function toAlertButtons(actions: DialogAction[], resolve: DialogResolver) {
  if (actions.length === 0) {
    return [{ text: 'OK', onPress: () => resolve('dismissed') }];
  }

  return actions.map((action) => ({
    text: action.label,
    style:
      action.variant === 'destructive' || action.isDestructive
        ? ('destructive' as const)
        : action.variant === 'secondary'
          ? ('cancel' as const)
          : ('default' as const),
    onPress: () => resolve(action.id),
  }));
}

function fallbackToNativeAlert(options: DialogOptions): Promise<string | 'dismissed'> {
  return new Promise((resolve) => {
    Alert.alert(options.title, options.message, toAlertButtons(options.actions, resolve), {
      cancelable:
        options.allowDismiss ??
        !options.actions.some((action) => action.isDestructive || action.variant === 'destructive'),
    });
  });
}

export function showDialog(options: DialogOptions): Promise<string | 'dismissed'> {
  if (!listener) {
    return fallbackToNativeAlert(options);
  }

  return new Promise((resolve) => {
    listener?.({
      ...options,
      resolve,
    });
  });
}

function getErrorMessage(error: unknown, fallbackMessage?: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallbackMessage ?? 'Unknown error';
}

export function showError(error: unknown, fallbackMessage?: string) {
  return showDialog({
    title: 'Something went wrong',
    message: getErrorMessage(error, fallbackMessage),
    variant: 'error',
    actions: [{ id: 'ok', label: 'OK', variant: 'primary' }],
    allowDismiss: true,
  });
}

/** Simple informational dialog (variant: default) */
export function showInfo(title: string, message?: string) {
  return showDialog({
    title,
    message,
    variant: 'default',
    actions: [{ id: 'ok', label: 'OK', variant: 'primary' }],
    allowDismiss: true,
  });
}

/** Success notification dialog */
export function showSuccess(title: string, message?: string) {
  return showDialog({
    title,
    message,
    variant: 'success',
    actions: [{ id: 'ok', label: 'OK', variant: 'primary' }],
    allowDismiss: true,
  });
}

/** Warning dialog */
export function showWarning(title: string, message?: string) {
  return showDialog({
    title,
    message,
    variant: 'warning',
    actions: [{ id: 'ok', label: 'OK', variant: 'primary' }],
    allowDismiss: true,
  });
}

/** Confirmation dialog — returns true if the user confirmed */
export async function confirm(
  title: string,
  message?: string,
  opts?: { confirmLabel?: string; cancelLabel?: string },
): Promise<boolean> {
  const result = await showDialog({
    title,
    message,
    variant: 'focus',
    actions: [
      { id: 'cancel', label: opts?.cancelLabel ?? 'Cancel', variant: 'secondary' },
      { id: 'confirm', label: opts?.confirmLabel ?? 'OK', variant: 'primary' },
    ],
    allowDismiss: true,
  });
  return result === 'confirm';
}

/** Destructive confirmation dialog — returns true if the user confirmed */
export async function confirmDestructive(
  title: string,
  message?: string,
  opts?: { confirmLabel?: string; cancelLabel?: string },
): Promise<boolean> {
  const result = await showDialog({
    title,
    message,
    variant: 'destructive',
    actions: [
      { id: 'cancel', label: opts?.cancelLabel ?? 'Cancel', variant: 'secondary' },
      { id: 'confirm', label: opts?.confirmLabel ?? 'Delete', variant: 'destructive' },
    ],
    allowDismiss: false,
  });
  return result === 'confirm';
}

export function __resetDialogServiceForTests() {
  listener = null;
}
