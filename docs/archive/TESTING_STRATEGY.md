# Testing & CI/CD Strategy Audit

## Phase 1: Testing Reconnaissance

- **Test Frameworks**: The project uses Detox and Maestro (`.yaml` files) for End-to-End (E2E) testing. Jest is configured but appears to be exclusively running the Detox E2E tests (`e2e/*.test.ts`).
- **Current Coverage**:
  - The E2E coverage is impressively thorough for core user flows, including `check_in.yaml`, `lecture_mode.yaml`, `start_session.yaml`, and native module testing (`lecture-app-launch.test.ts`).
  - **Gap**: There are absolutely zero Unit Tests or Integration Tests. All business logic in `src/services/` (like `studyPlanner.ts`, `aiService.ts`, `transcriptionService.ts`) and all database queries in `src/db/queries/` are untested outside of the slow, brittle E2E layer.
- **CI/CD Pipeline**:
  - There is **no CI/CD pipeline** configured. No `.github/workflows`, no GitLab CI, no Bitbucket pipelines. All E2E tests must be run locally by the developer.

## Phase 2: Gap Analysis & Missing Tests

### Top 5 Critical Missing Unit/Integration Tests

1. **FSRS Scheduling Logic (`src/services/fsrsService.ts`)**:
   - Spaced repetition is the core retention engine. If the `mapConfidenceToRating` or date math is wrong, students will fail their exams. This needs rigorous unit testing with specific mock dates.
2. **Study Planner Algorithm (`src/services/studyPlanner.ts`)**:
   - The dynamic generation of `DailyPlan` based on available minutes, high-yield weightings, and resource modes (BTR, DBMCI) requires deterministic unit tests to ensure students aren't given impossible schedules.
3. **Database Progress Mutations (`src/db/queries/progress.ts`)**:
   - `addXp()` handles leveling logic and `checkinToday()` manages streaks. These must be tested against an in-memory SQLite database to prevent streak wipes or leveling bugs.
4. **AI Output Validation (`src/services/aiService.ts`)**:
   - The `generateJSONWithRouting` heavily relies on LLMs outputting correct JSON schemas. A unit test should mock the API response with broken JSON to ensure `extractBalancedJson` and Zod parsing fallback gracefully without crashing the app.
5. **Transcription Chunking (`src/services/transcriptionService.ts`)**:
   - The base64 concatenation and chunking logic for large audio files requires unit testing to prevent memory leaks and corrupted WAV headers.

### Implementation Example (Jest Unit Test for FSRS):

```typescript
// __tests__/services/fsrsService.test.ts
import { updateTopicFsrs } from '../../src/services/fsrsService';
import { Rating } from 'ts-fsrs';

describe('FSRS Service', () => {
  it('correctly schedules the next review for an easy rating', () => {
    const mockProgress = { timesStudied: 0, status: 'unseen' };
    const result = updateTopicFsrs(mockProgress, 3); // Confidence 3 (Easy/Good)

    expect(result.status).toBe('reviewed');
    expect(new Date(result.nextReviewDate).getTime()).toBeGreaterThan(Date.now());
  });
});
```

## Phase 3: CI/CD Pipeline Optimization

Currently, there is no pipeline. To ensure safe deployments, a robust GitHub Actions workflow should be implemented.

**Concrete Improvements for the Pipeline:**

1. **Parallel Execution**: Run Jest Unit tests and Detox E2E tests in separate parallel jobs to speed up the pipeline.
2. **Caching**: Utilize `actions/cache` for `node_modules` and `~/.gradle/caches` to drastically reduce build times for the Detox Android build.
3. **Linting & Type Checking**: Add a job that runs `tsc --noEmit` and `eslint` before attempting to run tests. Failing early saves CI minutes.
4. **EAS Build Integration**: Automate the creation of Expo Application Services (EAS) preview builds on PRs.

### Example CI/CD Configuration (.github/workflows/ci.yml)

```yaml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run tsc --noEmit
      # Run fast unit tests (to be added)
      - run: npm run test:unit
```
