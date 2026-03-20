# Guru UI Overhaul Design

Date: 2026-03-21
Branch: `v2.0`
Status: Approved in design discussion, pending implementation planning

## Summary

Guru should be redesigned as a dark-first, premium, low-friction study system for an ADHD medical student preparing for NEET-PG/INICET. The current product has a large feature surface, but the redesigned experience should center the app around four top-level destinations and one adaptive intelligence layer:

- `Home` as a simple launchpad
- `Tree` as the long-term progression surface
- `Vault` as the study artifact layer
- `Stats` as the performance and pattern-visibility layer
- `GuruBrain` as the adaptive planning and intervention layer behind all of them

The redesign should remain on the `v2.0` branch and must not touch `main`.

## Goals

- Reduce decision friction, especially on bad executive-dysfunction days.
- Make the app feel like it understands real study inconsistency rather than assuming perfect adherence.
- Turn the syllabus into an atomic, visually motivating, long-term progression surface.
- Make the lecture recording and transcription pipeline feel like a signature experience, not a utility.
- Preserve powerful tools while preventing the home screen from becoming a dashboard.
- Keep the UI dark-first, clean, and premium, with a digital living-tree identity instead of literal organic decoration.

## Non-Goals

- Do not redesign the product around a web-style admin dashboard.
- Do not make the tree the default first interaction on Home.
- Do not reorganize the user around source apps as the primary structure.
- Do not merge artifacts, analytics, chat, and planning into one overloaded destination.
- Do not touch `main` during implementation of this work.

## User Model

The target user studies across three main external sources:

- `Cerebellum / BTR` for condensed, high-yield learning
- `DBMCI` for long-form, comprehensive lectures
- `Marrow` for question practice, PYQs, and model exams

The app must plan `by topic`, not by source. Source apps are content layers applied to the same topic graph:

- `BTR` is the current acceleration layer and short-term priority
- `DBMCI` is the depth layer that follows
- `Marrow` is the question and performance layer that should be used heavily every day

The user is prone to missed days and even missed weeks due to ADHD-related executive dysfunction and task paralysis. The system must recover dynamically instead of behaving as if a broken streak equals failure.

## Top-Level Information Architecture

The redesigned shell should use four top-level destinations:

1. `Home`
2. `Tree`
3. `Vault`
4. `Stats`

Supporting persistent surfaces:

- `Settings` as a corner action instead of a top-level tab
- `Guru chat` as a floating assistive layer available almost everywhere except `Home` by default, with a settings toggle to enable it on `Home`

### Direction Chosen

The chosen shell direction is `Launchpad + Tree`.

- `Home` stays simple and launch-oriented
- `Tree` becomes the primary strategic destination
- `Vault` owns transcripts, notes, summaries, and captured study artifacts
- `Stats` owns analytics and long-term visibility

## Home Design

### Home Purpose

`Home` is a launchpad, not a dashboard. It should help the user begin quickly, especially on low-energy days.

### Above-the-Fold Content

The default home screen should show:

- exam countdown
- primary `Start`
- secondary `Lecture capture`
- collapsed `Today's path`
- `Settings` icon in a corner

### Expandable Sections

Home should include two separate collapsible sections:

- `Today's path`
- `Tools`

These should remain separate rather than being mixed into one drawer.

### Tools Section

The expandable `Tools` section should expose icon shortcuts for:

- `Mind maps`
- `Audio transcription`
- `MCQs`
- `Find from clues`
- `Random topic`
- `Note from transcript`

This section should:

- be collapsed by default
- expand smoothly
- feel utility-first and fast
- preserve a low-friction default Home state

## Adaptive Start Flow

`Start` is the anti-inertia gateway to the app.

### Start Behavior

When the user taps `Start`, GuruBrain should:

- preselect the best next move for the user based on current state and history
- allow the user to override that suggestion in one tap

