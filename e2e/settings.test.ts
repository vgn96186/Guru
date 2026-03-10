import { by, device, expect, element, waitFor } from 'detox';

describe('Settings Screen', () => {
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

    // Navigate to Settings tab — wait longer for tab bar to render
    await waitFor(element(by.label('tab-settings')))
      .toBeVisible()
      .withTimeout(30000);
    await element(by.label('tab-settings')).tap();
    await waitFor(element(by.id('settings-screen')))
      .toBeVisible()
      .withTimeout(10000);
  }, 180000);

  it('should display the Settings title', async () => {
    await expect(element(by.text('Settings'))).toBeVisible();
  });

  it('should show AI Configuration section', async () => {
    // Section title has emoji and textTransform uppercase
    await waitFor(element(by.text('🤖 AI CONFIGURATION')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('should show Permissions section', async () => {
    await waitFor(element(by.text('✅ PERMISSIONS & DIAGNOSTICS')))
      .toBeVisible()
      .whileElement(by.id('settings-scroll'))
      .scroll(300, 'down');
  });

  it('should show Profile section', async () => {
    await waitFor(element(by.text('👤 PROFILE')))
      .toBeVisible()
      .whileElement(by.id('settings-scroll'))
      .scroll(300, 'down');
  });

  it('should show Study Preferences section', async () => {
    await waitFor(element(by.text('⏱️ STUDY PREFERENCES')))
      .toBeVisible()
      .whileElement(by.id('settings-scroll'))
      .scroll(300, 'down');
  });

  it('should show Notifications section', async () => {
    await waitFor(element(by.text('🔔 NOTIFICATIONS')))
      .toBeVisible()
      .whileElement(by.id('settings-scroll'))
      .scroll(300, 'down');
  });

  it('should show Backup & Restore section', async () => {
    await waitFor(element(by.text('💾 BACKUP & RESTORE')))
      .toBeVisible()
      .whileElement(by.id('settings-scroll'))
      .scroll(300, 'down');
  });

  it('should show Save Settings button', async () => {
    await waitFor(element(by.id('save-settings-btn')))
      .toBeVisible()
      .whileElement(by.id('settings-scroll'))
      .scroll(300, 'down');

    await expect(element(by.text('Save Settings'))).toBeVisible();
  });
});
