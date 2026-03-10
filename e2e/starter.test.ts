import { by, device, expect, element, waitFor } from 'detox';

describe('Guru App', () => {
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

  it('should show check-in screen on first launch', async () => {
    await expect(element(by.id('quick-start-btn'))).toBeVisible();
  });

  it('should navigate to home via Quick Start', async () => {
    await element(by.id('quick-start-btn')).tap();

    // Scroll down to find TOOLS & LIBRARY
    await waitFor(element(by.id('tools-library-header')))
      .toBeVisible()
      .whileElement(by.type('android.widget.ScrollView'))
      .scroll(300, 'down');

    await expect(element(by.id('tools-library-header'))).toBeVisible();
  });
});
