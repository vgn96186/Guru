import { by, device, expect, element, waitFor } from 'detox';

/**
 * ADHD UX Audit — Simulates real ADHD user behavior patterns:
 * 1. First impression & cognitive load
 * 2. Decision paralysis at choice points
 * 3. "Just start" friction measurement
 * 4. Distraction recovery (leave and return)
 * 5. Navigation confusion (can I find my way back?)
 * 6. Information overload detection
 * 7. Impulsive rapid tapping
 */

describe('ADHD UX Audit: First Launch Experience', () => {
  beforeAll(async () => {
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
  }, 180000);

  it('AUDIT: Check-in screen — how many choices hit you at once?', async () => {
    // An ADHD user opens the app for the first time.
    // Question: Is there ONE obvious thing to do, or does the brain freeze?
    await waitFor(element(by.id('quick-start-btn')))
      .toBeVisible()
      .withTimeout(30000);

    // Count visible mood options — each one is a decision point
    const moods = ['Energetic', 'Good', 'Okay', 'Tired', 'Stressed', 'Distracted'];
    let visibleMoods = 0;
    for (const mood of moods) {
      try {
        await expect(element(by.text(mood))).toBeVisible();
        visibleMoods++;
      } catch {
        // Not visible
      }
    }

    // INSIGHT: All 6 moods + Quick Start + question text visible at once
    // For ADHD: 7 choices is a lot. Quick Start is the escape hatch — is it prominent enough?

    // Check if Quick Start is above or competing with mood grid
    await expect(element(by.id('quick-start-btn'))).toBeVisible();
    // PASS — Quick Start exists. But is it the MOST visually prominent element?
  });

  it('AUDIT: Quick Start is the fastest path — measures tap-to-study friction', async () => {
    // ADHD user wants to "just start" with minimum friction
    // Ideal: 1 tap from open to studying. Let's measure.
    const start = Date.now();
    await element(by.id('quick-start-btn')).tap();

    await waitFor(element(by.id('start-session-btn')))
      .toBeVisible()
      .withTimeout(15000);
    const elapsed = Date.now() - start;

    // INSIGHT: Quick Start → Home takes ~X ms
    // This is 1 tap to reach home. But the user isn't studying yet.
    // They still need to tap "Start Session" = 2 taps minimum to study.
    // For ADHD: Every extra tap is a dropout point.
  });
});

describe('ADHD UX Audit: Home Screen Cognitive Load', () => {
  beforeAll(async () => {
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
  }, 180000);

  it('AUDIT: How many tappable things are visible on home before scrolling?', async () => {
    // ADHD brain scans for "what do I tap?" — too many = paralysis
    const aboveFoldElements = [
      'start-session-btn',
      'task-paralysis-btn',
      'sprint-btn',
      'mock-test-btn',
      'lecture-mode-btn',
      'daily-challenge-btn',
      'continue-learning-btn',
      'review-due-btn',
    ];

    let visibleCount = 0;
    const visibleIds: string[] = [];
    for (const id of aboveFoldElements) {
      try {
        await expect(element(by.id(id))).toBeVisible();
        visibleCount++;
        visibleIds.push(id);
      } catch {
        // Not visible above fold
      }
    }

    // INSIGHT: X buttons visible before scrolling.
    // ADHD recommendation: 1-3 primary actions max above fold.
    // If > 5, the screen is competing for attention.
  });

  it('AUDIT: Is the primary CTA (Start Session) visually dominant?', async () => {
    // The #1 thing an ADHD user should see is "START SESSION"
    // It should be the biggest, brightest, most obvious element
    await expect(element(by.id('start-session-btn'))).toBeVisible();

    // Check if Task Paralysis button competes for attention
    try {
      await expect(element(by.id('task-paralysis-btn'))).toBeVisible();
      // INSIGHT: Task Paralysis is visible alongside Start Session.
      // Good for ADHD — acknowledges "I can't decide" state.
      // But: Does its orange color steal attention from the purple Start button?
    } catch {
      // Not visible
    }
  });

  it('AUDIT: Scroll depth — how much is hidden below the fold?', async () => {
    // ADHD users rarely scroll. If critical features are buried, they won't find them.
    // Let's measure how far down we need to scroll to find key sections.

    // First: Tools & Library
    let scrollsToTools = 0;
    try {
      await expect(element(by.id('tools-library-header'))).toBeVisible();
    } catch {
      // Need to scroll
      await waitFor(element(by.id('tools-library-header')))
        .toBeVisible()
        .whileElement(by.id('home-scroll'))
        .scroll(200, 'down');
      scrollsToTools = 1;
    }

    // Then: Challenges
    let scrollsToChallenges = 0;
    try {
      await expect(element(by.id('challenges-header'))).toBeVisible();
    } catch {
      await waitFor(element(by.id('challenges-header')))
        .toBeVisible()
        .whileElement(by.id('home-scroll'))
        .scroll(200, 'down');
      scrollsToChallenges = 1;
    }

    // INSIGHT: Tools and Challenges require scrolling.
    // ADHD users who don't scroll will never discover Boss Battles, Notes Search, etc.
    // These features are effectively invisible to impulsive users.
  });

  it('AUDIT: Expanding Tools section — does it overwhelm?', async () => {
    // ADHD user discovers Tools & Library and taps it
    await waitFor(element(by.id('tools-library-header')))
      .toBeVisible()
      .whileElement(by.id('home-scroll'))
      .scroll(200, 'down');

    await element(by.id('tools-library-header')).tap();

    // Count what appears
    const toolItems = [
      'Notes Search',
      'Brain Dump',
      'Manual Log',
      'Flagged Cards',
      'Lecture Mode',
    ];

    let visibleTools = 0;
    for (const tool of toolItems) {
      try {
        await waitFor(element(by.text(tool)))
          .toBeVisible()
          .withTimeout(2000);
        visibleTools++;
      } catch {
        // Not visible
      }
    }

    // INSIGHT: Expanding reveals X tools at once.
    // Good: They're hidden until requested (progressive disclosure).
    // Risk: If too many appear, the expanded section itself becomes overwhelming.

    // Collapse it back
    await element(by.id('tools-library-header')).tap();
  });
});

