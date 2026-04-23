import React, { useRef, useState } from 'react';
import { Animated, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import LinearText from '../../../components/primitives/LinearText';
import { motion } from '../../../motion/presets';
import { styles } from '../TopicDetailScreen.styles';

export function MasterButton({ onPress, isLoading }: { onPress: () => void; isLoading?: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const [mastered, setMastered] = useState(false);
  const lastPressTime = useRef(0);
  const THROTTLE_MS = 500;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[styles.studyNowBtn, styles.masteredBtn, isLoading && styles.buttonLoading]}
        onPress={() => {
          if (mastered || isLoading) return;
          const now = Date.now();
          if (now - lastPressTime.current < THROTTLE_MS) return;
          lastPressTime.current = now;

          setMastered(true);
          const anim = motion.pulseScale(scale, { to: 1.08, duration: 300, loop: false });
          anim.start();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onPress();
        }}
        activeOpacity={0.8}
        disabled={mastered || isLoading}
        accessibilityRole="button"
        accessibilityLabel="Mark topic as mastered"
        accessibilityState={{ busy: isLoading }}
      >
        <LinearText variant="label" tone="inverse" style={styles.studyNowText}>
          {isLoading ? 'Marking...' : mastered ? 'Mastered!' : 'Mark as mastered'}
        </LinearText>
      </TouchableOpacity>
    </Animated.View>
  );
}
