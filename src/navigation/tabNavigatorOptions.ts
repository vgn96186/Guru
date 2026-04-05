import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { linearTheme as n } from '../theme/linearTheme';

export const TAB_NAVIGATOR_SCREEN_OPTIONS: Pick<
  BottomTabNavigationOptions,
  'animation' | 'freezeOnBlur' | 'lazy' | 'sceneStyle'
> = {
  animation: 'none',
  freezeOnBlur: true,
  lazy: true,
  sceneStyle: { backgroundColor: n.colors.background },
};

export const TAB_NAVIGATOR_PERFORMANCE_PROPS = {
  detachInactiveScreens: false,
} as const;
