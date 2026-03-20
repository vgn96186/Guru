import { renderHook } from '@testing-library/react-native';
import { useResponsive } from './useResponsive';
import { useWindowDimensions } from 'react-native';

jest.mock('react-native', () => ({
  useWindowDimensions: jest.fn(),
  View: 'View',
}));

describe('useResponsive', () => {
  it('returns mobile values for narrow width', () => {
    (useWindowDimensions as jest.Mock).mockReturnValue({ width: 375, height: 667 });
    const { result } = renderHook(() => useResponsive());

    expect(result.current.isTablet).toBe(false);
    expect(result.current.isLandscape).toBe(false);
    expect(result.current.maxContentWidth).toBeUndefined();
    expect(result.current.s(10)).toBe(10);
    expect(result.current.f(10)).toBe(10);
    expect(result.current.sz(10)).toBe(10);
  });

  it('returns tablet values for wider width', () => {
    (useWindowDimensions as jest.Mock).mockReturnValue({ width: 768, height: 1024 });
    const { result } = renderHook(() => useResponsive());

    expect(result.current.isTablet).toBe(true);
    expect(result.current.isLandscape).toBe(false);
    expect(result.current.maxContentWidth).toBeLessThanOrEqual(800);
    expect(result.current.s(10)).toBe(Math.round(10 * 1.8));
    expect(result.current.f(10)).toBe(Math.round(10 * 1.3));
    expect(result.current.sz(10)).toBe(Math.round(10 * 1.4));
  });

  it('identifies landscape mode', () => {
    (useWindowDimensions as jest.Mock).mockReturnValue({ width: 1024, height: 768 });
    const { result } = renderHook(() => useResponsive());

    expect(result.current.isTablet).toBe(true);
    expect(result.current.isLandscape).toBe(true);
    expect(result.current.maxContentWidth).toBe(Math.round(1024 * 0.95));
  });
});
