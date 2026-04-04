import {
  TAB_NAVIGATOR_PERFORMANCE_PROPS,
  TAB_NAVIGATOR_SCREEN_OPTIONS,
} from './tabNavigatorOptions';

describe('TAB_NAVIGATOR_SCREEN_OPTIONS', () => {
  it('disables JS-driven tab scene animation to keep tab switches responsive', () => {
    expect(TAB_NAVIGATOR_SCREEN_OPTIONS.animation).toBe('none');
  });

  it('keeps inactive tabs detached and lazily mounted', () => {
    expect(TAB_NAVIGATOR_PERFORMANCE_PROPS.detachInactiveScreens).toBe(true);
    expect(TAB_NAVIGATOR_SCREEN_OPTIONS.lazy).toBe(true);
    expect(TAB_NAVIGATOR_SCREEN_OPTIONS.freezeOnBlur).toBe(true);
  });
});
