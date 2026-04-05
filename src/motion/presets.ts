export const screenEnterTiming = { duration: 240 } as const;
export const screenSettleTiming = { duration: 160 } as const;
export const sectionEnterTiming = { duration: 180 } as const;
export const sectionStaggerMs = 50;
export const cardPressTiming = { in: 80, out: 150 } as const;
export const decorativeIdleDelayMs = 320;

export const SCREEN_MOTION_TRIGGERS = ['first-mount', 'focus-settle', 'manual'] as const;
export type ScreenMotionTrigger = (typeof SCREEN_MOTION_TRIGGERS)[number];
