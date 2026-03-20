# Overlay Bubble — Stitch Design Spec

Stitch project: **Guru Overlay Bubble**  
Project ID: `11058632644197702302`

Generated screens (view in [Stitch](https://stitch.google.com) or via Stitch MCP):

| Screen | ID | Description |
|--------|-----|-------------|
| **Floating Timer Collapsed** | `6de32981d9c546c995fc8b90550adfbb` | Circular bubble only: timer + focus ring, no labels. |
| **Floating Timer Expanded** | `e2226f90ef624d25a94d48e3a731c35c` | Bubble + pill: app name "Cerebellum", "Study timer" chip, Pause, Finish. |

---

## Design summary (for native `OverlayService.kt`)

- **Collapsed:** Single circle (~84dp). Dark gradient fill. Colored ring (purple / green / orange / red by focus state). **Center: timer text only** (e.g. `2:34`), no "GURU" or rotating message.
- **Expanded:** Rounded pill **anchored to the right of the bubble** (no gap). Left → right: app name (title case, ellipsize if long) → "Study timer" chip → Pause → Finish. Single row, compact.
- **Theme:** Dark (#0F0F14), Lexend font, roundness ROUND_FULL, accent #7f13ec.

Functionality to keep: timer updates, focus-state ring colors, Pause/Resume toggles recording, Finish ends session and returns to Guru.
