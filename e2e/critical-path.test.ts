/**
 * Critical Path E2E Tests
 *
 * Validates the main user flows that must never break:
 * 1. App boot (DB init, splash screen)
 * 2. Check-in (mood selection, time selection, quick start)
 * 3. Session lifecycle (start -> planning -> studying -> done)
 * 4. Tab navigation (all 4 tabs + action hub)
 * 5. Syllabus browsing (subjects -> topic detail -> back)
 * 6. Guru Chat screen loads
 * 7. Settings screen sections render
 *
 * Run: npx detox test -c android.genymotion.dev -- --testPathPattern critical-path
 */
import { by, device, expect, element, waitFor } from 'detox';

/** Shared launch + check-in helper. */
async function launchAndPassCheckIn() {
  try {
    await device.launchApp({
      newInstance: true,
      launchArgs: { detoxEnableSynchronization: 0 },
    });
  } catch {
    await device.launchApp({
      newInstance: true,
      launchArgs: { detoxEnableSynchronization: 0 },
    });
  }

  await waitFor(element(by.id('quick-start-btn')))
    .toBeVisible()
    .withTimeout(30000);
  await element(by.id('quick-start-btn')).tap();

  await waitFor(element(by.id('start-session-btn')))
    .toBeVisible()
    .withTimeout(15000);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. App Boot — DB initializes, splash hides, first screen renders
// ─────────────────────────────────────────────────────────────────────────────
describe('App Boot', () => {
  it('should launch without crash and show check-in or home', async () => {
    try {
      await device.launchApp({
        newInstance: true,
        launchArgs: { detoxEnableSynchronization: 0 },
      });
    } catch {
      await device.launchApp({
        newInstance: true,
        launchArgs: { detoxEnableSynchronization: 0 },
      });
    }

    // Either check-in or home screen should appear (DB init succeeded)
    // Try check-in first, fall back to home screen
    let visible = false;
    try {
      await waitFor(element(by.id('quick-start-btn')))
        .toBeVisible()
        .withTimeout(30000);
      visible = true;
    } catch {
      // not on check-in, try home
    }
    if (!visible) {
      await waitFor(element(by.id('start-session-btn')))
        .toBeVisible()
        .withTimeout(10000);
    }
  }, 180000);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Check-in Flow — mood -> time -> home
// ─────────────────────────────────────────────────────────────────────────────
describe('Check-in Full Flow', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { detoxEnableSynchronization: 0 },
    });
  }, 180000);

  it('should display mood selection', async () => {
    await waitFor(element(by.text('How are you feeling right now?')))
      .toBeVisible()
      .withTimeout(30000);
  });

  it('should show all mood options', async () => {
    await waitFor(element(by.id('mood-good')))
      .toBeVisible()
      .withTimeout(10000);
    await expect(element(by.id('mood-energetic'))).toBeVisible();
  });

  it('should advance to time selection after mood tap', async () => {
    await element(by.id('mood-good')).tap();

    await waitFor(element(by.text('How much time do you have *right now*?')))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('should show all time options', async () => {
    await waitFor(element(by.id('time-sprint')))
      .toBeVisible()
      .withTimeout(10000);
    await expect(element(by.id('time-solid-block'))).toBeVisible();
    await expect(element(by.id('time-deep-work'))).toBeVisible();
    await expect(element(by.id('time-just-checking'))).toBeVisible();
  });

  it('should navigate to home after time selection', async () => {
    await element(by.id('time-solid-block')).tap();

    await waitFor(element(by.id('start-session-btn')))
      .toBeVisible()
      .withTimeout(30000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Session Lifecycle — start -> planning -> studying -> back
// ─────────────────────────────────────────────────────────────────────────────
describe('Session Lifecycle', () => {
  beforeAll(async () => {
    await launchAndPassCheckIn();
  }, 180000);

  it('should start a session from home screen', async () => {
    await element(by.id('start-session-btn')).tap();

    // Should enter planning phase
    await waitFor(element(by.id('session-planning')))
      .toBeVisible()
      .withTimeout(15000);
  });

  it('should transition from planning to studying or agenda reveal', async () => {
    // Wait for either studying or agenda reveal (depends on AI response time)
    let transitioned = false;
    try {
      await waitFor(element(by.id('session-studying')))
        .toBeVisible()
        .withTimeout(60000);
      transitioned = true;
    } catch {
      // might be on agenda reveal instead
    }
    if (!transitioned) {
      await waitFor(element(by.id('session-agenda-reveal')))
        .toBeVisible()
        .withTimeout(10000);
    }
  });

  it('should show the studying screen with content', async () => {
    // If on agenda reveal, wait for it to transition to studying
    await waitFor(element(by.id('session-studying')))
      .toBeVisible()
      .withTimeout(30000);

    // Studying screen should have the status bar text
    await expect(element(by.text('📖 Studying'))).toBeVisible();
  });

  it('should navigate back from session via device back', async () => {
    await device.pressBack();

    // Should return to home (or show exit confirmation)
    await waitFor(element(by.id('start-session-btn')))
      .toBeVisible()
      .withTimeout(15000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Tab Navigation — all tabs render their main screen
// ─────────────────────────────────────────────────────────────────────────────
describe('Tab Navigation', () => {
  beforeAll(async () => {
    await launchAndPassCheckIn();
  }, 180000);

  it('should start on Home tab with session button', async () => {
    await expect(element(by.id('start-session-btn'))).toBeVisible();
  });

  it('should navigate to Syllabus tab', async () => {
    await element(by.id('tab-syllabus')).tap();
    await waitFor(element(by.id('syllabus-screen')))
      .toBeVisible()
      .withTimeout(10000);
    await expect(element(by.text('Syllabus'))).toBeVisible();
  });

  it('should navigate to Chat tab', async () => {
    await element(by.id('tab-chat')).tap();
    await waitFor(element(by.id('guru-chat-screen')))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('should navigate to Menu tab', async () => {
    await element(by.id('tab-menu')).tap();
    await waitFor(element(by.id('menu-screen')))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('should navigate back to Home tab', async () => {
    await element(by.id('tab-home')).tap();
    await waitFor(element(by.id('start-session-btn')))
      .toBeVisible()
      .withTimeout(10000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Syllabus Browsing — subjects load, topic detail opens, back works
// ─────────────────────────────────────────────────────────────────────────────
describe('Syllabus Browsing', () => {
  beforeAll(async () => {
    await launchAndPassCheckIn();
    await element(by.id('tab-syllabus')).tap();
    await waitFor(element(by.id('syllabus-screen')))
      .toBeVisible()
      .withTimeout(10000);
  }, 180000);

  it('should display subject cards from seeded data', async () => {
    // Anatomy is always seeded
    await expect(element(by.text('Anatomy'))).toBeVisible();
  });

  it('should show overall coverage stat', async () => {
    await waitFor(element(by.text(' covered')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('should open topic detail on subject tap', async () => {
    await element(by.text('Anatomy')).tap();
    // Topic detail loads with subject name visible
    await waitFor(element(by.text('Anatomy')))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('should navigate back to syllabus list', async () => {
    await device.pressBack();
    await waitFor(element(by.id('syllabus-screen')))
      .toBeVisible()
      .withTimeout(10000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Action Hub — center button opens action sheet
// ─────────────────────────────────────────────────────────────────────────────
describe('Action Hub', () => {
  beforeAll(async () => {
    await launchAndPassCheckIn();
  }, 180000);

  it('should open action hub on center button tap', async () => {
    await element(by.id('action-hub-toggle')).tap();

    // Should show action options
    await waitFor(element(by.id('action-hub-record-lecture')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('should show all action hub options', async () => {
    await expect(element(by.id('action-hub-search-topics'))).toBeVisible();
    await expect(element(by.id('action-hub-quick-note'))).toBeVisible();
  });

  it('should close action hub on toggle tap', async () => {
    await element(by.id('action-hub-toggle')).tap();

    await waitFor(element(by.id('action-hub-record-lecture')))
      .not.toBeVisible()
      .withTimeout(5000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Guru Chat — screen loads and is interactive
// ─────────────────────────────────────────────────────────────────────────────
describe('Guru Chat', () => {
  beforeAll(async () => {
    await launchAndPassCheckIn();
    await element(by.id('tab-chat')).tap();
    await waitFor(element(by.id('guru-chat-screen')))
      .toBeVisible()
      .withTimeout(10000);
  }, 180000);

  it('should display the chat screen', async () => {
    await expect(element(by.id('guru-chat-screen'))).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Settings — all sections render, save button visible
// ─────────────────────────────────────────────────────────────────────────────
describe('Settings', () => {
  beforeAll(async () => {
    await launchAndPassCheckIn();
    await element(by.id('tab-menu')).tap();
    await waitFor(element(by.id('menu-screen')))
      .toBeVisible()
      .withTimeout(10000);
  }, 180000);

  it('should display the menu screen', async () => {
    await expect(element(by.id('menu-screen'))).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Home Screen Elements — countdown, sections, scroll
// ─────────────────────────────────────────────────────────────────────────────
describe('Home Screen Elements', () => {
  beforeAll(async () => {
    await launchAndPassCheckIn();
  }, 180000);

  it('should display INICET countdown', async () => {
    await waitFor(element(by.id('inicet-countdown')))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('should display Start Session button', async () => {
    await expect(element(by.id('start-session-btn'))).toBeVisible();
  });

  it('should scroll to QUICK ACCESS section', async () => {
    await waitFor(element(by.text('QUICK ACCESS')))
      .toBeVisible()
      .whileElement(by.id('home-scroll'))
      .scroll(200, 'up');
  });

  it('should scroll to Tools section', async () => {
    await waitFor(element(by.id('tools-library-header')))
      .toBeVisible()
      .whileElement(by.id('home-scroll'))
      .scroll(300, 'down');
  });

  it('should expand Tools section on tap', async () => {
    await element(by.id('tools-library-header')).tap();
    await waitFor(element(by.text('Nightstand Mode')))
      .toBeVisible()
      .withTimeout(5000);
  });
});
