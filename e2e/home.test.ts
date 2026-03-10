import { by, device, expect, element, waitFor } from 'detox';

describe('Home Screen', () => {
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

  it('should display the INICET countdown', async () => {
    // The countdown text includes emoji + number, use testID instead
    await waitFor(element(by.id('inicet-countdown')))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('should display the Start Session button', async () => {
    await expect(element(by.id('start-session-btn'))).toBeVisible();
  });

  it('should show Task Paralysis button', async () => {
    await expect(element(by.id('task-paralysis-btn'))).toBeVisible();
  });

  it('should show Tools & Library section header', async () => {
    await waitFor(element(by.id('tools-library-header')))
      .toBeVisible()
      .whileElement(by.id('home-scroll'))
      .scroll(300, 'down');

    await expect(element(by.text('TOOLS & LIBRARY'))).toBeVisible();
  });

  it('should expand Tools & Library on tap', async () => {
    await element(by.id('tools-library-header')).tap();

    // Tools section expands — verify collapsed chevron changes to ▲
    await waitFor(element(by.text('▲')))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('should show CHALLENGES section', async () => {
    // Collapse tools first
    await element(by.id('tools-library-header')).tap();

    await waitFor(element(by.id('challenges-header')))
      .toBeVisible()
      .whileElement(by.id('home-scroll'))
      .scroll(200, 'down');

    await expect(element(by.text('CHALLENGES'))).toBeVisible();
  });

  it('should expand Challenges on tap', async () => {
    await element(by.id('challenges-header')).tap();

    await waitFor(element(by.text('BOSS BATTLES')))
      .toBeVisible()
      .withTimeout(15000);
  });
});
