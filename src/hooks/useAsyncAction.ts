import { useCallback, useEffect, useRef, useState } from 'react';
import { showError } from '../components/dialogService';
import { showToast } from '../components/Toast';

type FeedbackMode = 'dialog' | 'toast' | 'silent';

interface UseAsyncActionOptions {
  /** How to show errors. Default: 'dialog' */
  onError?: FeedbackMode | ((error: unknown) => void);
  /** Fallback error message if the error has no message */
  fallbackMessage?: string;
  /** Show success toast on completion */
  successMessage?: string;
}

interface AsyncActionState {
  loading: boolean;
  error: Error | null;
}

/**
 * Wraps an async operation with loading state, error handling, and user feedback.
 *
 * ```ts
 * const [handleDelete, { loading }] = useAsyncAction(
 *   async () => { await deleteItem(id); },
 *   { onError: 'dialog', fallbackMessage: 'Failed to delete' }
 * );
 * ```
 */
export function useAsyncAction<TArgs extends unknown[] = [], TResult = void>(
  action: (...args: TArgs) => Promise<TResult>,
  options?: UseAsyncActionOptions,
): [(...args: TArgs) => Promise<TResult | undefined>, AsyncActionState] {
  const [state, setState] = useState<AsyncActionState>({ loading: false, error: null });
  const mountedRef = useRef(true);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const execute = useCallback(
    async (...args: TArgs): Promise<TResult | undefined> => {
      setState({ loading: true, error: null });
      try {
        const result = await action(...args);
        if (mountedRef.current) {
          setState({ loading: false, error: null });
          if (optionsRef.current?.successMessage) {
            showToast(optionsRef.current.successMessage, 'success');
          }
        }
        return result;
      } catch (err) {
        if (mountedRef.current) {
          setState({
            loading: false,
            error: err instanceof Error ? err : new Error(String(err)),
          });
        }
        const mode = optionsRef.current?.onError ?? 'dialog';
        if (typeof mode === 'function') {
          mode(err);
        } else if (mode === 'dialog') {
          void showError(err, optionsRef.current?.fallbackMessage);
        } else if (mode === 'toast') {
          const msg =
            err instanceof Error
              ? err.message
              : (optionsRef.current?.fallbackMessage ?? 'Something went wrong');
          showToast(msg, 'error');
        }
        // 'silent' does nothing
        return undefined;
      }
    },
    [action],
  );

  return [execute, state];
}
