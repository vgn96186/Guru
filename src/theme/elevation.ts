/**
 * Flat elevation scale — replaces LinearSurface's composite glass layers.
 *
 *   e0  page / scroll background
 *   e1  cards, list rows, default surfaces
 *   e2  sheets, menus, popovers, modals
 *
 * Borders (not gradients) carry the hierarchy. One 1px top-edge highlight is
 * reserved for *interactive* e1/e2 surfaces to signal "this can be pressed."
 */
export const elevation = {
  e0: {
    bg: 'transparent',
    border: 'transparent',
    gradientStart: 'rgba(255, 255, 255, 0.01)',
    gradientEnd: 'rgba(0, 0, 0, 0.0)',
  },
  e1: {
    bg: 'transparent',
    border: 'rgba(255, 255, 255, 0.08)',
    gradientStart: 'rgba(255, 255, 255, 0.05)',
    gradientEnd: 'rgba(255, 255, 255, 0.01)',
  },
  e2: {
    bg: 'transparent',
    border: 'rgba(255, 255, 255, 0.12)',
    gradientStart: 'rgba(255, 255, 255, 0.08)',
    gradientEnd: 'rgba(255, 255, 255, 0.02)',
  },
  topEdgeInteractive: 'rgba(255, 255, 255, 0.15)',
} as const;

export type ElevationLevel = 'e0' | 'e1' | 'e2';
