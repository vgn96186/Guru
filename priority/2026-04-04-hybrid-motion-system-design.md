# Hybrid Motion System — Expressive Navigation and In-Screen Animation

## Goal

Make page switches feel smooth, crisp, and intentional without reintroducing lag. The app should feel expressive, but motion must stay controlled enough to survive heavy screen data loads on Android.

The target feel is:

- page transitions that read as movement through spaces, not abrupt swaps
- in-screen reveals that stage content in a clear order
- interaction feedback that feels premium, not bouncy or noisy
- a single shared motion language across Home, Syllabus, and Guru Chat first

## Recommended Approach

Use a hybrid motion system:

- keep navigator-level transitions lightweight and directional
- add screen-level Reanimated entry motion for the incoming screen shell
- stagger the first-priority sections after the shell lands
- delay decorative loops until entry motion is complete

This avoids the two failure modes already seen in the app:

1. relying only on navigator animation, which feels generic
2. stacking multiple unrelated animations during focus-time data work, which causes jank

## Motion Architecture

### Layer 1: Navigator Motion

Tabs and stacks should provide only the spatial handoff, not the full choreography.

- Bottom tabs: keep `animation: 'none'` for consistency and to avoid JS-driven tab scene animation
- Native stacks: use a consistent directional push for detail flows
- Root modal routes: keep their current behavior unless they participate in the main app motion language

The screen shell, not the tab navigator, should supply the expressive feel for the main app tabs.

### Layer 2: Screen Shell Motion

Each major screen gets a root wrapper that animates on entry and, when appropriate, subtly settles on focus.

This shell should:

- start slightly translated on the X axis
- fade from a low starting opacity
- settle with a quick spring/eased timing
- never compete with navigator transitions

This layer is the main source of “crisp premium” feel.

### Layer 3: Section Reveal Motion

Once the screen shell has landed, high-priority blocks reveal in sequence.

Order:

- Home: header, hero CTA, stats, then agenda/cards
- Syllabus: header/search, hero progress, then subject cards
- Guru Chat: header, message list, then composer/tooling
- Stats and Study Plan later follow the same rule

Reveals should be short and tight:

- section enter delay between siblings: ~40–70ms
- per-section duration: ~140–220ms
- no long fades

### Layer 4: Component Interaction Motion

Cards, chips, buttons, and rows should use one consistent press response.

- slight scale down on press
- fast release
- optional tiny opacity dip
- no heavy bounce

This is already partly present in some components; the fix is to standardize it rather than invent new one-off behavior.

## Motion Tokens

Create a shared motion preset module instead of embedding ad hoc values in each screen.

Suggested presets:

```ts
screenEnter;
screenSettle;
sectionEnterPrimary;
sectionEnterSecondary;
cardPressIn;
cardPressOut;
listStaggerStep;
decorativeIdleDelay;
```

Suggested timing direction:

- screen enter: 220–280ms
- primary section reveal: 160–220ms
- secondary reveal: 140–180ms
- stagger step: 45–60ms
- press in: 70–100ms
- press out: 120–180ms

Exact numbers can be tuned after first implementation, but they must come from the shared preset file.

## Required Behavioral Rules

### Rule 1: No Competing First-Beat Motion

During the first beat of a page switch, only one thing should dominate:

- the screen shell motion

Not allowed during that first beat:

- shimmer overlays
- repeated pulse loops
- multiple nested fades
- focus-triggered state changes that restyle large parts of the screen

### Rule 2: Decorative Motion Starts Late

Decorative loops such as pulses, breathing glows, and shimmer effects must start only after initial entry finishes.

Examples:

- Home countdown pulse
- Home streak flame pulse
- Guru Chat typing/ambient loops

These should begin after a small delay or only after an `isEntryComplete` state flips.

### Rule 3: UI-Thread Animation Only for Motion

Anything visible in the transition path must be driven by Reanimated/UI thread when possible.

Navigator focus effects, DB reads, and state hydration can still happen in JS, but they must not drive visible frame-by-frame motion.

### Rule 4: Focus-Time Data Work Waits

If a screen reloads data on focus, that work must happen after interactions and should be throttled when possible.

This is especially important for:

- Home
- Syllabus
- Guru Chat

### Rule 5: Reduced Motion Must Be Supported

If reduced motion is enabled at the OS or app level, the system must degrade gracefully instead of simply disabling screen usability cues.

Reduced-motion behavior:

- keep directional continuity, but shorten duration
- remove stagger chains
- remove decorative idle loops
- keep tap feedback minimal and immediate
- use opacity/very short translate transitions only where needed for clarity

The expressive motion system must never become an accessibility regression.

### Rule 6: Tab Re-Entry Needs Explicit Policy

