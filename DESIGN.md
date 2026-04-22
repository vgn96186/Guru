---
colors:
  background:
    $value: '#030406'
    $type: color
  surface:
    default:
      $value: '#08090C'
      $type: color
    hover:
      $value: '#0C0D11'
      $type: color
  card:
    default:
      $value: '#08090C'
      $type: color
    hover:
      $value: '#0C0D11'
      $type: color
  border:
    default:
      $value: 'rgba(255, 255, 255, 0.08)'
      $type: color
    highlight:
      $value: 'rgba(255, 255, 255, 0.18)'
      $type: color
    light:
      $value: 'rgba(255, 255, 255, 0.15)'
      $type: color
  text:
    primary:
      $value: '#F2F2F2'
      $type: color
    secondary:
      $value: '#A0A0A5'
      $type: color
    muted:
      $value: '#939396'
      $type: color
    inverse:
      $value: '#000000'
      $type: color
  roles:
    brand:
      $value: '#5E6AD2'
      $type: color
    brandHi:
      $value: 'oklch(62% 0.14 272)'
      $type: color
    brandLo:
      $value: 'oklch(46% 0.12 272)'
      $type: color
    capture:
      $value: '#6D99FF'
      $type: color
    success:
      $value: '#3FB950'
      $type: color
    warning:
      $value: '#D97706'
      $type: color
    danger:
      $value: '#F14C4C'
      $type: color
    neutral:
      $value: '#A0A0A5'
      $type: color
  gradients:
    surfaceStart:
      $value: 'rgba(255, 255, 255, 0.035)'
      $type: color
    surfaceMid:
      $value: 'rgba(255, 255, 255, 0.01)'
      $type: color
    surfaceEnd:
      $value: 'rgba(0, 0, 0, 0.0)'
      $type: color
    surfaceInset:
      $value: 'rgba(255, 255, 255, 0.02)'
      $type: color
    surfaceTint:
      $value: 'rgba(255, 255, 255, 0.015)'
      $type: color
spacing:
  xs:
    $value: '4px'
    $type: dimension
  sm:
    $value: '8px'
    $type: dimension
  md:
    $value: '16px'
    $type: dimension
  lg:
    $value: '24px'
    $type: dimension
  xl:
    $value: '32px'
    $type: dimension
radii:
  sm:
    $value: '8px'
    $type: dimension
  md:
    $value: '12px'
    $type: dimension
  lg:
    $value: '16px'
    $type: dimension
  full:
    $value: '999px'
    $type: dimension
opacity:
  pressed:
    $value: 0.88
    $type: number
  disabled:
    $value: 0.55
    $type: number
typography:
  fontFamilies:
    primary:
      $value: 'Inter, sans-serif'
      $type: fontFamily
  display:
    fontSize:
      $value: '32px'
      $type: dimension
    lineHeight:
      $value: '36px'
      $type: dimension
    fontWeight:
      $value: 700
      $type: fontWeight
    letterSpacing:
      $value: '-0.6px'
      $type: dimension
  title:
    fontSize:
      $value: '22px'
      $type: dimension
    lineHeight:
      $value: '28px'
      $type: dimension
    fontWeight:
      $value: 600
      $type: fontWeight
    letterSpacing:
      $value: '-0.3px'
      $type: dimension
  sectionTitle:
    fontSize:
      $value: '16px'
      $type: dimension
    lineHeight:
      $value: '22px'
      $type: dimension
    fontWeight:
      $value: 600
      $type: fontWeight
    letterSpacing:
      $value: '-0.1px'
      $type: dimension
  body:
    fontSize:
      $value: '15px'
      $type: dimension
    lineHeight:
      $value: '22px'
      $type: dimension
    fontWeight:
      $value: 400
      $type: fontWeight
  bodySmall:
    fontSize:
      $value: '13px'
      $type: dimension
    lineHeight:
      $value: '20px'
      $type: dimension
    fontWeight:
      $value: 400
      $type: fontWeight
  label:
    fontSize:
      $value: '12px'
      $type: dimension
    lineHeight:
      $value: '18px'
      $type: dimension
    fontWeight:
      $value: 500
      $type: fontWeight
    letterSpacing:
      $value: '0.4px'
      $type: dimension
  caption:
    fontSize:
      $value: '12px'
      $type: dimension
    lineHeight:
      $value: '18px'
      $type: dimension
    fontWeight:
      $value: 400
      $type: fontWeight
  chip:
    fontSize:
      $value: '12px'
      $type: dimension
    lineHeight:
      $value: '16px'
      $type: dimension
    fontWeight:
      $value: 600
      $type: fontWeight
    letterSpacing:
      $value: '0.2px'
      $type: dimension
  badge:
    fontSize:
      $value: '11px'
      $type: dimension
    lineHeight:
      $value: '14px'
      $type: dimension
    fontWeight:
      $value: 600
      $type: fontWeight
    letterSpacing:
      $value: '0.3px'
      $type: dimension
  meta:
    fontSize:
      $value: '12px'
      $type: dimension
    lineHeight:
      $value: '16px'
      $type: dimension
    fontWeight:
      $value: 500
      $type: fontWeight
  button:
    fontSize:
      $value: '14px'
      $type: dimension
    lineHeight:
      $value: '18px'
      $type: dimension
    fontWeight:
      $value: 600
      $type: fontWeight
    letterSpacing:
      $value: '0.1px'
      $type: dimension
