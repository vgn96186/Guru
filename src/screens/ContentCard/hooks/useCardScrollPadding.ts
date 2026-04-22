import { useMemo } from 'react';
import { useWindowDimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { s } from '../styles';

export function useCardScrollPaddingBottom(extraBottom = 0) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return useMemo(() => {
    const isLandscape = width > height;
    const isTablet = Math.min(width, height) >= 600;
    const safeBottom = Math.max(insets.bottom, Platform.OS === 'android' ? 10 : 0);
    const orientationPad = isLandscape ? (isTablet ? 36 : 26) : isTablet ? 16 : 8;
    return 72 + safeBottom + orientationPad + extraBottom;
  }, [width, height, insets.bottom, extraBottom]);
}

export function useCardScrollContentStyle(extraBottom = 0) {
  const paddingBottom = useCardScrollPaddingBottom(extraBottom);
  return useMemo(() => [s.container, { paddingBottom }], [paddingBottom]);
}
