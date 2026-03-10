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
    await element(by.label('tab-syllabus')).tap();

    await waitFor(element(by.id('syllabus-screen')))
      .toBeVisible()
      .withTimeout(10000);

    await expect(element(by.text('Syllabus'))).toBeVisible();
  });

  it('should navigate to Plan tab', async () => {
    await element(by.label('tab-plan')).tap();

    await waitFor(element(by.id('plan-screen')))
      .toBeVisible()
      .withTimeout(10000);

    await expect(element(by.text('Dynamic Plan'))).toBeVisible();
  });

  it('should navigate to Stats tab', async () => {
    await element(by.label('tab-stats')).tap();

    await waitFor(element(by.id('stats-screen')))
      .toBeVisible()
      .withTimeout(10000);

    await expect(element(by.text('Exam Readiness'))).toBeVisible();
  });

  it('should navigate to Settings tab', async () => {
    await element(by.label('tab-settings')).tap();

    await waitFor(element(by.id('settings-screen')))
      .toBeVisible()
      .withTimeout(10000);

    await expect(element(by.text('Settings'))).toBeVisible();
  });

  it('should navigate back to Home tab', async () => {
    await element(by.label('tab-home')).tap();

    await waitFor(element(by.id('start-session-btn')))
      .toBeVisible()
      .withTimeout(10000);
  });
});
