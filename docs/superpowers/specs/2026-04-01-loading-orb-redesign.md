# Loading Orb Redesign — Layered Glass Orb

## Goal

Upgrade LoadingOrb visual quality to feel premium/3D ("glass orb") and fix centering issues on screens where the install-model banner is present.

## Visual Layer Stack (bottom to top)

### 1. Ambient Glow

- Large soft circle behind everything, ~2x orb diameter
- Primary color at ~0.15 opacity
- Implemented via View with large shadowRadius or blurred SVG circle
- Breathes with core (scale 0.95-1.05, synced at half intensity)

### 2. Ripple Rings (3)

- Same stagger timing: 0ms / 1200ms / 2400ms delays
- Same expansion scales: 3.0 / 4.5 / 6.5
- Change from solid filled circles to **thin stroke rings**: `borderWidth: 2, backgroundColor: 'transparent', borderColor: primary`

### 3. Core Sphere (180px)

Two overlapping SVG radial gradients:

- **Color gradient:** primaryLight (#8B85FF) center -> primaryDark (#4A43CC) edge
- **Lighting gradient:** white highlight at top-left (cx=30%, cy=30%) fading to transparent, dark rim at bottom-right

### 4. Specular Highlight

- Small white ellipse (~40x25px) near top-left of orb
- Opacity ~0.5
- Subtle 2px translateY animation synced to core breathing
- Simulates light reflection on a 3D glass surface

## Centering Fixes

- SessionScreen `contentArea` style: add `justifyContent: 'center'` and `alignItems: 'center'`

## Text Changes

- Keep current message rotation system unchanged
- Reduce text opacity pulse: 1 -> 0.85 (was 1 -> 0.7)
- Remove text scale animation entirely (was 1 -> 1.05)

## Animation Timing (unchanged)

- Core breathing: 1800ms ease-in-out
- Ring ripples: 3500ms (rings 1-2), 4000ms (ring 3), ease-out-quad
- Specular highlight: synced to core, 2px translateY
- Ambient glow: synced to core, half intensity

## Dependencies

No new dependencies. Uses existing:

- react-native-reanimated
- react-native-svg

## Files Changed

- `src/components/LoadingOrb.tsx` — full visual rebuild
- `src/screens/SessionScreen.tsx` — centering fix on contentArea style
