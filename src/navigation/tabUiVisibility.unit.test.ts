import { getDeepestFocusedRouteName, isActionHubAllowedForRoute } from './tabUiVisibility';

describe('tabUiVisibility', () => {
  it('returns the nested active route name for deep tab stack screens', () => {
    expect(
      getDeepestFocusedRouteName({
        index: 0,
        routes: [
          {
            name: 'HomeTab',
            state: {
              index: 1,
              routes: [{ name: 'Home' }, { name: 'Session' }],
            },
          },
        ],
      }),
    ).toBe('Session');
  });

  it('blocks the action hub only on immersive study routes', () => {
    expect(isActionHubAllowedForRoute('Home')).toBe(true);
    expect(isActionHubAllowedForRoute('MenuHome')).toBe(true);
    expect(isActionHubAllowedForRoute('StudyPlan')).toBe(true);
    expect(isActionHubAllowedForRoute('TranscriptVault')).toBe(true);
    expect(isActionHubAllowedForRoute('Session')).toBe(false);
    expect(isActionHubAllowedForRoute('LectureMode')).toBe(false);
  });
});
