import React from 'react';
import { TouchableOpacity, Animated } from 'react-native';
import { motion } from '../../../motion/presets';
import LinearText from '../../../components/primitives/LinearText';

import { s } from '../styles';
import { linearTheme as n } from '../../../theme/linearTheme';

// ── Deep Explanation with Reveal ─────────────────────────────────
// ── Quiz ──────────────────────────────────────────────────────────

export function QuizOptionBtn({
  idx,
  opt,
  isSelected,
  isCorrect,
  isRevealed,
  onPress,
}: {
  idx: number;
  opt: string;
  isSelected: boolean;
  isCorrect: boolean;
  isRevealed: boolean;
  onPress: (idx: number) => void;
}) {
  const scale = React.useRef(new Animated.Value(1)).current;
  const shakeX = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (isRevealed && isSelected) {
      if (isCorrect) {
        const anim = motion.pulseScale(scale, { to: 1.05, duration: 400, loop: false });
        anim.start();
        return () => anim.stop();
      } else {
        const anim = motion.shake(shakeX, { amplitude: 6, tickMs: 60, loop: false });
        anim.start();
        return () => anim.stop();
      }
    } else {
      scale.setValue(1);
      shakeX.setValue(0);
    }
  }, [isRevealed, isSelected, isCorrect, scale, shakeX]);

  let bgColor = n.colors.surface as string;
  let borderColor = n.colors.border as string;
  if (isRevealed) {
    if (isCorrect) {
      bgColor = n.colors.successSurface as string;
      borderColor = n.colors.success as string;
    } else if (isSelected) {
      bgColor = n.colors.errorSurface as string;
      borderColor = n.colors.error as string;
    }
  }

  return (
    <Animated.View style={{ transform: [{ scale }, { translateX: shakeX }] }}>
      <TouchableOpacity
        style={[s.optionBtn, { backgroundColor: bgColor, borderColor }]}
        onPress={() => onPress(idx)}
        activeOpacity={0.8}
      >
        <LinearText style={s.optionText} numberOfLines={4}>
          {opt}
        </LinearText>
      </TouchableOpacity>
    </Animated.View>
  );
}