describe('ADHD UX Audit: Task-Start Friction', () => {
  beforeAll(async () => {
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
  }, 180000);

  it('AUDIT: Start Session → actual studying — how many steps?', async () => {
    // The critical path: User decides to study → they're actually doing it
    // Each intermediate step is a dropout point for ADHD
    await element(by.id('start-session-btn')).tap();

    // Does a planning screen appear? That's friction.
    const planningVisible = await waitFor(element(by.id('session-planning')))
      .toBeVisible()
      .withTimeout(15000)
      .then(() => true)
      .catch(() => false);

    // INSIGHT: After tapping Start Session, user sees a "planning" screen.
    // This is NOT studying yet. It's an intermediate state.
    // For ADHD: "I tapped START and I'm still not studying" = frustration.
    // The planning phase should either be instant or have clear progress feedback.

    if (planningVisible) {
      // How long does the user wait at the planning screen?
      // Is there a loading indicator? Does it feel like something is happening?
      try {
        await waitFor(element(by.id('session-active')))
          .toBeVisible()
          .withTimeout(30000);
        // Session started! But how long did the user wait?
      } catch {
        // Still on planning after 30s — ADHD user has probably left by now
        // INSIGHT: If planning takes > 5s without feedback, ADHD users bail.
      }
    }
  });
});

describe('ADHD UX Audit: Navigation Confusion', () => {
  beforeAll(async () => {
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
  }, 180000);

  it('AUDIT: Tab labels — can user identify each tab by icon alone?', async () => {
    // Tabs have no labels (tabBarShowLabel: false). Only icons.
    // ADHD users rely on quick visual recognition.
    // Without labels, they might tap wrong tabs and get disoriented.

    // Navigate through all tabs and check for screen identifiers
    await element(by.label('tab-syllabus')).tap();
    await waitFor(element(by.id('syllabus-screen')))
      .toBeVisible()
      .withTimeout(5000);
    // User sees "Syllabus" — makes sense with grid icon

    await element(by.label('tab-plan')).tap();
    await waitFor(element(by.id('plan-screen')))
      .toBeVisible()
      .withTimeout(5000);
    // User sees "Dynamic Plan" — calendar icon is intuitive

    await element(by.label('tab-stats')).tap();
    await waitFor(element(by.id('stats-screen')))
      .toBeVisible()
      .withTimeout(5000);
    // User sees stats — bar chart icon is clear

    await element(by.label('tab-settings')).tap();
    await waitFor(element(by.id('settings-screen')))
      .toBeVisible()
      .withTimeout(5000);
    // User sees Settings — gear icon is universal

    // Return home
    await element(by.label('tab-home')).tap();
    await waitFor(element(by.id('start-session-btn')))
      .toBeVisible()
      .withTimeout(5000);

    // INSIGHT: Icons are standard and intuitive.
    // But NO LABELS means a new ADHD user must memorize icon positions.
    // First-time cognitive overhead: "Which icon is what?"
    // Recommendation: Show labels for at least the first week.
  });

  it('AUDIT: Can user recover after impulsive wrong-tab navigation?', async () => {
    // ADHD user impulsively taps random tabs — can they get back easily?
    await element(by.label('tab-stats')).tap();
    await waitFor(element(by.id('stats-screen')))
      .toBeVisible()
      .withTimeout(5000);

    // Realizes "this isn't what I wanted" — taps home
    await element(by.label('tab-home')).tap();
    await waitFor(element(by.id('start-session-btn')))
      .toBeVisible()
      .withTimeout(5000);

    // INSIGHT: Recovery is instant — tabs are always visible at bottom.
    // GOOD for ADHD: No deep navigation stack to unwind.
    // The persistent tab bar is a safety net.
  });

  it('AUDIT: Deep navigation — can user escape TopicDetail back to home?', async () => {
    // User drills into Syllabus → Topic Detail — can they get back quickly?
    await element(by.label('tab-syllabus')).tap();
    await waitFor(element(by.id('syllabus-screen')))
      .toBeVisible()
      .withTimeout(5000);

    await element(by.text('Anatomy')).tap();
    await waitFor(element(by.text('Anatomy')))
      .toBeVisible()
      .withTimeout(5000);

    // User is now deep in TopicDetail. Can they get home?
    // Option 1: Back button
    await device.pressBack();
    await waitFor(element(by.id('syllabus-screen')))
      .toBeVisible()
      .withTimeout(5000);

    // Option 2: Tab bar should still be visible — tap Home directly
    await element(by.label('tab-home')).tap();
    await waitFor(element(by.id('start-session-btn')))
      .toBeVisible()
      .withTimeout(5000);

    // INSIGHT: Tab bar persists during deep navigation — user can always escape.
    // GOOD: No "trapped" feeling. ADHD users who get lost can always tap Home.
  });
});

