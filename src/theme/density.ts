/**
 * Density presets — applied at the section/card level, never ad-hoc.
 *
 *   compact       list rows, dense tables, chip rails
 *   comfortable   DEFAULT — cards, forms, most screens
 *   spacious      empty states, hero sections, first-run screens
 *
 * In new code, reach for `density.comfortable` and only drop down/up when
 * the context demands it.
 */
export const density = {
  compact: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
    rowGap: 6,
  },
  comfortable: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 12,
    rowGap: 10,
  },
  spacious: {
    paddingVertical: 28,
    paddingHorizontal: 24,
    gap: 20,
    rowGap: 16,
  },
} as const;

export type Density = keyof typeof density;
export const DEFAULT_DENSITY: Density = 'comfortable';
