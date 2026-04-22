import { useEffect, useState } from 'react';
import * as Launcher from '../../modules/app-launcher';
import { useProfileQuery } from './queries/useProfile';
import { requireNativeModule } from 'expo-modules-core';
const GuruAppLauncher = requireNativeModule('GuruAppLauncher');

type Handlers = {
  onButton?: () => void;
  onAirMotion?: (dx: number, dy: number) => void;
};

export function useSPen({ onButton, onAirMotion }: Handlers) {
  const { data: profile } = useProfileQuery();
  const enabled = profile?.useSPenControls ?? true;

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    Launcher.startSPenListening().then((ok) => {
      if (!ok) active = false;
    });

    const sub1 = onButton ? GuruAppLauncher.addListener('onSPenButton', () => onButton()) : null;

    const sub2 = onAirMotion
      ? GuruAppLauncher.addListener('onSPenAirMotion', (e: { dx: number; dy: number }) =>
          onAirMotion(e.dx, e.dy),
        )
      : null;

    return () => {
      active = false;
      sub1?.remove();
      sub2?.remove();
      Launcher.stopSPenListening();
    };
  }, [onButton, onAirMotion, enabled]);
}
