import { shouldShowGuruChatSkeleton } from './guruChatLoadingState';

describe('guruChatLoadingState', () => {
  it('keeps the skeleton visible while either hydration phase is pending', () => {
    expect(shouldShowGuruChatSkeleton({ isHydratingThread: true, isHydratingHistory: false })).toBe(
      true,
    );
    expect(shouldShowGuruChatSkeleton({ isHydratingThread: false, isHydratingHistory: true })).toBe(
      true,
    );
    expect(
      shouldShowGuruChatSkeleton({ isHydratingThread: false, isHydratingHistory: false }),
    ).toBe(false);
  });
});
