import React, { useEffect } from 'react';
import { TouchableOpacity, View, StyleSheet, useWindowDimensions } from 'react-native';
import {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { linearTheme as n } from '../theme/linearTheme';
import SharedOrbShell from './SharedOrbShell';

const PHONE_SIZE = 156;
const TABLET_SIZE = 220;
const TABLET_BREAKPOINT = 600;
const BOX_STEP = 4000;
const easeBreath = Easing.bezier(0.4, 0.0, 0.2, 1);

interface Props {
  onPress: () => void;
  label?: string;
  sublabel?: string;
  color?: string;
  disabled?: boolean;
  disabledLabel?: string;
  hidden?: boolean;
}

const StartButton = React.forwardRef<View, Props>(function StartButton(
  {
    onPress,
    label = 'START SESSION',
    sublabel,
    color = n.colors.accent,
    disabled = false,
    disabledLabel = 'LOADING...',
    hidden = false,
  },
  ref,
) {
  const { width } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT;
  const size = isTablet ? TABLET_SIZE : PHONE_SIZE;
  const radius = size / 2;

  const breathScale = useSharedValue(1);
  const breathGlow = useSharedValue(0);
  const highlightTranslateY = useSharedValue(0);
  const highlightOpacity = useSharedValue(0.45);

  useEffect(() => {
    if (hidden || disabled) {
      cancelAnimation(breathScale);
      cancelAnimation(breathGlow);
      cancelAnimation(highlightTranslateY);
      cancelAnimation(highlightOpacity);
      breathScale.value = 1;
      breathGlow.value = 0;
      highlightTranslateY.value = 0;
      highlightOpacity.value = 0.45;
      return;
    }

    breathScale.value = withSequence(
      withTiming(1.08, { duration: BOX_STEP / 2, easing: easeBreath }),
      withRepeat(
        withSequence(
          withTiming(1.08, { duration: BOX_STEP }),
          withTiming(0.92, { duration: BOX_STEP, easing: easeBreath }),
          withTiming(0.92, { duration: BOX_STEP }),
          withTiming(1.08, { duration: BOX_STEP, easing: easeBreath }),
        ),
        -1,
        false,
      ),
    );

    breathGlow.value = withSequence(
      withTiming(0.95, { duration: BOX_STEP / 2, easing: easeBreath }),
      withRepeat(
        withSequence(
          withTiming(0.95, { duration: BOX_STEP }),
          withTiming(0.05, { duration: BOX_STEP, easing: easeBreath }),
          withTiming(0.05, { duration: BOX_STEP }),
          withTiming(0.95, { duration: BOX_STEP, easing: easeBreath }),
        ),
        -1,
        false,
      ),
    );

    highlightTranslateY.value = withSequence(
      withTiming(3, { duration: BOX_STEP / 2, easing: easeBreath }),
      withRepeat(
        withSequence(
          withTiming(3, { duration: BOX_STEP }),
          withTiming(-2, { duration: BOX_STEP, easing: easeBreath }),
          withTiming(-2, { duration: BOX_STEP }),
          withTiming(3, { duration: BOX_STEP, easing: easeBreath }),
        ),
        -1,
        false,
      ),
    );

    highlightOpacity.value = withSequence(
      withTiming(0.75, { duration: BOX_STEP / 2, easing: easeBreath }),
      withRepeat(
        withSequence(
          withTiming(0.75, { duration: BOX_STEP }),
          withTiming(0.35, { duration: BOX_STEP, easing: easeBreath }),
          withTiming(0.35, { duration: BOX_STEP }),
          withTiming(0.75, { duration: BOX_STEP, easing: easeBreath }),
        ),
        -1,
        false,
      ),
    );

    return () => {
      cancelAnimation(breathScale);
      cancelAnimation(breathGlow);
      cancelAnimation(highlightTranslateY);
      cancelAnimation(highlightOpacity);
    };
  }, [disabled, hidden, breathGlow, breathScale, highlightOpacity, highlightTranslateY]);

  const styleOrbBody = useAnimatedStyle(() => ({
    transform: [{ scale: breathScale.value }],
  }));

  const styleGlow = useAnimatedStyle(() => ({
    opacity: breathGlow.value,
  }));

  const styleHighlight = useAnimatedStyle(() => ({
    transform: [{ translateY: highlightTranslateY.value }],
    opacity: highlightOpacity.value,
  }));

  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  }

  const btnColor = disabled ? n.colors.cardHover : color;

  return (
    <View ref={ref} collapsable={false} style={hidden ? styles.hidden : undefined}>
      <TouchableOpacity
        onPress={handlePress}
        disabled={disabled}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Start study session"
        accessibilityState={{ disabled }}
        testID="start-session-btn"
        style={[
          styles.button,
          { width: size, height: size, borderRadius: radius },
          disabled && styles.buttonDisabled,
        ]}
      >
        <SharedOrbShell
          size={size}
          color={btnColor}
          label={disabled ? disabledLabel : label}
          sublabel={sublabel}
          bodyAnimatedStyle={styleOrbBody}
          glowAnimatedStyle={styleGlow}
          highlightAnimatedStyle={styleHighlight}
        />
      </TouchableOpacity>
    </View>
  );
});

export default StartButton;

const styles = StyleSheet.create({
  hidden: {
    opacity: 0,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
});
