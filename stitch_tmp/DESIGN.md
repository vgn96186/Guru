---
name: Obsidian Glass
colors:
  surface: '#0e141a'
  surface-dim: '#0e141a'
  surface-bright: '#343a41'
  surface-container-lowest: '#090f15'
  surface-container-low: '#171c23'
  surface-container: '#1b2027'
  surface-container-high: '#252a32'
  surface-container-highest: '#30353d'
  on-surface: '#dee3ec'
  on-surface-variant: '#c6c5d5'
  inverse-surface: '#dee3ec'
  inverse-on-surface: '#2c3138'
  outline: '#908f9e'
  outline-variant: '#454652'
  surface-tint: '#bdc2ff'
  primary: '#bdc2ff'
  on-primary: '#121f8b'
  primary-container: '#5e6ad2'
  on-primary-container: '#fdfaff'
  inverse-primary: '#4854bb'
  secondary: '#c6c6c6'
  on-secondary: '#303030'
  secondary-container: '#474747'
  on-secondary-container: '#b5b5b5'
  tertiary: '#c8c6c5'
  on-tertiary: '#313030'
  tertiary-container: '#747373'
  on-tertiary-container: '#fdfafa'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#dfe0ff'
  primary-fixed-dim: '#bdc2ff'
  on-primary-fixed: '#000965'
  on-primary-fixed-variant: '#2e3aa2'
  secondary-fixed: '#e2e2e2'
  secondary-fixed-dim: '#c6c6c6'
  on-secondary-fixed: '#1b1b1b'
  on-secondary-fixed-variant: '#474747'
  tertiary-fixed: '#e5e2e1'
  tertiary-fixed-dim: '#c8c6c5'
  on-tertiary-fixed: '#1c1b1b'
  on-tertiary-fixed-variant: '#474746'
  background: '#0e141a'
  on-background: '#dee3ec'
  surface-variant: '#30353d'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '600'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  body-base:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
    letterSpacing: '0'
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.4'
    letterSpacing: '0'
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.05em
  code-mono:
    fontFamily: monospace
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.4'
    letterSpacing: '0'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin: 24px
  container-max: 1200px
---

## Brand & Style

This design system targets high-performance power users who demand technical precision and aesthetic depth. It merges the utilitarian, grid-driven logic of Linear with a sophisticated glassmorphism layer. The brand personality is focused, premium, and futuristic, evoking the feeling of a high-end physical workstation or a cockpit HUD.

The visual style utilizes "Deep Glass"—a combination of true AMOLED black foundations and floating semi-transparent modules. The emotional response is one of total immersion, where the UI recedes into the background to prioritize the user's work while providing tactile satisfaction through subtle light interactions and depth.

## Colors

The palette is anchored by `#000000` to take full advantage of AMOLED displays, ensuring infinite contrast and energy efficiency. The primary brand color, `#5E6AD2`, is used sparingly for critical actions, active states, and focus indicators.

Functional colors are derived from the neutral grey scale to maintain a monochromatic utilitarian feel. Gradient blurs in the background use `#1A1A1A` to create soft "pools" of light that break up the total blackness without compromising the dark aesthetic. Glass surfaces use a semi-transparent dark tint to allow these background gradients to bleed through subtly.

## Typography

This design system utilizes **Inter** for all interface elements to maintain a systematic and unobtrusive character. Typography is used as a structural element rather than a decorative one.

High-contrast weight distribution (SemiBold for labels/headers vs. Regular for body) ensures legibility against dark backgrounds. Tracking is tightened slightly for large headings to maintain the "Linear" density, while uppercase labels are given extra tracking for technical clarity.

## Layout & Spacing

The layout follows a strict 4px baseline grid, emphasizing density and information richness. A 12-column fluid grid is used for main content areas, while sidebars and inspectors remain fixed at technical widths (e.g., 240px or 320px).

Margins and gutters are kept tight (16-24px) to reinforce the utilitarian feel. Deep padding within glass modules (20px+) is used to balance the density of the overall layout, providing "breathing room" inside the containers themselves.

## Elevation & Depth

Depth is not communicated through shadows, but through **transparency and backdrop blurs**.

1.  **Level 0 (Canvas):** Pure `#000000` black.
2.  **Level 1 (Gradients):** Subtle, non-interactive radial blurs of dark grey (`#1A1A1A`) behind the glass layers.
3.  **Level 2 (Glass Surfaces):** Semi-transparent surfaces with a `20px` to `40px` backdrop-blur.
4.  **Level 3 (Interactive):** Hover states on glass elements increase the border opacity or add a faint primary-colored glow (`#5E6AD2` at 10% opacity).

Borders are critical: every glass container must have a `1px` solid border using a low-opacity white (8-12%) to define edges against the black canvas.

## Shapes

The shape language is "Soft-Tech." Standard components use a `4px` (0.25rem) radius to maintain a precise, engineered look. Larger containers and cards use an `8px` (0.5rem) radius to soften the glass edges and make them feel like polished lenses. This minimal roundedness preserves the utilitarian aesthetic while avoiding the harshness of sharp 0px corners.

## Components

### Buttons

- **Primary:** Solid `#5E6AD2` with white text. No glass effect.
- **Secondary/Glass:** Semi-transparent background with a more pronounced `1px` white border (20% opacity). Subtle hover lift effect.

### Input Fields

- Dark, recessed appearance. Background is slightly darker than the surrounding glass. Active state uses a `1px` solid `#5E6AD2` border with a tiny glow.

### Cards & Modules

- Must utilize `backdrop-filter: blur(24px)`.
- Borders must be absolute 1px (non-scaling) to ensure technical precision.

### Chips & Badges

- Small, low-contrast capsules. Background uses 10% primary color for active states or 10% white for neutral states. Typography is always `label-caps`.

### List Items

- Separated by thin, 1px lines at 5% white opacity. Hover states change the background to 5% white to signify selection without breaking the glass transparency.
