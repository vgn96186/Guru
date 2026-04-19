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
  e0: { bg: '#0A0A0B', border: 'transparent' },
  e1: { bg: '#121214', border: 'rgba(255, 255, 255, 0.06)' },
  e2: { bg: '#18181C', border: 'rgba(255, 255, 255, 0.10)' },
  topEdgeInteractive: 'rgba(255, 255, 255, 0.08)',
} as const;

export type ElevationLevel = 'e0' | 'e1' | 'e2';
