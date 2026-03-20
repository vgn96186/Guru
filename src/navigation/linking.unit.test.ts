import linking from './linking';

describe('linking', () => {
  it('should have the correct prefixes', () => {
    expect(linking.prefixes).toContain('guru-study://');
  });

  it('should have the correct screen configurations', () => {
    const screens = linking.config?.screens;
    expect(screens).toBeDefined();

    // Non-conditional assertions using non-null assertion (screens is checked above)
    expect(screens!.CheckIn).toBe('check-in');
    expect(screens!.BrainDumpReview).toBe('brain-dump-review');
    expect(screens!.PomodoroQuiz).toBe('pomodoro');

    // Check nested tabs
    const tabs = screens!.Tabs as { screens: Record<string, unknown> };
    expect(tabs).toBeDefined();
    expect((tabs.screens.HomeTab as { screens: Record<string, string> }).screens.Home).toBe('home');
    expect((tabs.screens.MenuTab as { screens: Record<string, string> }).screens.Settings).toBe(
      'menu/settings',
    );
  });
});
