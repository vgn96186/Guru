import { useEffect, useState } from 'react';

type AccessibilityInfoLike = {
  addEventListener(
    eventName: 'reduceMotionChanged',
    handler: (enabled: boolean) => void,
  ): { remove?: () => void };
  isReduceMotionEnabled(): Promise<boolean>;
};

const AccessibilityInfo =
  require('react-native/Libraries/Components/AccessibilityInfo/AccessibilityInfo')
    .default as AccessibilityInfoLike;

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
