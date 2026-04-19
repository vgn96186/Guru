/**
 * Icon vocabulary — constrain Ionicons so screens stop picking randomly.
 *
 *   sizes    14 | 18 | 22  (use 18 unless you have a reason)
 *   style    outlined by default, filled for selected-state only
 *   color    inherits from textPrimary / textSecondary / role color
 *
 * Custom verb icons (braindump, lecture, pomodoro) live in assets/icons/*.svg
 * at the same sizes.
 */
export const iconSize = { sm: 14, md: 18, lg: 22 } as const;
export type IconSize = keyof typeof iconSize;

/** Map our icon names to Ionicons outlined+filled pairs. */
export type IconStyle = 'outlined' | 'filled';
export const DEFAULT_ICON_STYLE: IconStyle = 'outlined';
export const DEFAULT_ICON_SIZE: IconSize = 'md';
