/**
 * A11y constants + dev-only contrast checker.
 *
 * HIT_SIZE is the minimum tappable region (iOS HIG 44pt / Android 48dp).
 * Use hitSlop to keep visuals compact while extending touch targets.
 */
export const HIT_SIZE = 44;

/** Converts a hex color to linearized luminance per WCAG. */
function luminance(hex: string): number {
  const c = hex.startsWith('#') ? hex.slice(1) : hex;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255);
  const adj = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * adj(r) + 0.7152 * adj(g) + 0.0722 * adj(b);
}

/** WCAG contrast ratio (1–21). AA body text requires 4.5:1, large text 3:1. */
export function contrastRatio(fg: string, bg: string): number {
  const L1 = luminance(fg);
  const L2 = luminance(bg);
  const [a, b] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (a + 0.05) / (b + 0.05);
}

/** Dev-only assertion; no-op in production. */
export function assertContrast(fg: string, bg: string, label: string, min = 4.5) {
  if (!__DEV__) return;
  const r = contrastRatio(fg, bg);
  if (r < min) {
    console.warn(
      `[a11y] ${label}: contrast ${r.toFixed(2)} < ${min} — fg=${fg} on bg=${bg}`,
    );
  }
}