The chosen pattern is `smart default with override`, not a blind instant launch and not a multi-step chooser.

### Bad-Day Expectations

On bad days, valid rescue paths include:

- revision of a previous topic through high-yield points
- guided recall through Guru chat
- mind-map exploration
- simple-to-complex MCQs
- clue-based recall

### Minimum Successful Day

A very small session should still count as meaningful progress if it advances revision, recall, or visible mastery in a bounded way.

## GuruBrain

GuruBrain is the adaptive planning and intervention layer behind the product.

### Responsibilities

- read current topic progress from the atomic topic graph
- understand source coverage and current source priority
- build a flexible topic-first daily plan
- update priorities after missed days or weeks
- choose the best next step for the `Start` flow
- adapt prompts, rescue flows, and emphasis based on the user’s current state

### Planning Model

The plan must be:

- topic-first
- flexible
- dynamic after missed periods
- explicit enough to tell the user exactly what to study next

The system should prioritize `BTR` now while preparing for later `DBMCI` depth plus more aggressive `Marrow` question load.

### User State Model

The state model should be `hybrid`.

- explicit state input via a fast slider
- quiet inference from usage history, missed days, lecture activity, session starts, and timing context

The current heavier check-in should be replaced or reframed around a fast energy/paralysis slider with a range from highly paralysed to energetic and active.

## Digital Knowledge Tree

### Purpose

The `Tree` destination is the long-term progression surface for the entire exam.

The tree should be:

- digital, not nature-themed
- zoomable
- motivating
- readable on a 10-inch tablet
- robust after gaps in study

### Visual Model

The tree should feel like a real digital tree:

- trunk at the base
- major branches for subjects or major topic clusters
- smaller branches and twigs for deeper and increasingly atomic topics
- visible hierarchy from whole-exam view to atomic topic leaves

### Zoom Behavior

- `Tablet`: open near the last active area while still showing broader exam context
- `Phone`: default to a zoomed active-area view

The tablet experience is the primary home of the full tree.

### Mastery Encoding

The user wants a visible `10-level` mastery ladder.

Mastery interpretation:

- `Levels 1-5`: content progression
- `Levels 6-10`: performance and retention progression

Mastery should be explicitly shown to the user, not hidden behind internal scoring.

The tree should encode `mastery` through color. Separate indicators should be used for:

- urgency
- revision debt
- weak retention

These should not be blended into the same color channel as mastery.

### Topic Relationship Model

Under the hood, the syllabus should behave as a topic graph with atomic nodes. User-facing presentation should remain tree-first by default.

### Connection Mode

The default tree view should stay calm and tree-like.

An optional `connections mode` should reveal cross-topic overlap and associations for:

- mind mapping
- clue-based question solving
- understanding concept overlap across subjects and apps

### Source Visibility

The user wants both subtle source visibility and an explicit overlay mode.

Normal tree mode should allow:

- small `BTR`, `DBMCI`, and `Marrow` badges on branches or twigs

Optional overlay mode should allow:

- stronger source-layer visualization when the user wants to inspect coverage by app

The main mental model must remain topic-first.

## Lecture Pipeline

The external lecture recording and transcription flow is a signature product experience.

### Flow

1. User launches lecture capture from Home
2. Overlay appears during recording
3. Recording and transcription complete
4. Guru generates summary, notes, extracted topics, and plan updates
5. Post-lecture screen shows instant payoff and next actions

### Post-Lecture Screen

The selected shape is `hybrid`:

- summary, notes, extracted topics, and visible reward at the top
- plan changes, linked follow-up tasks, and questions below

### Overlay Widget

The overlay should feel like a `study companion`, not a plain utility bubble and not a playful creature.

It should include:

- constant `Guru` avatar
- visible timer / pomodoro awareness
- body-doubling presence
- subtle “alive” feel without distraction

### Lecture-Aware Consolidation

During or after lecture capture, the system should be able to:

