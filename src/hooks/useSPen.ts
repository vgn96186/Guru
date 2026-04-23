import { useEffect } from 'react';
import * as Launcher from '../../modules/app-launcher';
import { useProfileQuery } from './queries/useProfile';
import { requireNativeModule } from 'expo-modules-core';

type NativeListener = { remove: () => void };
type GuruAppLauncherModule = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  addListener?: (eventName: string, listener: (...args: any[]) => void) => NativeListener;
};

let GuruAppLauncher: GuruAppLauncherModule | null = null;
try {
  GuruAppLauncher = requireNativeModule('GuruAppLauncher') as GuruAppLauncherModule;
} catch {
  GuruAppLauncher = null;
}

type Handlers = {
  onButton?: () => void;
  onAirMotion?: (dx: number, dy: number) => void;
};

export function useSPen({ onButton, onAirMotion }: Handlers) {
  const profileQuery = useProfileQuery();
  const profile = profileQuery?.data;
  const enabled = profile?.useSPenControls ?? true;

  useEffect(() => {
    if (!enabled) return;
    void Launcher.startSPenListening().catch(() => undefined);

    const sub1 =
      onButton && GuruAppLauncher?.addListener
        ? GuruAppLauncher.addListener('onSPenButton', () => onButton())
        : null;

    const sub2 = onAirMotion
      ? GuruAppLauncher?.addListener?.('onSPenAirMotion', (e: { dx: number; dy: number }) =>
          onAirMotion(e.dx, e.dy),
        )
      : null;

    return () => {
      sub1?.remove();
      sub2?.remove();
      void Launcher.stopSPenListening?.().catch(() => undefined);
    };
  }, [onButton, onAirMotion, enabled]);
}
