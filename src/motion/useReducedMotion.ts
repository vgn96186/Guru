import { useEffect, useState } from 'react';

// Type definition for AccessibilityInfo reduce-motion API
// Kept for documentation purposes even though we import from react-native directly
type _AccessibilityInfoLike = {
  addEventListener(
    eventName: 'reduceMotionChanged',
    handler: (enabled: boolean) => void,
  ): { remove?: () => void };
  isReduceMotionEnabled(): Promise<boolean>;
};

import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let active = true;

    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) {
          setReducedMotion(enabled);
        }
      })
      .catch(() => {
        if (active) {
          setReducedMotion(false);
        }
      });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReducedMotion,
    );

    return () => {
      active = false;
      subscription?.remove?.();
    };
  }, []);

  return reducedMotion;
}
