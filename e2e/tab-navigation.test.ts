import { by, device, expect, element, waitFor } from 'detox';

describe('Tab Navigation', () => {
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

  it('should start on the Home tab', async () => {
    await expect(element(by.id('start-session-btn'))).toBeVisible();
  });

  it('should navigate to Syllabus tab', async () => {
    await element(by.id('tab-syllabus')).tap();

    await waitFor(element(by.id('syllabus-screen')))
      .toBeVisible()
      .withTimeout(10000);
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
