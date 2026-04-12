import { renderHook } from '@testing-library/react-native';
import { useFaceTracking } from './useFaceTracking';

/**
 * useFaceTracking.ts Characterization Tests
 *
 * 1. Understand: This hook is currently a stub. It returns a static 'focused' state
 *    and undefined for the frameProcessor because vision-camera-face-detector
 *    is currently incompatible.
 *
 * 2. Characterize: Verify that it returns 'focused' and undefined.
 *
 * 3. Edge Cases: Since it's a stub, there aren't many edge cases, but we can
 *    verify it handles missing options.
 */

describe('useFaceTracking', () => {
  it('returns "focused" state and undefined frameProcessor by default', () => {
    const { result } = renderHook(() => useFaceTracking());

    expect(result.current.focusState).toBe('focused');
    expect(result.current.frameProcessor).toBeUndefined();
  });

  it('preserves behavior regardless of passed options', () => {
    const options = {
      onAbsent: jest.fn(),
      onDrowsy: jest.fn(),
      absentMs: 5000,
    };

    const { result } = renderHook(() => useFaceTracking(options));

    expect(result.current.focusState).toBe('focused');
    expect(result.current.frameProcessor).toBeUndefined();

    // Ensure callbacks are not called (since it's a stub)
    expect(options.onAbsent).not.toHaveBeenCalled();
    expect(options.onDrowsy).not.toHaveBeenCalled();
  });
});
