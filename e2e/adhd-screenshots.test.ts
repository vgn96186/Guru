import { by, device, expect, element, waitFor } from 'detox';

/**
 * Takes screenshots at every ADHD-critical decision point.
 */
describe('ADHD Screenshots: Decision Points', () => {
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

  it('01 — First thing user sees (check-in)', async () => {
    await waitFor(element(by.id('quick-start-btn')))
      .toBeVisible()
      .withTimeout(30000);
    await device.takeScreenshot('01-checkin-first-impression');
  });

  it('02 — After selecting a mood', async () => {
    await element(by.text('Okay')).tap();
    await device.takeScreenshot('02-checkin-time-selection');
  });

  it('03 — Home screen first impression', async () => {
    // Go back and use Quick Start for clean home entry
    await device.launchApp({ newInstance: true, launchArgs: { detoxEnableSynchronization: 0 } });
    await waitFor(element(by.id('quick-start-btn')))
      .toBeVisible()
      .withTimeout(30000);
    await element(by.id('quick-start-btn')).tap();
    await waitFor(element(by.id('start-session-btn')))
      .toBeVisible()
      .withTimeout(15000);
    await device.takeScreenshot('03-home-first-impression');
  });

  it('04 — Home screen after scrolling down', async () => {
    await waitFor(element(by.id('tools-library-header')))
      .toBeVisible()
      .whileElement(by.id('home-scroll'))
      .scroll(200, 'down');
    await device.takeScreenshot('04-home-scrolled-tools');
  });

  it('05 — Tools expanded', async () => {
    await element(by.id('tools-library-header')).tap();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await device.takeScreenshot('05-home-tools-expanded');
  });

  it('06 — Challenges expanded', async () => {
    await element(by.id('tools-library-header')).tap(); // collapse tools
    await waitFor(element(by.id('challenges-header')))
      .toBeVisible()
      .whileElement(by.id('home-scroll'))
      .scroll(200, 'down');
    await element(by.id('challenges-header')).tap();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await device.takeScreenshot('06-home-challenges-expanded');
  });

  it('07 — Session planning screen', async () => {
    // Scroll back to top and start session
    await element(by.label('tab-home')).tap();
    await waitFor(element(by.id('start-session-btn')))
      .toBeVisible()
      .withTimeout(5000);
    await element(by.id('start-session-btn')).tap();
    await waitFor(element(by.id('session-planning')))
      .toBeVisible()
      .withTimeout(15000);
    await device.takeScreenshot('07-session-planning');
  });

  it('08 — Syllabus screen', async () => {
    await device.pressBack();
    await waitFor(element(by.id('start-session-btn')))
      .toBeVisible()
      .withTimeout(10000);
    await element(by.label('tab-syllabus')).tap();
    await waitFor(element(by.id('syllabus-screen')))
      .toBeVisible()
      .withTimeout(5000);
    await device.takeScreenshot('08-syllabus-overview');
  });

  it('09 — Topic detail', async () => {
    await element(by.text('Anatomy')).tap();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await device.takeScreenshot('09-topic-detail-anatomy');
  });

  it('10 — Study Plan screen', async () => {
    await device.pressBack();
    await element(by.label('tab-plan')).tap();
    await waitFor(element(by.id('plan-screen')))
      .toBeVisible()
      .withTimeout(5000);
    await device.takeScreenshot('10-study-plan');
  });

  it('11 — Stats screen', async () => {
    await element(by.label('tab-stats')).tap();
    await waitFor(element(by.id('stats-screen')))
      .toBeVisible()
      .withTimeout(5000);
    await device.takeScreenshot('11-stats-overview');
  });

  it('12 — Settings screen first impression', async () => {
    await element(by.label('tab-settings')).tap();
    await waitFor(element(by.id('settings-screen')))
      .toBeVisible()
      .withTimeout(5000);
    await device.takeScreenshot('12-settings-first-impression');
  });

  it('13 — Settings scrolled to middle', async () => {
    await waitFor(element(by.text('🔔 NOTIFICATIONS')))
      .toBeVisible()
      .whileElement(by.id('settings-scroll'))
      .scroll(300, 'down');
    await device.takeScreenshot('13-settings-middle');
  });

  it('14 — Settings scrolled to bottom', async () => {
    await waitFor(element(by.id('save-settings-btn')))
      .toBeVisible()
      .whileElement(by.id('settings-scroll'))
      .scroll(300, 'down');
    await device.takeScreenshot('14-settings-bottom-save');
  });
});
