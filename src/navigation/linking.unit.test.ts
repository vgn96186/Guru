import linking from './linking';

describe('linking', () => {
  it('should have the correct prefixes', () => {
    expect(linking.prefixes).toContain('guru-study://');
  });

  it('should have the correct screen configurations', () => {
    const screens = linking.config?.screens;
    expect(screens).toBeDefined();

    expect(screens!.CheckIn).toBe('check-in');
    expect(screens!.BrainDumpReview).toBe('brain-dump-review');
    expect(screens!.PomodoroQuiz).toBe('pomodoro');

    expect((screens!.GuruChatModal as { screens: Record<string, string> }).screens.GuruChat).toBe(
      'guru-chat',
    );
    expect((screens!.SettingsModal as { screens: Record<string, string> }).screens.Settings).toBe(
      'settings',
    );

    const tabs = screens!.Tabs as { screens: Record<string, unknown> };
    expect(tabs).toBeDefined();
    expect((tabs.screens.HomeTab as { screens: Record<string, string> }).screens.Home).toBe('home');
    expect((tabs.screens.HomeTab as { screens: Record<string, string> }).screens.StudyPlan).toBe(
      'study-plan',
    );
    expect(
      (tabs.screens.TreeTab as { screens: Record<string, string> }).screens.KnowledgeTree,
    ).toBe('tree');
    expect((tabs.screens.TreeTab as { screens: Record<string, string> }).screens.Syllabus).toBe(
      'tree/syllabus',
    );
    expect((tabs.screens.VaultTab as { screens: Record<string, string> }).screens.VaultHome).toBe(
      'vault',
    );
    expect(tabs.screens.StatsTab as string).toBe('stats');
    expect((screens!.SettingsModal as { screens: Record<string, string> }).screens.DeviceLink).toBe(
      'settings/device-link',
    );
  });
});