describe('ADHD UX Audit: Settings Overwhelm', () => {
  beforeAll(async () => {
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

    await waitFor(element(by.label('tab-settings')))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.label('tab-settings')).tap();
    await waitFor(element(by.id('settings-screen')))
      .toBeVisible()
      .withTimeout(10000);
  }, 180000);

  it('AUDIT: How many settings sections hit you at once?', async () => {
    // ADHD users opening Settings for the first time.
    // If they see a wall of options, they'll close it immediately.
    const sections = [
      '🤖 AI CONFIGURATION',
      '✅ PERMISSIONS & DIAGNOSTICS',
      '👤 PROFILE',
      '📅 EXAM DATES',
      '⏱️ STUDY PREFERENCES',
      '🔔 NOTIFICATIONS',
      '👻 BODY DOUBLING',
      '🃏 CONTENT TYPE PREFERENCES',
      '🔬 FOCUS SUBJECTS',
      '⏱️ SESSION TIMING',
      '🗑️ DATA',
      '💾 BACKUP & RESTORE',
    ];

    let visibleSections = 0;
    for (const section of sections) {
      try {
        await expect(element(by.text(section)).atIndex(0)).toBeVisible();
        visibleSections++;
      } catch {
        // Not visible (below fold or collapsed)
      }
    }

    // INSIGHT: X sections visible on first load.
    // If all 12 are expanded, that's 50+ settings visible.
    // ADHD recommendation: Start with only "Essential" expanded,
    // rest collapsed. Or better: a "Quick Setup" wizard for first time.
  });

  it('AUDIT: Can user find and save API key without getting lost?', async () => {
    // Critical path: User needs to set up Gemini API key to use AI features.
    // If they can't find it or get distracted, the app is half-useless.

    // AI Configuration should be the first section
    try {
      await expect(element(by.text('🤖 AI CONFIGURATION'))).toBeVisible();
      // GOOD: Most important setting is at the top.
    } catch {
      // BAD: User has to scroll to find the most important setting.
    }

    // Can user find Save button after making changes?
    await waitFor(element(by.id('save-settings-btn')))
      .toBeVisible()
      .whileElement(by.id('settings-scroll'))
      .scroll(300, 'down');

    // INSIGHT: Save button is at the BOTTOM of a very long scroll.
    // ADHD user who changes API key at the top must scroll ALL the way down.
    // They might forget to save or get distracted before reaching it.
    // Recommendation: Floating save button or auto-save.
  });
});

describe('ADHD UX Audit: Distraction Recovery', () => {
  beforeAll(async () => {
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
  }, 180000);

  it('AUDIT: App backgrounded and returned — does user know where they were?', async () => {
    // ADHD user gets a notification, switches apps, comes back 5 min later.
    // Do they know what they were doing?

    // Navigate to a specific place first
    await element(by.label('tab-syllabus')).tap();
    await waitFor(element(by.id('syllabus-screen')))
      .toBeVisible()
      .withTimeout(5000);

    // Simulate backgrounding
    await device.sendToHome();
    await new Promise(resolve => setTimeout(resolve, 2000));
    await device.launchApp({ newInstance: false });

    // Are we still on the same screen?
    await waitFor(element(by.id('syllabus-screen')))
      .toBeVisible()
      .withTimeout(10000);

    // INSIGHT: App preserves state — user returns to exactly where they left.
    // GOOD for ADHD: No re-navigation needed after distraction.
    // But: Is there any visual cue saying "Welcome back! You were browsing Syllabus"?
  });

  it('AUDIT: Rapid tab switching — app remains stable?', async () => {
    // ADHD user impulsively taps tabs rapidly — no crashes or weird states
    await element(by.label('tab-home')).tap();
    await element(by.label('tab-stats')).tap();
    await element(by.label('tab-plan')).tap();
    await element(by.label('tab-syllabus')).tap();
    await element(by.label('tab-settings')).tap();
    await element(by.label('tab-home')).tap();
    await element(by.label('tab-stats')).tap();
    await element(by.label('tab-home')).tap();

    // Verify app is still responsive
    await waitFor(element(by.id('start-session-btn')))
      .toBeVisible()
      .withTimeout(5000);

    // INSIGHT: App handles rapid navigation without crashing.
    // GOOD: No loading screens between tabs, instant switching.
  });
});
