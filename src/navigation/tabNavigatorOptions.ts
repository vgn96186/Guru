import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';

export const TAB_NAVIGATOR_SCREEN_OPTIONS: Pick<
  BottomTabNavigationOptions,
  'animation' | 'freezeOnBlur' | 'lazy'
> = {
  animation: 'none',
  freezeOnBlur: true,
  lazy: true,
};

export const TAB_NAVIGATOR_PERFORMANCE_PROPS = {
  detachInactiveScreens: true,
} as const;
