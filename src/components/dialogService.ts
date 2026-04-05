import { Alert } from 'react-native';

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

export function __resetDialogServiceForTests() {
  listener = null;
}
