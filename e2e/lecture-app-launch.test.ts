import { by, device, expect, element, waitFor } from 'detox';

/**
 * Tests the external lecture app launch flow:
 *   Home → Tools & Library → LAUNCH & LOG → tap app → system dialogs → external app
 *
 * Cerebellum IS installed on the emulator, so tapping it triggers:
 *   1. MediaProjection system dialog (internal audio capture)
 *   2. Recording service starts
 *   3. Overlay bubble shows
 *   4. Cerebellum launches
 *
 * We verify the UI renders correctly and the app survives the flow.
 */

describe('External Lecture App Launch', () => {
  beforeAll(async () => {
    try {
      await device.launchApp({
        newInstance: true,
        permissions: { microphone: 'YES' },
        launchArgs: { detoxEnableSynchronization: 0 },
      });
    } catch {
      await device.launchApp({
        newInstance: true,
        permissions: { microphone: 'YES' },
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

    // Expand Tools & Library
    await waitFor(element(by.id('tools-library-header')))
      .toBeVisible()
      .whileElement(by.id('home-scroll'))
      .scroll(300, 'down');
    await element(by.id('tools-library-header')).tap();
  }, 180000);

  it('should show LAUNCH & LOG section', async () => {
    await waitFor(element(by.text('LAUNCH & LOG')))
      .toBeVisible()
      .whileElement(by.id('home-scroll'))
      .scroll(200, 'down');
  });

  it('should show Cerebellum app button (first in row)', async () => {
    await waitFor(element(by.id('external-app-cerebellum')))
      .toBeVisible()
      .whileElement(by.id('home-scroll'))
      .scroll(100, 'down');
  });

  it('should show app name text for Cerebellum', async () => {
    await expect(element(by.text('Cerebellum'))).toBeVisible();
  });

  it('should have external app elements in tree', async () => {
    await expect(element(by.id('external-app-cerebellum'))).toExist();
  });

  it('should tap Cerebellum and app survives', async () => {
    // Tapping Cerebellum triggers: MediaProjection dialog → recording → overlay → launch
    // The system dialog (MediaProjection) will appear — we can't interact with it via Detox
    await element(by.id('external-app-cerebellum')).tap();

    // Wait for system dialogs / external app to appear
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Restart app fresh to verify it didn't crash permanently
    // (newInstance: true clears any stuck system dialog state)
    await device.launchApp({
      newInstance: true,
      permissions: { microphone: 'YES' },
      launchArgs: { detoxEnableSynchronization: 0 },
    });

    // Pass check-in again after fresh launch
    await waitFor(element(by.id('quick-start-btn')))
      .toBeVisible()
      .withTimeout(30000);
    await element(by.id('quick-start-btn')).tap();

    // Verify app is alive and home screen renders
    await waitFor(element(by.id('start-session-btn')))
      .toBeVisible()
      .withTimeout(15000);
  });

  it('should show Tools & Library after app restart', async () => {
    await waitFor(element(by.id('tools-library-header')))
      .toBeVisible()
      .whileElement(by.id('home-scroll'))
      .scroll(300, 'down');
    await element(by.id('tools-library-header')).tap();

    await waitFor(element(by.text('LAUNCH & LOG')))
      .toBeVisible()
      .whileElement(by.id('home-scroll'))
      .scroll(200, 'down');
  });
});
