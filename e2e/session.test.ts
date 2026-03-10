import { by, device, expect, element, waitFor } from 'detox';

describe('Study Session Flow', () => {
  beforeAll(async () => {
    // First cold boot may time out due to splash screen animations.
    // Retry once — the app process will be warm on the second attempt.
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

    // Pass check-in via Quick Start
    await waitFor(element(by.id('quick-start-btn')))
      .toBeVisible()
      .withTimeout(30000);
    await element(by.id('quick-start-btn')).tap();

    // Wait for home screen
    await waitFor(element(by.id('start-session-btn')))
      .toBeVisible()
      .withTimeout(15000);
  }, 180000);

  it('should tap Start Session and enter session screen', async () => {
    await element(by.id('start-session-btn')).tap();

    // Session enters planning phase — verify we left home screen
    await waitFor(element(by.id('session-planning')))
      .toBeVisible()
      .withTimeout(15000);
  });

  it('should show the planning screen', async () => {
    // Planning screen should show while AI generates the agenda
    await waitFor(element(by.id('session-planning')))
      .toBeVisible()
      .withTimeout(10000);
  });
});
