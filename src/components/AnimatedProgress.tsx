/**
 * AnimatedProgress - Micro-progress tracking components
 * 
 * Provides satisfying visual feedback as syllabus fills up during study.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, StyleSheet, Easing } from 'react-native';
import * as Haptics from 'expo-haptics';

// ════════════════════════════════════════════════════════════════
// Animated Progress Bar with fill animation
// ════════════════════════════════════════════════════════════════

interface ProgressBarProps {
  progress: number; // 0-100
  color?: string;
  height?: number;
  showLabel?: boolean;
  animated?: boolean;
  onComplete?: () => void;
}

export function AnimatedProgressBar({ 
  progress, 
  color = '#6C63FF', 
  height = 8,
  showLabel = false,
  animated = true,
  onComplete,
}: ProgressBarProps) {
  const animValue = useRef(new Animated.Value(0)).current;
  const prevProgress = useRef(progress);
  
  useEffect(() => {
    const wasLower = prevProgress.current < progress;
    prevProgress.current = progress;
    
    if (animated) {
      Animated.timing(animValue, {
        toValue: progress,
        duration: wasLower ? 600 : 300,
        easing: wasLower ? Easing.out(Easing.back(1.2)) : Easing.out(Easing.ease),
        useNativeDriver: false,
      }).start(() => {
        if (progress >= 100 && onComplete) {
          onComplete();
        }
      });
      
      // Haptic feedback on significant progress
      if (wasLower && progress > 0 && progress % 10 === 0) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } else {
      animValue.setValue(progress);
    }
  }, [progress, animated]);
  
  const width = animValue.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });
  
  return (
    <View style={[styles.barContainer, { height }]}>
      <Animated.View 
        style={[
          styles.barFill, 
          { 
            width, 
            backgroundColor: color,
            height,
          }
        ]} 
      />
      {showLabel && (
        <Text style={styles.barLabel}>{Math.round(progress)}%</Text>
      )}
    </View>
  );
}


// ════════════════════════════════════════════════════════════════
// Circular Progress Ring (for subject cards)
// ════════════════════════════════════════════════════════════════

interface ProgressRingProps {
  progress: number; // 0-100
  size?: number;
  strokeWidth?: number;
  color?: string;
  bgColor?: string;
  children?: React.ReactNode;
}

export function ProgressRing({
  progress,
  size = 60,
  strokeWidth = 4,
  color = '#6C63FF',
  bgColor = '#2A2A38',
  children,
}: ProgressRingProps) {
  const animValue = useRef(new Animated.Value(0)).current;
  const [displayProgress, setDisplayProgress] = useState(0);
  
  useEffect(() => {
    Animated.timing(animValue, {
      toValue: progress,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    
    // Update display value
    const listener = animValue.addListener(({ value }) => {
      setDisplayProgress(Math.round(value));
    });
    
    return () => animValue.removeListener(listener);
  }, [progress]);
  
  // Simple visual representation using View-based segments
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const filledAngle = (displayProgress / 100) * 360;
  
  return (
    <View style={[styles.ringContainer, { width: size, height: size }]}>
      {/* Background ring */}
      <View 
        style={[
          styles.ringBg,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: strokeWidth,
            borderColor: bgColor,
          }
        ]}
      />
      
      {/* Progress indicator - simplified wedge approach */}
      <View 
        style={[
          styles.ringProgress,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: strokeWidth,
            borderColor: 'transparent',
            borderTopColor: color,
            borderRightColor: displayProgress > 25 ? color : 'transparent',
            borderBottomColor: displayProgress > 50 ? color : 'transparent',
            borderLeftColor: displayProgress > 75 ? color : 'transparent',
            transform: [{ rotate: '-45deg' }],
          }
        ]}
      />
      
      {/* Center content */}
      <View style={styles.ringCenter}>
        {children || (
          <Text style={styles.ringText}>{displayProgress}%</Text>
        )}
      </View>
    </View>
  );
}


// ════════════════════════════════════════════════════════════════
// Topic Completion Celebration
// ════════════════════════════════════════════════════════════════

interface CelebrationProps {
  visible: boolean;
  message?: string;
  xpEarned?: number;
  onDismiss?: () => void;
}

export function TopicCompletionCelebration({ 
  visible, 
  message = 'Nice!', 
  xpEarned = 0,
  onDismiss,
}: CelebrationProps) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 4,
          tension: 100,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
      
      // Auto-dismiss after 1.5s
      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(scaleAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start(() => {
          onDismiss?.();
        });
      }, 1500);
      
      return () => clearTimeout(timer);
    }
  }, [visible]);
  
  if (!visible) return null;
  
  return (
    <Animated.View 
      style={[
        styles.celebrationContainer,
        {
          opacity: opacityAnim,
          transform: [{ scale: scaleAnim }],
        }
      ]}
    >
      <Text style={styles.celebrationEmoji}>✨</Text>
      <Text style={styles.celebrationText}>{message}</Text>
      {xpEarned > 0 && (
        <Text style={styles.celebrationXp}>+{xpEarned} XP</Text>
      )}
    </Animated.View>
  );
}


