import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar, Vibration, Animated,
  AppState, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../navigation/types';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '../store/useAppStore';
import { getDailyLog } from '../db/queries/progress';

const HARASSMENT_INTERVAL = 5 * 60 * 1000; // Every 5 minutes
const GUILT_CHECK_INTERVAL = 60 * 1000; // Check every minute

export default function PunishmentMode() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { profile } = useAppStore();
  const [isActive, setIsActive] = useState(true);
  const [minutesIdle, setMinutesIdle] = useState(0);
  const [shameLevel, setShameLevel] = useState(0);
  const [lastStudyTime, setLastStudyTime] = useState(0);
  const [showGuiltScreen, setShowGuiltScreen] = useState(true);
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Initialize idle tracking
  useEffect(() => {
    const dailyLog = getDailyLog();
    const todayMinutes = dailyLog?.totalMinutes ?? 0;
    const goalMinutes = profile?.dailyGoalMinutes ?? 120;
    
    // Assume idle since start of day if no activity
    setMinutesIdle(Math.max(0, todayMinutes > 0 ? 0 : Math.floor((new Date().getHours() * 60 + new Date().getMinutes()) / 2)));
    setLastStudyTime(todayMinutes);
    
    // Calculate shame level based on goal progress
    const progress = todayMinutes / goalMinutes;
    if (progress < 0.1) setShameLevel(3); // < 10% = maximum shame
    else if (progress < 0.5) setShameLevel(2); // < 50% = high shame
    else if (progress < 0.8) setShameLevel(1); // < 80% = mild shame
    else setShameLevel(0); // Good progress
  }, []);

  // Harassment mode - periodic vibrations
  useEffect(() => {
    if (!isActive || shameLevel === 0) return;
    
    const harassmentTimer = setInterval(() => {
      // Intense vibration pattern based on shame level
      const patterns = [
        [0, 500, 200, 500], // Level 1
        [0, 1000, 300, 1000, 300, 1000], // Level 2
        [0, 1500, 500, 1500, 500, 1500, 500, 1500], // Level 3
      ];
      
      const pattern = patterns[Math.min(shameLevel - 1, patterns.length - 1)];
      Vibration.vibrate(pattern);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      
      // Show guilt screen again
      setShowGuiltScreen(true);
    }, HARASSMENT_INTERVAL / Math.max(1, shameLevel)); // More frequent for higher shame
    
    return () => clearInterval(harassmentTimer);
  }, [isActive, shameLevel]);

  // Idle time tracking
  useEffect(() => {
    if (!isActive) return;
    
    const idleTimer = setInterval(() => {
      setMinutesIdle(prev => prev + 1);
    }, GUILT_CHECK_INTERVAL);
    
    return () => clearInterval(idleTimer);
  }, [isActive]);

  // Animations
  useEffect(() => {
    if (showGuiltScreen) {
      // Pulsing animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.1, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start();
      
      // Shake for high shame levels
      if (shameLevel >= 2) {
        Animated.loop(
          Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 5, duration: 100, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -5, duration: 100, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
          ])
        ).start();
      }
    }
  }, [showGuiltScreen, shameLevel]);

  const shameMessages = [
    null, // Level 0 - no shame
    {
      title: "Lazy Day?",
      subtitle: "You've studied {minutes}min today. Goal: {goal}min.",
      quote: "A little effort now saves a lot of panic later.",
      color: '#FF9800'
    },
    {
      title: "GET UP",
      subtitle: "{minutes}min studied. {idle}min idle. Your books are collecting dust.",
      quote: "Your competitors are studying RIGHT NOW.",
      color: '#F44336'
    },
    {
      title: "PATHETIC",
      subtitle: "Only {minutes}min today. You've been idle for {idle}min.",
      quote: "You promised yourself you'd be a doctor. Prove it.",
      color: '#F44336'
    }
  ];

  const currentShame = shameMessages[shameLevel];

  function handleStartStudying() {
    setIsActive(false);
    setShowGuiltScreen(false);
    navigation.navigate('Session', { mood: 'guilty', mode: 'sprint', forcedMinutes: 10 });
  }

  function handleQuickWin() {
    setIsActive(false);
    setShowGuiltScreen(false);
    navigation.navigate('Inertia');
  }

  function handleDisable() {
    Alert.alert(
      'Giving Up?',
      'Disable punishment mode and accept your laziness?',
      [
        { text: 'I\'ll Study', style: 'cancel' },
        { text: 'I Accept Defeat', style: 'destructive', onPress: () => {
          setIsActive(false);
          setShowGuiltScreen(false);
          // Could track "gave up" statistic here
        }}
      ]
    );
  }

  function handleSnooze() {
    setShowGuiltScreen(false);
    // Snooze for 10 minutes
    setTimeout(() => setShowGuiltScreen(true), 10 * 60 * 1000);
  }

  if (!showGuiltScreen || !currentShame) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
        <View style={styles.minimizedContainer}>
          <Text style={styles.minimizedText}>😴 Punishment Mode Snoozed</Text>
          <TouchableOpacity style={styles.wakeBtn} onPress={() => setShowGuiltScreen(true)}>
            <Text style={styles.wakeBtnText}>Wake Me Up</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
      <Animated.View style={[styles.container, { transform: [{ translateX: shakeAnim }] }]}>
        <Animated.View style={[styles.shameIcon, { transform: [{ scale: pulseAnim }] }]}>
          <Text style={styles.shameEmoji}>😤</Text>
        </Animated.View>
        
        <Text style={[styles.title, { color: currentShame.color }]}>
          {currentShame.title}
        </Text>
        
        <Text style={styles.subtitle}>
          {currentShame.subtitle
            .replace('{minutes}', String(lastStudyTime))
            .replace('{goal}', String(profile?.dailyGoalMinutes ?? 120))
            .replace('{idle}', String(minutesIdle))}
        </Text>
        
        <View style={styles.guiltBox}>
          <Text style={[styles.quote, { color: currentShame.color }]}>
            "{currentShame.quote}"
          </Text>
        </View>
        
        <View style={styles.progressContainer}>
          <Text style={styles.progressLabel}>Daily Goal Progress</Text>
          <View style={styles.progressBar}>
            <View 
              style={[
                styles.progressFill, 
                { 
                  width: `${Math.min(100, (lastStudyTime / (profile?.dailyGoalMinutes ?? 120)) * 100)}%`,
                  backgroundColor: currentShame.color 
                }
              ]} 
            />
          </View>
          <Text style={styles.progressText}>
            {lastStudyTime} / {profile?.dailyGoalMinutes ?? 120} min
          </Text>
        </View>
        
        <TouchableOpacity 
          style={[styles.studyBtn, { backgroundColor: currentShame.color }]} 
          onPress={handleStartStudying}
        >
          <Text style={styles.studyBtnText}>📚 START STUDYING NOW</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.quickWinBtn} onPress={handleQuickWin}>
          <Text style={styles.quickWinBtnText}>🎯 Just One Card (Easy)</Text>
        </TouchableOpacity>
        
        <View style={styles.bottomRow}>
          <TouchableOpacity style={styles.snoozeBtn} onPress={handleSnooze}>
            <Text style={styles.snoozeBtnText}>😴 Snooze 10min</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.disableBtn} onPress={handleDisable}>
            <Text style={styles.disableBtnText}>❌ Give Up</Text>
          </TouchableOpacity>
        </View>
        
        <Text style={styles.footerText}>
          Punishment Level {shameLevel}/3 • Idle: {minutesIdle}min
        </Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  
  shameIcon: { 
    width: 100, 
    height: 100, 
    borderRadius: 50, 
    backgroundColor: '#2A0A0A', 
    borderWidth: 3, 
    borderColor: '#F44336',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30 
  },
  shameEmoji: { fontSize: 48 },
  
  title: { fontSize: 36, fontWeight: '900', marginBottom: 16, textAlign: 'center' },
  subtitle: { color: '#9E9E9E', fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 24 },
  
  guiltBox: { 
    backgroundColor: '#1A1A24', 
    padding: 20, 
    borderRadius: 16, 
    borderLeftWidth: 4, 
    borderLeftColor: '#F44336',
    marginBottom: 32,
    maxWidth: '100%'
  },
  quote: { fontSize: 18, fontStyle: 'italic', textAlign: 'center', lineHeight: 26 },
  
  progressContainer: { width: '100%', marginBottom: 32 },
  progressLabel: { color: '#555', fontSize: 12, marginBottom: 8 },
  progressBar: { 
    height: 12, 
    backgroundColor: '#2A2A38', 
    borderRadius: 6, 
    overflow: 'hidden',
    marginBottom: 8 
  },
  progressFill: { height: '100%' },
  progressText: { color: '#9E9E9E', fontSize: 14, textAlign: 'center' },
  
  studyBtn: { 
    width: '100%', 
    paddingVertical: 20, 
    borderRadius: 16, 
    alignItems: 'center',
    marginBottom: 16 
  },
  studyBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  
  quickWinBtn: { 
    backgroundColor: '#1A1A2E', 
    width: '100%', 
    paddingVertical: 16, 
    borderRadius: 16, 
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#6C63FF44',
    marginBottom: 24 
  },
  quickWinBtnText: { color: '#6C63FF', fontSize: 16, fontWeight: '700' },
  
  bottomRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    width: '100%', 
    marginBottom: 32 
  },
  snoozeBtn: { padding: 16 },
  snoozeBtnText: { color: '#555', fontSize: 14 },
  disableBtn: { padding: 16 },
  disableBtnText: { color: '#F44336', fontSize: 14 },
  
  footerText: { color: '#333', fontSize: 12 },
  
  // Minimized view
  minimizedContainer: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: 32 
  },
  minimizedText: { color: '#555', fontSize: 16, marginBottom: 20 },
  wakeBtn: { 
    backgroundColor: '#6C63FF', 
    paddingHorizontal: 32, 
    paddingVertical: 16, 
    borderRadius: 12 
  },
  wakeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
