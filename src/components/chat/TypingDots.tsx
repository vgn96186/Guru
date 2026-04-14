import React, { memo, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '../../motion/useReducedMotion';
import { linearTheme as n } from '../../theme/linearTheme';

export const TypingDots = memo(({ active = true }: { active?: boolean }) => {
  const reducedMotion = useReducedMotion();
  const dotA = useRef(new Animated.Value(0)).current;
  const dotB = useRef(new Animated.Value(0)).current;
  const dotC = useRef(new Animated.Value(0)).current;
  const dots = useMemo(() => [dotA, dotB, dotC], [dotA, dotB, dotC]);

  useEffect(() => {
    if (!active || reducedMotion) {
      return undefined;
    }

    const anims = dots.map((dot, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 150),
          Animated.timing(dot, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
            easing: Easing.out(Easing.ease),
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
            easing: Easing.in(Easing.ease),
          }),
          Animated.delay((2 - index) * 150),
        ]),
      ),
    );
    Animated.parallel(anims).start();
    return () => anims.forEach((anim) => anim.stop());
  }, [active, dots, reducedMotion]);

  return (
    <View style={styles.dotsRow}>
      {dots.map((dot, index) => (
        <Animated.View
          key={index}
          style={[
            styles.dot,
            active && !reducedMotion
              ? {
                  transform: [
                    { translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) },
                  ],
                  opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
                }
              : styles.dotStatic,
          ]}
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  dotsRow: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    height: 16,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: n.colors.accent,
  },
  dotStatic: {
    opacity: 0.55,
  },
});