// ════════════════════════════════════════════════════════════════
// Micro Progress Ticker (shows live count)
// ════════════════════════════════════════════════════════════════

interface MicroTickerProps {
  current: number;
  total: number;
  label?: string;
  color?: string;
}

export function MicroProgressTicker({ 
  current, 
  total, 
  label = 'completed',
  color = '#6C63FF',
}: MicroTickerProps) {
  const prevCurrent = useRef(current);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  
  useEffect(() => {
    if (current > prevCurrent.current) {
      // Pulse animation when number increases
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.3,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 3,
          tension: 100,
          useNativeDriver: true,
        }),
      ]).start();
      
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    prevCurrent.current = current;
  }, [current]);
  
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  
  return (
    <View style={styles.tickerContainer}>
      <Animated.Text 
        style={[
          styles.tickerNumber, 
          { color, transform: [{ scale: scaleAnim }] }
        ]}
      >
        {current}
      </Animated.Text>
      <Text style={styles.tickerSlash}>/</Text>
      <Text style={styles.tickerTotal}>{total}</Text>
      <Text style={styles.tickerLabel}>{label}</Text>
      <View style={[styles.tickerBadge, { backgroundColor: color + '22' }]}>
        <Text style={[styles.tickerPct, { color }]}>{pct}%</Text>
      </View>
    </View>
  );
}


// ════════════════════════════════════════════════════════════════
// Session Progress Summary (shows at end of session)
// ════════════════════════════════════════════════════════════════

interface SessionSummaryProps {
  topicsCompleted: number;
  minutesStudied: number;
  xpEarned: number;
  newMilestone?: string;
}

export function SessionProgressSummary({
  topicsCompleted,
  minutesStudied,
  xpEarned,
  newMilestone,
}: SessionSummaryProps) {
  const [animatedTopics, setAnimatedTopics] = useState(0);
  const [animatedXp, setAnimatedXp] = useState(0);
  
  useEffect(() => {
    // Animate numbers counting up
    const duration = 1000;
    const steps = 20;
    const stepTime = duration / steps;
    
    let step = 0;
    const interval = setInterval(() => {
      step++;
      const progress = step / steps;
      setAnimatedTopics(Math.floor(topicsCompleted * progress));
      setAnimatedXp(Math.floor(xpEarned * progress));
      
      if (step >= steps) {
        clearInterval(interval);
        setAnimatedTopics(topicsCompleted);
        setAnimatedXp(xpEarned);
      }
    }, stepTime);
    
    return () => clearInterval(interval);
  }, [topicsCompleted, xpEarned]);
  
  return (
    <View style={styles.summaryContainer}>
      <Text style={styles.summaryTitle}>Session Complete! 🎉</Text>
      
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{animatedTopics}</Text>
          <Text style={styles.summaryLabel}>Topics</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{minutesStudied}</Text>
          <Text style={styles.summaryLabel}>Minutes</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: '#FF9800' }]}>+{animatedXp}</Text>
          <Text style={styles.summaryLabel}>XP</Text>
        </View>
      </View>
      
      {newMilestone && (
        <View style={styles.milestoneBadge}>
          <Text style={styles.milestoneText}>🏆 {newMilestone}</Text>
        </View>
      )}
    </View>
  );
}


// ════════════════════════════════════════════════════════════════
// Styles
// ════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  // Progress Bar
  barContainer: {
    backgroundColor: '#2A2A38',
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  barFill: {
    borderRadius: 4,
  },
  barLabel: {
    position: 'absolute',
    right: 8,
    top: '50%',
    marginTop: -6,
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  
  // Progress Ring
  ringContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringBg: {
    position: 'absolute',
  },
  ringProgress: {
    position: 'absolute',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  
  // Celebration
  celebrationContainer: {
    position: 'absolute',
    top: '40%',
    left: '50%',
    marginLeft: -60,
    width: 120,
    backgroundColor: '#1A2A1A',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#4CAF50',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  celebrationEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  celebrationText: {
    color: '#4CAF50',
    fontSize: 18,
    fontWeight: '800',
  },
  celebrationXp: {
    color: '#FF9800',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  
  // Ticker
  tickerContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  tickerNumber: {
    fontSize: 28,
    fontWeight: '900',
  },
  tickerSlash: {
    color: '#666',
    fontSize: 20,
    marginHorizontal: 2,
  },
  tickerTotal: {
    color: '#888',
    fontSize: 20,
    fontWeight: '600',
  },
  tickerLabel: {
    color: '#666',
    fontSize: 12,
    marginLeft: 8,
  },
  tickerBadge: {
    marginLeft: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tickerPct: {
    fontSize: 12,
    fontWeight: '700',
  },
  
  // Session Summary
  summaryContainer: {
    backgroundColor: '#1A1A24',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  summaryTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryValue: {
    color: '#6C63FF',
    fontSize: 36,
    fontWeight: '900',
  },
  summaryLabel: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#333',
  },
  milestoneBadge: {
    marginTop: 20,
    backgroundColor: '#2A2A0A',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFD70066',
  },
  milestoneText: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '700',
  },
});
