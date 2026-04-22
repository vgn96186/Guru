import { useWindowDimensions } from 'react-native';

export function useResponsiveGrid() {
  const { width, height } = useWindowDimensions();

  // Phone usually < 768px wide
  const isTablet = width >= 768;
  const isLandscape = width > height;

  // Columns
  // Phone: 4 cols
  // Tablet Portrait: 8 cols
  // Tablet Landscape: 12 cols
  const columns = isTablet ? (isLandscape ? 12 : 8) : 4;

  // Base padding/margin depending on device size
  const screenPadding = isTablet ? 48 : 24;
  const itemSpacing = isTablet ? 32 : 16;

  // Useful for conditionally stacking sections side-by-side or vertically
  const flexDirection: 'row' | 'column' = isTablet && isLandscape ? 'row' : 'column';

  return {
    isTablet,
    isLandscape,
    columns,
    screenPadding,
    itemSpacing,
    flexDirection,
    width,
    height,
  };
}