Because tabs remain mounted with `lazy` and `freezeOnBlur`, re-entry behavior must be explicit.

- first mount of a major tab: full screen-shell animation + section reveal
- quick return to an already-mounted tab: no full replay
- tab regain focus: allow only a subtle settle/focus cue if needed
- content reload alone must not retrigger the whole entrance sequence

This prevents the app from feeling flashy-but-annoying during real navigation.

### Rule 7: Lists Only Animate Above the Fold

Large data sets must not receive full staggered reveal treatment.

Apply stagger only to:

- static top sections
- first visible cards/rows above the fold
- first visible message block in chat if needed

Do not animate full subject lists, long message histories, or large FlatList datasets item by item on initial load.

This is especially important for:

- Syllabus subject cards
- Guru Chat history
- later vault or note list screens

### Rule 8: Animated and Reanimated Ownership Must Be Clear

The rollout must define which system owns which class of motion during transition.

- Reanimated owns screen-shell motion, section reveals, and new shared motion presets
- existing React Native `Animated` effects may temporarily remain for legacy component-local behaviors
- where an existing `Animated` effect overlaps with new shared motion, it should be softened, delayed, or replaced
- avoid mixed ownership of the same visible transition path

The target end state is not “rewrite every animation immediately.” The target end state is one coherent system without overlapping motion responsibility.

## Screen Priorities

### Phase 1

- Home
- Syllabus
- Guru Chat

These are the user’s main navigation loop and must share the same motion language first.

### Phase 2

- Stats
- Study Plan
- Topic Detail

### Phase 3

- Flashcards
- Review
- Notes/Media vault screens

## File-Level Design

### New Shared Motion Utilities

Add a shared module for motion tokens and wrappers, for example:

- `src/motion/presets.ts`
- `src/motion/ScreenMotion.tsx`
- `src/motion/StaggeredEntrance.tsx`

Responsibilities:

- expose canonical timing/spring presets
- provide a reusable screen-shell wrapper
- provide staggered reveal helpers for section blocks

### Existing Components to Rework

- `src/components/PageTransition.tsx`
  currently too generic and not clearly integrated with screen structure
- `src/screens/HomeScreen.tsx`
  needs staged entry and delayed decorative loops
- `src/screens/SyllabusScreen.tsx`
  needs screen shell + card reveal sequencing
- `src/screens/GuruChatScreen.tsx`
  needs shell motion + delayed thread/composer reveal

### Animation Trigger Policy

Shared screen wrappers should accept explicit trigger modes rather than relying on mount alone.

Suggested trigger modes:

```ts
'first-mount';
'focus-settle';
'manual';
```

Usage direction:

- Home, Syllabus, Guru Chat: `first-mount` full reveal, `focus-settle` only on later tab revisits
- stack detail screens: `manual` or stack-driven, depending on navigator motion already present

This keeps mounted tabs from replaying full choreography every time they regain focus.

### Navigation Configuration

- keep `src/navigation/tabNavigatorOptions.ts` as the source of tab performance settings
- stack screens that use screen-shell animation should avoid redundant competing navigator animation
- where stack navigation already provides directional motion, the shell animation should be softer

## Verification Strategy

### Functional

- tab switch from Home to Syllabus feels smooth
- tab switch from Home to Guru Chat feels smooth
- reverse direction also feels smooth
- stack push into Topic Detail still feels deliberate, not doubled

### Performance

- no visible dropped-frame hitch when entering Home, Syllabus, or Guru Chat from tabs
- no strong flicker from delayed data hydration
- no repeated focus reload jitter when quickly switching tabs back and forth

### Testing

- keep Jest single-threaded via existing `--runInBand`
- add unit tests for shared motion preset exports where helpful
- avoid snapshot-heavy animation tests; prefer logic/config tests

## Rollout Plan

1. Build shared motion presets and wrappers
2. Integrate them into Home, Syllabus, and Guru Chat
3. Delay or soften decorative loops that compete with entry motion
4. Tune stack/detail transitions so they do not double-animate
5. Extend to Stats, Study Plan, and Topic Detail

## Risks

- double animation if both navigator and screen shell move too much
- decorative loops reintroducing jank after entry
- over-staggering content so the UI feels slow rather than crisp
- per-screen custom motion diverging from the shared system
- forgetting reduced-motion fallback and creating accessibility debt
- animating long lists instead of only visible priority content
- partial migration causing `Animated` and Reanimated to fight over the same motion path

## Success Criteria

The app feels animated in a premium way, but switching between Home, Syllabus, and Guru Chat no longer feels heavy or delayed. Motion should read as one coherent system instead of separate effects pasted onto each screen.
