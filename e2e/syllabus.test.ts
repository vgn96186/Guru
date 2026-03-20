import { by, device, expect, element, waitFor } from 'detox';

describe('Syllabus Browsing', () => {
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

    // Navigate to Syllabus tab
    await waitFor(element(by.label('tab-syllabus')))
      .toBeVisible()
      .withTimeout(30000);
    await element(by.label('tab-syllabus')).tap();
    await waitFor(element(by.id('syllabus-screen')))
      .toBeVisible()
      .withTimeout(10000);
  }, 180000);

  it('should display the Syllabus title', async () => {
    await expect(element(by.text('Syllabus'))).toBeVisible();
  });

  it('should show overall coverage percentage', async () => {
    // Text is " covered" (leading space) in its own <Text> node
    await waitFor(element(by.text(' covered')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('should show the Sync Vault button', async () => {
    // Button text includes emoji: 🔄 Sync Vault
    await waitFor(element(by.text('🔄 Sync Vault')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('should display subject cards', async () => {
    // Check for some known NEET-PG subjects
    await expect(element(by.text('Anatomy'))).toBeVisible();
  });

  it('should navigate to topic detail on subject tap', async () => {
    await element(by.text('Anatomy')).tap();

    // Should see topic detail screen with topic list
    await waitFor(element(by.text('Anatomy')))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('should navigate back to syllabus list', async () => {
    await device.pressBack();

    await waitFor(element(by.id('syllabus-screen')))
      .toBeVisible()
      .withTimeout(10000);

    await expect(element(by.text('Syllabus'))).toBeVisible();
  });

  it('should scroll through all subjects', async () => {
    // Scroll down to find more subjects
    await waitFor(element(by.text('Pharmacology')))
      .toBeVisible()
      .whileElement(by.type('com.facebook.react.views.scroll.ReactScrollView'))
      .scroll(300, 'down');
  });
});
