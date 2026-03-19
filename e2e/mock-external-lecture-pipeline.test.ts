import { by, device, expect, element, waitFor } from 'detox';

describe('Mock External Lecture Pipeline', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      permissions: { microphone: 'YES' },
      launchArgs: { detoxEnableSynchronization: 0 },
    });

    await waitFor(element(by.id('quick-start-btn')))
      .toBeVisible()
      .withTimeout(30000);
    await element(by.id('quick-start-btn')).tap();
    await waitFor(element(by.id('action-hub-toggle')))
      .toBeVisible()
      .withTimeout(15000);
  }, 180000);

  it('opens Action Hub and shows external launch options', async () => {
    await element(by.id('action-hub-toggle')).tap();
    await expect(element(by.id('action-hub-external-marrow'))).toBeVisible();
  });

  it('can trigger mock external lecture launch and app remains healthy', async () => {
    await element(by.id('action-hub-external-marrow')).tap();

    // Allow browser handoff and recording start window.
    await new Promise((resolve) => setTimeout(resolve, 4000));

    // Relaunch app and verify it still reaches core UI.
    await device.launchApp({
      newInstance: true,
      permissions: { microphone: 'YES' },
      launchArgs: { detoxEnableSynchronization: 0 },
    });
    await waitFor(element(by.id('quick-start-btn')))
      .toBeVisible()
      .withTimeout(30000);
    await element(by.id('quick-start-btn')).tap();
    await waitFor(element(by.id('action-hub-toggle')))
      .toBeVisible()
      .withTimeout(15000);
  });
});
