import { by, device, expect, element, waitFor } from 'detox';

describe('Check-in Flow', () => {
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
  }, 180000);

  it('should display the check-in screen with mood question', async () => {
    await waitFor(element(by.text('How are you feeling right now?')))
      .toBeVisible()
      .withTimeout(30000);
  });

  it('should show Quick Start button', async () => {
    await waitFor(element(by.id('quick-start-btn')))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('should show all mood options', async () => {
    await waitFor(element(by.id('mood-good')))
      .toBeVisible()
      .withTimeout(10000);
    await expect(element(by.id('mood-energetic'))).toBeVisible();
  });

  it('should transition to time selection after choosing a mood', async () => {
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

  it('should navigate to home screen after selecting time', async () => {
    await element(by.id('time-solid-block')).tap();

    await waitFor(element(by.id('start-session-btn')))
      .toBeVisible()
      .withTimeout(30000);
  });
});

describe('Check-in Quick Start', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { detoxEnableSynchronization: 0 },
    });
  });

  it('should skip check-in via Quick Start and land on home', async () => {
    await waitFor(element(by.id('quick-start-btn')))
      .toBeVisible()
      .withTimeout(30000);

    await element(by.id('quick-start-btn')).tap();

    await waitFor(element(by.id('start-session-btn')))
      .toBeVisible()
      .withTimeout(30000);
  });
});
