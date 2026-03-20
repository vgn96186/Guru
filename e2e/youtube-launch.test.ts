import { by, device, expect, element } from 'detox';

describe('YouTube launch flow', () => {
  beforeAll(async () => {
    // First cold boot may time out due to splash screen animations.
    // Retry once — the app process will be warm on the second attempt.
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
  }, 180000);

  it('should pass check-in via Quick Start', async () => {
    // The app opens on CheckInScreen if not checked in today
    await expect(element(by.id('quick-start-btn'))).toBeVisible();
    await element(by.id('quick-start-btn')).tap();

    // Wait for navigation to Tabs/Home
    await waitFor(element(by.text('TOOLS & LIBRARY')))
      .toBeVisible()
      .whileElement(by.type('com.facebook.react.views.scroll.ReactScrollView'))
      .scroll(300, 'down');
  });

  it('should expand Tools & Library section', async () => {
    await element(by.id('tools-library-header')).tap();
    await expect(element(by.text('LAUNCH & LOG'))).toBeVisible();
  });

  it('should show YouTube button in external tools', async () => {
    await waitFor(element(by.id('external-app-youtube')))
      .toBeVisible()
      .whileElement(by.type('com.facebook.react.views.scroll.ReactScrollView'))
      .scroll(100, 'down');

    await expect(element(by.id('external-app-youtube'))).toBeVisible();
  });

  it('should tap YouTube and not crash', async () => {
    await element(by.id('external-app-youtube')).tap();

    // After tapping YouTube, either:
    // 1. NewPipe/YouTube opens (app goes to background) — verify no crash on return
    // 2. An alert appears if YouTube is not installed
    // Wait briefly for the action to complete
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Bring our app back to foreground
    await device.launchApp({ newInstance: false });

    // App should still be alive — verify we're still on home or a return sheet appeared
    await waitFor(
      element(by.text('TOOLS & LIBRARY'))
    )
      .toBeVisible()
      .withTimeout(10000);
  });
});