- generate lecture-relevant prompts
- ask consolidation questions at pomodoro breaks
- help the user retain content instead of only archiving it

## Guru Avatar

The `Guru` avatar should remain a constant identity across the app.

It can express context or state subtly, but it should not become a different character across screens. This keeps the app’s identity stable.

## Vault

`Vault` is the artifact and data destination.

### Default Open Mode

The chosen Vault model is `hybrid`:

- recent study artifacts at the top
- durable topic-based organization underneath

### Vault Contents

Vault should focus on:

- lecture transcripts
- generated notes
- summaries
- derived study outputs
- durable backups and stored artifacts

Vault should not be overloaded with analytics.

## Stats

`Stats` is a top-level destination.

It should focus on:

- visible progress through the 10-level mastery model
- source coverage across `BTR`, `DBMCI`, and `Marrow`
- question volume and question performance
- revision debt
- longer-term patterns, including recovery after missed periods

The emotional goal of Stats is visibility and momentum, not guilt.

## Floating Guru Chat

Guru chat should be a floating assistive layer rather than a top-level tab.

### Availability

- available across the app by default
- excluded from `Home` by default
- optionally enabled on `Home` via settings

### Jobs

- guided recall
- rescue-mode help
- high-yield revision
- clue-based questioning
- contextual assistance while studying topics, notes, or lecture outputs

## Visual System

### Chosen Direction

- dark-first
- clean and premium
- digital and alive, but not organic or nature-styled

The tree is a digital visual metaphor, not an excuse to make the entire product look earthy or fantasy-themed.

### Implications

- Home should remain visually quiet
- the tree can carry more identity and motion
- the avatar and lecture companion can add life through subtle motion and state
- the overall interface should still feel product-grade and disciplined

## Data and System Design Implications

This redesign implies clearer product boundaries around several existing areas in the repo:

- app shell and top-level navigation
- home launchpad and adaptive start flow
- topic graph / digital tree rendering and progression model
- GuruBrain planning and state interpretation
- lecture companion overlay and post-lecture conversion
- vault artifact organization
- stats-specific aggregation and presentation
- floating chat orchestration

The existing app already contains:

- topic and progress data
- lecture and transcription flows
- plan and agenda concepts
- notes and transcript storage
- overlays and study-enforcement features

Implementation should reuse these foundations where possible and reshape them behind the new shell instead of rebuilding the entire product from scratch.

## Error Handling and Resilience Requirements

Implementation planning must preserve sane behavior for:

- lecture capture failures
- transcription failures or empty lecture output
- partial generated results
- missed-day or missed-week plan recovery
- missing or weak user-state signals
- topic or source coverage gaps

The redesign should not assume that every lecture results in perfect topic extraction or that the user follows the plan consistently.

## Testing Implications

Implementation planning should include:

- unit coverage for new planning and mastery logic
- unit coverage for tree-related mapping and overlay state
- unit coverage for bad-day `Start` routing logic
- unit coverage for lecture post-processing to plan conversion
- UI validation for Home launch behavior
- navigation tests for the 4-destination shell
- existing repository verification via current lint, unit, and Detox-critical flows where relevant

## Open Decisions Intentionally Left for Planning

These items are intentionally deferred to planning and implementation design, not left ambiguous:

- exact visual component shapes and final polished styling
- exact schema evolution for 10-level mastery storage
- exact rendering technology for the digital tree on phone and tablet
- exact overlay animation details
- exact statistics layouts and charts
- exact Vault search and filtering UX

These are implementation-planning questions, not product-direction gaps.

## Final Design Statement

Guru should become a dark, premium, adaptive study operating system with a simple launchpad on the surface and a deep digital knowledge tree underneath. It should help the user begin quickly on bad days, stay immersed during long lecture sessions, understand the whole syllabus visually over time, and feel supported by a stable Guru companion and a genuinely adaptive GuruBrain.
