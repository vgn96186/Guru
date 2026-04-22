# ContentCard.tsx Refactoring Plan

**Goal:** Break down the monolithic `ContentCard.tsx` (3,003 lines, 650-line `StyleSheet`) into modular, maintainable components. This satisfies the "Refactoring of large monolithic components" goal in `CODEBASE_AUDIT_REPORT.md` and prepares the components for the upcoming NativeWind migration (Phase 4).

## Architecture

The `ContentCard` feature will be moved from a single screen file to a dedicated module in `src/components/content-card/`.

```text
src/components/content-card/
├── ContentCard.tsx                # Main entry point and factory (switch statement)
├── context/
│   └── buildGuruContext.ts        # Helper to generate AI context
├── primitives/
│   ├── TopicImage.tsx             # Shared topic image loader
│   ├── QuestionImage.tsx          # Shared quiz image with lightbox
│   ├── ConceptChip.tsx            # Inline medical concept explainer
│   ├── ConfidenceRating.tsx       # Shared bottom rating row
│   └── DeepExplanationBlock.tsx   # Shared AI deep dive block
├── cards/
│   ├── KeyPointsCard.tsx
│   ├── MustKnowCard.tsx
│   ├── QuizCard.tsx
│   ├── StoryCard.tsx
│   ├── MnemonicCard.tsx
│   ├── TeachBackCard.tsx
│   ├── ErrorHuntCard.tsx
│   ├── DetectiveCard.tsx
│   ├── ManualReviewCard.tsx
│   ├── SocraticCard.tsx
│   └── FlashcardCard.tsx
└── styles/
    └── contentCardStyles.ts       # Shared styles (temporary until NativeWind migration)
```

## Migration Strategy

### Step 1: Create Shared Primitives & Utilities
- Extract `stripImageFraming`, `isQuizImageHttpUrl`, `compactLines` to a utilities file or keep them in the `cards/` where they are most relevant.
- Extract `TopicImage` and `QuestionImage` to `primitives/`.
- Extract `ConfidenceRating` to `primitives/`.
- Move the 650-line `StyleSheet.create` into `styles/contentCardStyles.ts` and export it as `s`. This ensures we don't have to rewrite imports for every single style right away.

### Step 2: Extract Card Components
- Move each card component (`KeyPointsCard`, `MustKnowCard`, `QuizCard`, etc.) into its own file in `cards/`.
- Each file will import the shared `styles/contentCardStyles.ts` and the required types from `src/types/index.ts`.

### Step 3: Refactor Main `ContentCard.tsx`
- Replace the massive switch statement and inline components in `src/screens/ContentCard.tsx` with a clean file that just imports the sub-components and renders them based on `content.type`.
- Keep `ContentCardWithBoundary` and the `GuruChatOverlay` logic in the main file.
- Move the refactored main file to `src/components/content-card/ContentCard.tsx`.
- Update `src/screens/SessionScreen.tsx` and other importers to point to the new location.

## NativeWind Readiness
By isolating each card into its own file, the subsequent NativeWind migration (Phase 4) can be parallelized. Instead of converting 650 lines of styles in one go, each card file will manage its own `className` conversions independently.