---

# Look & Feel

## The Aesthetic

The application utilizes a dark, structural, and "glassy" aesthetic heavily inspired by Linear. It is designed to be highly utilitarian and distraction-free, providing an elegant but dense interface suitable for a high-intensity study environment. There is no light mode; the application lives entirely within deep black and dark gray tones, creating a focused, immersive experience.

## Surfaces and Borders

Interfaces are composed of subtle, opaque dark surfaces (`#08090C` cards over `#030406` backgrounds). Instead of relying on heavy drop shadows or dramatic lighting, depth is established through meticulously crafted borders and transparent white overlays.

- **Borders:** Thin, translucent white strokes (`rgba(255, 255, 255, 0.08)`) separate elements.
- **Glassy Gradients:** Surfaces often utilize extremely subtle top-to-bottom white sheen gradients (starting at `3.5%` opacity and fading to `0%`). This provides a "glassy" tactile feel without the computational heaviness of blurs.
- **Hover States:** Interaction is signaled quietly by lifting the background brightness slightly (to `#0C0D11`) and brightening the border (`rgba(255, 255, 255, 0.18)`), avoiding jarring color shifts.

## Typography

Inter is used exclusively to maintain a strict, unopinionated, and highly legible interface.

- Hierarchy is achieved primarily through font weight, letter spacing, and subtle shifts in text color rather than dramatic size differences.
- High-contrast primary text (`#F2F2F2`) is reserved for titles and active data.
- Secondary (`#A0A0A5`) and muted (`#939396`) grays are heavily relied upon to de-emphasize metadata, timestamps, and secondary actions, reducing cognitive load.
- Tracking (letter spacing) is tightened on larger headings to make them feel cohesive, and slightly loosened on small caps/labels to ensure readability at minute sizes.

## Color Semantics

Color is strictly reserved for meaning and role, rather than decoration. The default state of the app is completely monochromatic.

- **Brand (`#5E6AD2`):** Used sparingly for primary CTAs, active selections, toggles, and focus rings.
- **Capture (`#6D99FF`):** Specifically designates active audio recording, transcript states, or hardware capture moments.
- **Status (Success/Warning/Danger):** Applied to badges, icons, and low-opacity surface backgrounds (e.g., `rgba(63, 185, 80, 0.1)` for success) to highlight streaks, deadlines, or destructive actions without breaking the dark aesthetic.

## Density and Layout

The UI favors a "bento box" or grid-based layout for dashboards and settings, keeping related controls tightly grouped.

- Padding is tight and gap logic is exact. Elements sit close together to maximize the utility of the screen space.
- Scrollbars are minimal and trackless to maintain the clean edge-to-edge feel of the dark panels.
