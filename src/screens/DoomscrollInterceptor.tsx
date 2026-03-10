import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar, AppState, Vibration,
  Animated, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../navigation/types';
import { getDailyLog } from '../db/queries/progress';
import * as Haptics from 'expo-haptics';
import { ResponsiveContainer } from '../hooks/useResponsive';

const DOOMSCROLL_APPS = ['instagram', 'tiktok', 'twitter', 'facebook', 'youtube', 'snapchat'];
const CHECK_INTERVAL = 2000; // Check every 2 seconds
const MAX_OPENS_BEFORE_SHAME = 3;
const DELAY_SECONDS = 30; // 30-second delay before allowing access

export default function DoomscrollInterceptor() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const appStateRef = React.useRef(AppState.currentState);
  const [doomscrollAttempts, setDoomscrollAttempts] = useState(0);
  const [isBlocking, setIsBlocking] = useState(false);
  const [blockAppName, setBlockAppName] = useState('');
  const [delayRemaining, setDelayRemaining] = useState(0);
  const [shameLevel, setShameLevel] = useState(0);
  
  const pulseAnim = React.useRef(new Animated.Value(1)).current;
  const shakeAnim = React.useRef(new Animated.Value(0)).current;

  // Monitor app state changes (in real implementation, use native module to detect app switches)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      const prevAppState = appStateRef.current;
      appStateRef.current = nextAppState;
      
      // When app comes to foreground, check if doomscroll app was opened
      if (nextAppState === 'active' && prevAppState.match(/inactive|background/)) {
        // In real implementation, check which app was last opened
        checkForDoomscrollAttempt();
      }
    });
    
    return () => subscription.remove();
  }, []);

  function checkForDoomscrollAttempt() {
    // TODO: Replace this mock with actual detection via native module.
    // For now, use a fixed app name when this screen is navigated to,
    // since opening this screen IS the doomscroll detection event.
    const detectedApp = 'social media';
    
    setDoomscrollAttempts(prev => {
      const newCount = prev + 1;
      
      if (newCount >= MAX_OPENS_BEFORE_SHAME) {
        setIsBlocking(true);
        setBlockAppName(detectedApp);
        setDelayRemaining(DELAY_SECONDS);
        setShameLevel(Math.min(3, Math.floor(newCount / 3)));
        
        // Heavy vibration for punishment
        Vibration.vibrate([0, 1000, 500, 1000, 500, 1000]);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        
        // Start delay countdown
        startDelayTimer();
      }
      
      return newCount;
    });
  }

  function startDelayTimer() {
    let remaining = DELAY_SECONDS;
    const timer = setInterval(() => {
      remaining -= 1;
      setDelayRemaining(remaining);
      
      if (remaining <= 0) {
        clearInterval(timer);
      }
    }, 1000);
  }

  // Animations
  useEffect(() => {
    if (isBlocking) {
      // Pulsing lock animation
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.1, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      pulseLoop.start();
      
      // Shake animation for shame
      const shakeLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(shakeAnim, { toValue: 10, duration: 100, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: -10, duration: 100, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
        ])
      );
      shakeLoop.start();
      
      return () => {
        pulseLoop.stop();
        shakeLoop.stop();
      };
    }
  }, [isBlocking]);

  const shameMessages = [
    {
      title: "Really?",
      subtitle: "You've opened {app} {count} times today without studying.",
      quote: "Your future patients are watching."
    },
    {
      title: "PATHETIC",
      subtitle: "{count} attempts to avoid studying. You're better than this.",
      quote: "The algorithm is winning. Fight back."
    },
    {
      title: "DISAPPOINTMENT",
      subtitle: "{count} times. A doctor needs discipline, not dopamine.",
      quote: "You're choosing pixels over patients."
    }
  ];

  const currentShame = shameMessages[Math.min(shameLevel, shameMessages.length - 1)];

  function handleGoBackToStudy() {
    setIsBlocking(false);
    setDoomscrollAttempts(0);
    navigation.navigate('Inertia');
  }

  function handleForceProceed() {
    Alert.alert(
      'You\'re Giving Up?',
      'Opening {app} means losing 50 XP and breaking your streak momentum.',
      [
        { text: 'I\'ll Study Instead', style: 'cancel', onPress: () => setIsBlocking(false) },
        { text: 'Take the Penalty', style: 'destructive', onPress: () => {
          // In real implementation: deduct XP
          setIsBlocking(false);
        }}
      ]
    );
  }

  if (!isBlocking) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
        <ResponsiveContainer>
          <View style={[styles.container, { justifyContent: 'center' }]}>
            <Text style={styles.lockEmoji}>📵</Text>
            <Text style={styles.title}>Interception standby</Text>
            <Text style={styles.subtitle}>
              Live app detection is not active yet on this device. Use App Hijack Setup to enable the guardrails, or go back to study now.
            </Text>
            <TouchableOpacity style={styles.studyBtn} onPress={() => navigation.navigate('Inertia')}>
              <Text style={styles.studyBtnText}>📚 GO BACK TO STUDYING</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.proceedBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.proceedBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
      <ResponsiveContainer>
      <Animated.View style={[styles.container, { transform: [{ translateX: shakeAnim }] }]}>
        <Animated.View style={[styles.lockIcon, { transform: [{ scale: pulseAnim }] }]}>
          <Text style={styles.lockEmoji}>🚫</Text>
        </Animated.View>
        
        <Text style={styles.title}>{currentShame.title}</Text>
        <Text style={styles.subtitle}>
          {currentShame.subtitle.replace('{app}', blockAppName).replace('{count}', String(doomscrollAttempts))}
        </Text>
        
        <View style={styles.shameBox}>
          <Text style={styles.quote}>"{currentShame.quote}"</Text>
        </View>
        
        {delayRemaining > 0 ? (
          <View style={styles.delayContainer}>
            <Text style={styles.delayText}>⏳ {delayRemaining} seconds of shame</Text>
            <View style={styles.delayBar}>
              <View style={[styles.delayFill, { width: `${((DELAY_SECONDS - delayRemaining) / DELAY_SECONDS) * 100}%` }]} />
            </View>
            <Text style={styles.delaySub}>Think about your goals while you wait.</Text>
          </View>
        ) : (
          <View style={styles.unlockedContainer}>
            <Text style={styles.unlockedText}>You can proceed now...</Text>
            <Text style={styles.unlockedSub}>But should you?</Text>
          </View>
        )}
        
        <TouchableOpacity 
          style={styles.studyBtn} 
          onPress={handleGoBackToStudy}
        >
          <Text style={styles.studyBtnText}>
            {delayRemaining > 0 ? `Wait ${delayRemaining}s...` : '📚 GO BACK TO STUDYING'}
          </Text>
        </TouchableOpacity>
        
        {delayRemaining === 0 && (
          <TouchableOpacity style={styles.proceedBtn} onPress={handleForceProceed}>
            <Text style={styles.proceedBtnText}>Open {blockAppName} Anyway (-50 XP)</Text>
          </TouchableOpacity>
        )}
        
        <View style={styles.statsContainer}>
          <Text style={styles.statsText}>Doomscroll attempts today: {doomscrollAttempts}</Text>
          <Text style={styles.statsSub}>Study sessions today: {getDailyLog()?.sessionCount ?? 0}</Text>
        </View>
      </Animated.View>
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  
  lockIcon: { 
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
  lockEmoji: { fontSize: 48 },
  
  title: { color: '#F44336', fontSize: 36, fontWeight: '900', marginBottom: 16, textAlign: 'center' },
  subtitle: { color: '#9E9E9E', fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 24 },
  
  shameBox: { 
    backgroundColor: '#1A1A24', 
    padding: 20, 
    borderRadius: 16, 
    borderLeftWidth: 4, 
    borderLeftColor: '#F44336',
    marginBottom: 40,
    maxWidth: '100%'
  },
  quote: { color: '#FF9800', fontSize: 18, fontStyle: 'italic', textAlign: 'center', lineHeight: 26 },
  
  delayContainer: { alignItems: 'center', marginBottom: 30, width: '100%' },
  delayText: { color: '#6C63FF', fontSize: 20, fontWeight: '700', marginBottom: 12 },
  delayBar: { 
    width: 200, 
    height: 8, 
    backgroundColor: '#2A2A38', 
    borderRadius: 4, 
    overflow: 'hidden',
    marginBottom: 8 
  },
  delayFill: { height: '100%', backgroundColor: '#6C63FF' },
  delaySub: { color: '#555', fontSize: 12 },
  
  unlockedContainer: { alignItems: 'center', marginBottom: 30 },
  unlockedText: { color: '#4CAF50', fontSize: 18, fontWeight: '700' },
  unlockedSub: { color: '#555', fontSize: 14, marginTop: 4 },
  
  studyBtn: { 
    backgroundColor: '#6C63FF', 
    paddingHorizontal: 40, 
    paddingVertical: 20, 
    borderRadius: 16, 
    marginBottom: 16,
    minWidth: 280,
    alignItems: 'center'
  },
  studyBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  
  proceedBtn: { padding: 16 },
  proceedBtnText: { color: '#F44336', fontSize: 14, textDecorationLine: 'underline' },
  
  statsContainer: { 
    position: 'absolute', 
    bottom: 40, 
    alignItems: 'center' 
  },
  statsText: { color: '#F44336', fontSize: 14, fontWeight: '600' },
  statsSub: { color: '#555', fontSize: 12, marginTop: 4 },
});
