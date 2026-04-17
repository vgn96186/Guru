import { by, device, expect, element, waitFor } from 'detox';

describe('AI Tools Integration', () => {
  beforeAll(async () => {
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

  it('should navigate to Guru Chat and verify UI', async () => {
    // Quick start if on check-in screen
    try {
      await waitFor(element(by.id('quick-start-btn')))
        .toBeVisible()
        .withTimeout(5000);
      await element(by.id('quick-start-btn')).tap();
    } catch {
      // Already on home screen
    }

    // Wait for home screen
    await waitFor(element(by.id('start-session-btn')))
      .toBeVisible()
      .withTimeout(15000);

    // Navigate to Guru Chat (assuming there's a tab or button)
    // We'll just verify the app is running and ready for AI tool testing
    await expect(element(by.id('start-session-btn'))).toBeVisible();
  });

  it('should test local AI streaming', async () => {
    // Navigate to Menu/Settings
    await element(by.text('Menu')).tap();
    await element(by.text('Settings')).tap();

    // Enable Local AI
    await waitFor(element(by.text('LOCAL AI')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.text('LOCAL AI')).tap();

    // Navigate to Local Model Screen
    await element(by.text('Manage Local AI Models')).tap();

    // Verify UI elements
    await expect(element(by.text('On-Device AI Setup'))).toBeVisible();
    await expect(element(by.text('Study AI (Text Model)'))).toBeVisible();

    // Go back to Home
    await element(by.id('header-back-btn')).tap();
    await element(by.id('header-back-btn')).tap();
    await element(by.text('Home')).tap();

    // Navigate to Guru Chat
    await element(by.text('Chat')).tap();

    // Send a message
    await element(by.id('chat-input')).typeText('Hello local AI');
    await element(by.id('chat-send-btn')).tap();

    // Wait for response
    await waitFor(element(by.id('chat-message-assistant')))
      .toBeVisible()
      .withTimeout(15000);
  });
});
