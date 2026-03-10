# Developer Experience (DX) & Documentation Audit

## 1. Setup Friction
**Current State**: The project is entirely dependent on global installations of Node.js and Expo CLI. There are no containerization tools (Docker), initialization scripts (`setup.sh`), or robust environment variable templates (`.env.example`).
**Gap**: A new developer trying to build this project natively for Android via Detox requires installing the Android SDK, Java, Ruby, and configuring specific environment variables. Without a setup script, this can take a day or more to configure.
**Remediation**:
- Add a `docker-compose.yml` for the backend testing environment if one is ever added.
- Add an `init.sh` or `Makefile` script that automates the installation of Expo, Detox, and checks for the correct Java/Android SDK versions.
- Create a `.env.example` file specifically for the API keys required (`GROQ_API_KEY`, `OPENROUTER_KEY`) so developers know what to stub out.

## 2. API Documentation
**Current State**: Since this is a local-first SQLite React Native application, there are no traditional REST API endpoints (like an Express server). However, the app relies heavily on 3rd party APIs (Groq, OpenRouter, Jina) and custom Native Modules (`AppLauncherModule.kt`).
**Gap**: The Native Module API (`modules/app-launcher/index.ts`) is completely undocumented. If a React developer needs to modify the audio capturing logic or ML Kit face tracking, they have to blindly read Kotlin code.
**Remediation**:
Add JSDoc blocks to the native module exports detailing parameters and return types.

## 3. Code Comments & Business Logic Documentation
**Current State**: The project has incredibly complex business logic spread across `src/services/`.
- `studyPlanner.ts`: Contains a massive scheduling algorithm (`generateStudyPlan`) that calculates FSRS reviews, deep dives, and "catch-up" days. It is completely devoid of JSDoc comments explaining the algorithm's inputs, outputs, or edge cases.
- `fsrsService.ts`: Contains the Free Spaced Repetition Scheduler mapping. Fortunately, it does contain a small inline comment explaining the confidence mapping (`0 = Again, 3 = Easy`), but lacks block-level documentation for how it integrates with the database.
**Gap**: A new maintainer will be terrified to touch the `studyPlanner.ts` file for fear of breaking the core scheduling algorithm.
**Remediation**:
Add strict JSDoc/Docstring coverage for core logic:
```typescript
/**
 * Generates a dynamic, rolling study plan spanning from today to the exam date.
 * Prioritizes topics based on:
 * 1. Spaced Repetition (FSRS) due dates.
 * 2. NEET/INICET weight (High-Yield).
 * 3. Previous mock test failures.
 *
 * @param options - Configuration for mode (e.g. 'exam_crunch', 'balanced')
 * @returns An array of DailyPlans and an analytical summary of feasibility.
 */
export function generateStudyPlan(options?: GeneratePlanOptions) { ... }
```

## 4. Linting and Formatting Tooling
**Current State**: The `package.json` contains `typescript` and `babel-preset-expo`, but completely lacks `eslint`, `prettier`, or `husky` pre-commit hooks.
**Gap**: Without automated formatters, PRs will inevitably contain style arguments, unused variable warnings, and missing imports.
**Remediation**: Add `eslint-config-expo` and a `.prettierrc`. Configure a Husky pre-commit hook to run `lint-staged`.
