import { by, device, expect, element, waitFor } from 'detox';

/**
 * E2E Test: Stressed Medical Student — 25-min Pomodoro for Anatomy
 *
 * Scenario: A stressed NEET-PG student opens Guru, checks in as "stressed",
 * selects a Sprint time block, and starts a study session focused on Anatomy.
 *
 * NOTE: The app's session planner caps stressed-mood sessions at 20 minutes
 * (see sessionPlanner.ts → getSessionLength). To achieve a true 25-minute
 * Pomodoro, the student would need to use a non-stressed mood or pass
 * forcedMinutes via a deep link. The test documents this behaviour.
 *
 * Pre-requisites (set via DB or Settings UI before running):
 *   - preferred_session_length = 25
 *   - focus_subject_ids = [1]  (Anatomy)
 *
 * The test is written for offline/no-AI mode — the session will hit the
 * "AI Unavailable" fallback and use "Manual Review (Offline)".
 */

describe('Stressed Student — Anatomy Pomodoro Session', () => {
  beforeAll(async () => {
    // Cold boot with synchronisation disabled (React Native animations
    // keep the bridge busy and trip Detox's idle detector).
    try {
      await device.launchApp({
        newInstance: true,
        launchArgs: { detoxEnableSynchronization: 0 },
      });
    } catch {
      // Retry on first-launch splash timeout
      await device.launchApp({
        newInstance: true,
        launchArgs: { detoxEnableSynchronization: 0 },
      });
    }
  }, 180000);

  // ── Step 1: Check-in screen ──────────────────────────────────────────

  it('should show the check-in mood question', async () => {
    await waitFor(element(by.text('How are you feeling right now?')))
      .toBeVisible()
      .withTimeout(30000);
  });

  it('should display the Stressed mood option', async () => {
    await waitFor(element(by.id('mood-stressed')))
      .toBeVisible()
      .withTimeout(10000);
  });

  // ── Step 2: Select "Stressed" mood ───────────────────────────────────

  it('should transition to time selection after choosing Stressed', async () => {
    await element(by.id('mood-stressed')).tap();

    // The fade-out / fade-in animation takes ~500ms
    await waitFor(element(by.text('How much time do you have *right now*?')))
      .toBeVisible()
      .withTimeout(10000);
  });

  // ── Step 3: Select Sprint (15-20 min) time block ─────────────────────

  it('should show all time options', async () => {
    await waitFor(element(by.id('time-sprint')))
      .toBeVisible()
      .withTimeout(10000);
    await expect(element(by.id('time-solid-block'))).toBeVisible();
    await expect(element(by.id('time-deep-work'))).toBeVisible();
    await expect(element(by.id('time-just-checking'))).toBeVisible();
  });

  it('should navigate to Home after selecting Sprint', async () => {
    await element(by.id('time-sprint')).tap();

    // After check-in, app replaces with Tabs → Home screen
    await waitFor(element(by.id('start-session-btn')))
      .toBeVisible()
      .withTimeout(30000);
  });

  // ── Step 4: Start a session from Home ────────────────────────────────

  it('should tap Start Session and enter the session', async () => {
    await element(by.id('start-session-btn')).tap();

    // Without an AI backend the planner will fail quickly.
    // Expect either the planning spinner or the AI error screen.
    // Give the app time to attempt planning and surface the fallback.
    try {
      await waitFor(element(by.text('AI Unavailable')))
        .toBeVisible()
        .withTimeout(20000);
    } catch {
      await waitFor(element(by.id('session-studying')))
        .toBeVisible()
        .withTimeout(20000);
    }
  });

  // ── Step 5: Handle AI Unavailable → Manual Review ────────────────────

  it('should offer Manual Review (Offline) fallback', async () => {
    // If AI is unavailable, tap the offline fallback
    try {
      await expect(element(by.text('AI Unavailable'))).toBeVisible();
      await element(by.text('Manual Review (Offline)')).tap();

      // Should transition to the studying screen
      await waitFor(element(by.id('session-studying')))
        .toBeVisible()
        .withTimeout(15000);
    } catch {
      // AI was available (unlikely without keys) — already studying
      await expect(element(by.id('session-studying'))).toBeVisible();
    }
  });

  // ── Step 6: Verify we're studying an Anatomy topic ───────────────────

  it('should show an Anatomy topic (ANAT badge)', async () => {
    await waitFor(element(by.text('ANAT')))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('should display the Studying phase badge', async () => {
    await expect(element(by.text('📖 Studying'))).toBeVisible();
  });

  it('should show topic progress indicator', async () => {
    // e.g. "Topic 1/1" or "Topic 1/3"
    await waitFor(element(by.text(/^Topic \d+\/\d+$/)))
      .toBeVisible()
      .withTimeout(5000);
  });

  // ── Step 7: Verify session menu is accessible ────────────────────────

  it('should open the session menu', async () => {
    await element(by.id('session-menu-btn')).tap();

    await waitFor(element(by.text('End Session')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('should close the menu by tapping backdrop', async () => {
    // Tap outside the menu to dismiss
    await element(by.id('session-studying')).tap();
  });

  // ── Step 8: End the session ──────────────────────────────────────────

  it('should end the session via menu', async () => {
    await element(by.id('session-menu-btn')).tap();
    await waitFor(element(by.id('end-session-btn')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id('end-session-btn')).tap();

    // Should land on session-done screen
    await waitFor(element(by.id('session-done')))
      .toBeVisible()
      .withTimeout(15000);
  });

  it('should navigate back to Home', async () => {
    await element(by.id('back-to-home-btn')).tap();

    await waitFor(element(by.id('start-session-btn')))
      .toBeVisible()
      .withTimeout(15000);
  });
});
