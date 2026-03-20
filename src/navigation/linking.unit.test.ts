import linking from './linking';

describe('linking', () => {
  it('should have the correct prefixes', () => {
    expect(linking.prefixes).toContain('guru-study://');
  });

  it('should have the correct screen configurations', () => {
    const screens = linking.config?.screens;
    expect(screens).toBeDefined();
    if (screens) {
      expect(screens.CheckIn).toBe('check-in');
      expect(screens.BrainDumpReview).toBe('brain-dump-review');
      expect(screens.PomodoroQuiz).toBe('pomodoro');
      
      // Check nested tabs
      const tabs: any = screens.Tabs;
      expect(tabs).toBeDefined();
      expect(tabs.screens.HomeTab.screens.Home).toBe('home');
      expect(tabs.screens.MenuTab.screens.Settings).toBe('menu/settings');
    }
  });
});
