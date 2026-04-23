import React, { useEffect, useRef } from 'react';
import { View, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LinearText from '../../../components/primitives/LinearText';
import { styles } from '../LectureModeScreen.styles';
import { linearTheme as n } from '../../../theme/linearTheme';
import { motion, useReducedMotion } from '../../../motion';

interface ProofOfLifeChallengeProps {
  countdown: number;
}

export function ProofOfLifeChallenge({ countdown }: ProofOfLifeChallengeProps) {
  const reducedMotion = useReducedMotion();
  const proofPulseAnim = useRef(new Animated.Value(1)).current;
  const proofGlowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const glowLoop = motion.pulseValue(proofGlowAnim, {
      from: 1,
      to: 0.6,
      duration: 1000,
      reducedMotion,
    });
    glowLoop.start();

    const pulseLoop = motion.pulseScale(proofPulseAnim, {
      to: 1.02,
      duration: 800,
      reducedMotion,
    });
    pulseLoop.start();

    return () => {
      glowLoop.stop();
      pulseLoop.stop();
    };
  }, [proofGlowAnim, proofPulseAnim, reducedMotion]);

  return (
    <Animated.View
      style={[
        styles.proofOfLifeBox,
        styles.proofOfLifeBoxActive,
        {
          transform: [{ scale: proofPulseAnim }],
          shadowOpacity: 0.4,
        },
      ]}
    >
      <View style={styles.proofIconContainer}>
        <Ionicons name="alert-circle-outline" size={32} color={n.colors.error} />
        <Animated.View
          style={[
            styles.proofPulseRing,
            {
              opacity: proofGlowAnim,
              transform: [
                {
                  scale: proofGlowAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.3],
                  }),
                },
              ],
            },
          ]}
        />
      </View>

      <LinearText style={styles.proofTitle}>ACTIVE LISTENING CHECK</LinearText>
      <LinearText style={styles.proofSub}>
        You have {countdown}s to type one thing the professor just said.
      </LinearText>

      <View style={styles.proofTimerContainer}>
        <View style={styles.proofTimerCircle}>
          <LinearText
            style={[styles.proofTimerText, countdown <= 10 && styles.proofTimerTextUrgent]}
          >
            {countdown}
          </LinearText>
        </View>
        <LinearText style={styles.proofTimerLabel}>seconds remaining</LinearText>
      </View>

      <LinearText style={styles.proofWarning}>
        Are you zoning out? Type a note above to dismiss this alert.
      </LinearText>
    </Animated.View>
  );
}
