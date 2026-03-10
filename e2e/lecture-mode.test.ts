import { by, device, expect, element, waitFor } from 'detox';

describe('Lecture Mode Flow', () => {
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
  }, 180000);

  it('should navigate to Lecture Mode via Tools & Library', async () => {
    // On fresh install, isLowMomentum=true so lecture-mode-btn is inside Tools & Library
    await waitFor(element(by.id('tools-library-header')))
      .toBeVisible()
      .whileElement(by.id('home-scroll'))
      .scroll(300, 'down');

    await element(by.id('tools-library-header')).tap();

    // Find and tap the lecture mode button
    await waitFor(element(by.id('lecture-mode-btn')))
      .toBeVisible()
      .whileElement(by.id('home-scroll'))
      .scroll(200, 'down');

    await element(by.id('lecture-mode-btn')).tap();

    // Use lecture-end-btn as screen load indicator (SafeAreaView testID unreliable in Detox)
    await waitFor(element(by.id('lecture-end-btn')))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('should display Hostage Mode header', async () => {
    // textTransform: 'uppercase' renders as "📺 HOSTAGE MODE"
    await expect(element(by.text('📺 HOSTAGE MODE'))).toBeVisible();
  });

  it('should show the End button with back text', async () => {
    await expect(element(by.id('lecture-end-btn'))).toBeVisible();
    await expect(element(by.text('← End'))).toBeVisible();
  });

  it('should show the lecture timer', async () => {
    await waitFor(element(by.id('lecture-timer')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('should show subject selector on fresh start', async () => {
    // No subject pre-selected — sectionLabel has textTransform: 'uppercase'
    await waitFor(element(by.text('WHAT SUBJECT ARE YOU WATCHING?')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('should end lecture and return to home', async () => {
    // Scroll back up to find the end button
    await waitFor(element(by.id('lecture-end-btn')))
      .toBeVisible()
      .whileElement(by.type('android.widget.ScrollView'))
      .scroll(300, 'up');

    await element(by.id('lecture-end-btn')).tap();

    // confirmStopLecture shows Alert: "Stop lecture?" with "Stop" (destructive) or "Keep watching" (cancel)
    await waitFor(element(by.text('Stop')))
      .toBeVisible()
      .withTimeout(3000);
    await element(by.text('Stop')).tap();

    // Home screen — scroll up to find start-session-btn
    await waitFor(element(by.id('start-session-btn')))
      .toBeVisible()
      .whileElement(by.id('home-scroll'))
      .scroll(300, 'up');
  });
});
