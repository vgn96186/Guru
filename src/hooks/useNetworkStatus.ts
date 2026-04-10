import { useEffect, useMemo, useRef, useState } from 'react';
import * as Network from 'expo-network';
import { showToast } from '../components/Toast';
import { processQueue } from '../services/offlineQueue';

function resolveOnline(state: Network.NetworkState | null): boolean | null {
  if (!state) return null;
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  if (state.isConnected === true || state.isInternetReachable === true) return true;
  return null;
}

export function useNetworkStatus() {
  const [networkState, setNetworkState] = useState<Network.NetworkState | null>(null);
  const hasObservedInitialState = useRef(false);
  const previousOnline = useRef<boolean | null>(null);

  useEffect(() => {
    let active = true;

    void Network.getNetworkStateAsync().then((state) => {
      if (!active) return;
      setNetworkState(state);
      previousOnline.current = resolveOnline(state);
      hasObservedInitialState.current = true;
    });

    const subscription = Network.addNetworkStateListener((nextState) => {
      if (!active) return;

      const nextOnline = resolveOnline(nextState);
      const prevOnline = previousOnline.current;

      setNetworkState(nextState);

      if (hasObservedInitialState.current && prevOnline !== nextOnline) {
        if (nextOnline === false) {
          showToast({
            title: 'Offline mode',
            message: 'AI requests will resume automatically when your connection returns.',
            variant: 'warning',
            duration: 2800,
          });
        } else if (nextOnline === true) {
          showToast({
            title: 'Back online',
            message: 'Retrying queued AI work in the background.',
            variant: 'success',
            duration: 2400,
          });
          void processQueue().catch((error) =>
            console.warn('[NetworkStatus] Failed to process queue after reconnect:', error),
          );
        }
      }

      previousOnline.current = nextOnline;
      hasObservedInitialState.current = true;
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return useMemo(() => {
    const online = resolveOnline(networkState);
    return {
      networkState,
      isOnline: online === true,
      isOffline: online === false,
      isResolved: online !== null,
    };
  }, [networkState]);
}
