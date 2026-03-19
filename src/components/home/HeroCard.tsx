import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { theme } from '../../constants/theme';

interface HeroCardProps {
  greeting: string;
  firstName: string;
  daysToInicet: number;
  daysToNeetPg: number;
}

export default React.memo(function HeroCard({
  greeting,
  firstName,
  daysToInicet,
  daysToNeetPg,
}: HeroCardProps) {
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: false, // Required for color interpolation
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1400,
          useNativeDriver: false,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  const scale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.25],
  });

  const pulseColor = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.textPrimary, theme.colors.accentAlt],
  });

  return (
    <View
      style={styles.card}
      accessibilityRole="summary"
      accessible
      accessibilityLabel={`${greeting}, ${firstName}. INICET in ${daysToInicet} days, NEET-PG in ${daysToNeetPg} days.`}
    >
      <Text style={styles.greeting}>
        {greeting}, {firstName}
      </Text>
      <Text style={styles.title}>Let's lock your next focused hour.</Text>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>INICET</Text>
          <Animated.Text
            style={[
              styles.statValue,
              daysToInicet <= 30 && styles.urgent,
              {
                transform: [{ scale }],
                color: pulseColor,
                textShadowColor: 'rgba(255, 215, 0, 0.4)',
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 10,
              },
            ]}
          >
            {daysToInicet}d
          </Animated.Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.stat}>
          <Text style={styles.statLabel}>NEET-PG</Text>
          <Animated.Text
            style={[
              styles.statValue,
              daysToNeetPg <= 30 && styles.urgent,
              {
                transform: [{ scale }],
                color: pulseColor,
                textShadowColor: 'rgba(255, 215, 0, 0.4)',
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 10,
              },
            ]}
          >
            {daysToNeetPg}d
          </Animated.Text>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 16,
  },
  greeting: {
    color: theme.colors.primaryLight,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  title: { color: theme.colors.textPrimary, fontSize: 22, fontWeight: '900', marginTop: 4 },
  statsRow: {
    flexDirection: 'row',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  stat: { flex: 1, alignItems: 'center' },
  statLabel: { color: theme.colors.textSecondary, fontSize: 11, fontWeight: '700' },
  statValue: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: '900', marginTop: 2 },
  urgent: { color: theme.colors.warning },
  divider: { width: 1, height: 30, backgroundColor: theme.colors.border },
});
