import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, StatusBar, Animated, Vibration,
  Alert, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../navigation/types';
import * as Haptics from 'expo-haptics';

const POSITION_CHECK_INTERVAL = 1000; // Check every second
const STANDING_THRESHOLD = 0.7; // Z-axis value when standing (phone upright)
const LYING_THRESHOLD = 0.3; // Z-axis value when lying down (phone flat)

export default function BedLockScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const [phase, setPhase] = useState<'detecting' | 'lying' | 'situp' | 'stand' | 'unlocked'>('detecting');
  const [positionZ, setPositionZ] = useState(0);
  const [progress, setProgress] = useState(0);
  const [shameCount, setShameCount] = useState(0);
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Mock accelerometer data (in real app, use expo-sensors)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (phase === 'detecting' || phase === 'lying') {
      interval = setInterval(() => {
        // Simulate accelerometer readings
        // In real implementation: Accelerometer.addListener(data => setPositionZ(data.z))
        const mockZ = phase === 'lying' ? 0.1 : Math.random() * 0.5; // Simulate lying flat
        setPositionZ(mockZ);
        
        if (mockZ < LYING_THRESHOLD && phase === 'detecting') {
          setPhase('lying');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
      }, POSITION_CHECK_INTERVAL);
    } else if (phase === 'situp' || phase === 'stand') {
      interval = setInterval(() => {
        // Simulate sitting up
        const mockZ = 0.5 + Math.random() * 0.3; // Simulate upright position
        setPositionZ(mockZ);
        
        setProgress(prev => {
          const newProgress = mockZ > STANDING_THRESHOLD ? prev + 20 : Math.max(0, prev - 10);
          if (newProgress >= 100) {
            setPhase('unlocked');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          return Math.min(100, newProgress);
        });
      }, 500);
    }
    
    return () => clearInterval(interval);
  }, [phase]);

  // Pulsing animation for lying phase
  useEffect(() => {
    if (phase === 'lying') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      ).start();
      
      // Vibration pattern for shame
      const shameInterval = setInterval(() => {
        Vibration.vibrate([0, 500, 200, 500]);
        setShameCount(c => c + 1);
      }, 5000);
      
      return () => clearInterval(shameInterval);
    }
  }, [phase]);

  // Shake animation for encouragement
  useEffect(() => {
    if (phase === 'situp' || phase === 'stand') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(shakeAnim, { toValue: 5, duration: 100, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: -5, duration: 100, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [phase]);

  function handleForceUnlock() {
    Alert.alert(
      'Cheating?',
      'You\'re still lying down. Your future patients deserve better.',
      [
        { text: 'I\'ll Sit Up', style: 'cancel' },
        { text: 'I Give Up', style: 'destructive', onPress: () => navigation.goBack() }
      ]
    );
  }

  function handleStartSitUp() {
    setPhase('situp');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  if (phase === 'detecting') {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#6C63FF" />
          <Text style={styles.detectingText}>Detecting position...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'lying') {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
        <View style={styles.center}>
          <Text style={styles.shameEmoji}>😴</Text>
          <Text style={styles.shameTitle}>You're Lying Down</Text>
          <Text style={styles.shameSub}>
            {shameCount > 3 
              ? `Still in bed after ${shameCount} nudges. Your NEET exam doesn't care about your comfort.` 
              : "Phone detected horizontal position. Time to get up, Doctor."}
          </Text>
          
          <Animated.View style={[styles.lockCircle, { transform: [{ scale: pulseAnim }] }]}>
            <Text style={styles.lockEmoji}>🔒</Text>
            <Text style={styles.lockText}>LOCKED</Text>
          </Animated.View>
          
          <Text style={styles.positionText}>Z-Axis: {positionZ.toFixed(2)} (need &gt; 0.7)</Text>
          
          <TouchableOpacity style={styles.situpBtn} onPress={handleStartSitUp}>
            <Text style={styles.situpBtnText}>📱 I'm Sitting Up Now</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.cheatBtn} onPress={handleForceUnlock}>
            <Text style={styles.cheatBtnText}>Unlock Anyway (Cheating)</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'situp' || phase === 'stand') {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
        <Animated.View style={[styles.center, { transform: [{ translateX: shakeAnim }] }]}>
          <Text style={styles.progressEmoji}>💪</Text>
          <Text style={styles.progressTitle}>Keep Sitting Up!</Text>
          <Text style={styles.progressSub}>Hold phone upright to unlock</Text>
          
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          
          <Text style={styles.progressPercent}>{progress}%</Text>
          <Text style={styles.positionText}>Current: {positionZ.toFixed(2)}</Text>
          
          {progress > 50 && (
            <Text style={styles.encouragement}>Almost there! Stay upright!</Text>
          )}
        </Animated.View>
      </SafeAreaView>
    );
  }

  if (phase === 'unlocked') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.unlockedEmoji}>🎉</Text>
          <Text style={styles.unlockedTitle}>You're Upright!</Text>
          <Text style={styles.unlockedSub}>The hardest part is done. Now let's study.</Text>
          
          <TouchableOpacity 
            style={styles.startBtn} 
            onPress={() => navigation.navigate('Inertia')}
          >
            <Text style={styles.startBtnText}>Start with 1 Easy Card →</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.sprintBtn} 
            onPress={() => navigation.navigate('Session', { mood: 'distracted', mode: 'sprint', forcedMinutes: 5 })}
          >
            <Text style={styles.sprintBtnText}>⚡ 5-Min Sprint</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  
  detectingText: { color: '#9E9E9E', fontSize: 16, marginTop: 20 },
  
  shameEmoji: { fontSize: 80, marginBottom: 20 },
  shameTitle: { color: '#F44336', fontSize: 28, fontWeight: '900', marginBottom: 12, textAlign: 'center' },
  shameSub: { color: '#9E9E9E', fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 40, paddingHorizontal: 20 },
  
  lockCircle: { 
    width: 150, 
    height: 150, 
    borderRadius: 75, 
    backgroundColor: '#2A0A0A', 
    borderWidth: 3, 
    borderColor: '#F44336',
    alignItems: 'center', 
    justifyContent: 'center',
    marginBottom: 40 
  },
  lockEmoji: { fontSize: 48 },
  lockText: { color: '#F44336', fontSize: 14, fontWeight: '700', marginTop: 4 },
  
  positionText: { color: '#555', fontSize: 12, marginBottom: 30 },
  
  situpBtn: { 
    backgroundColor: '#6C63FF', 
    paddingHorizontal: 40, 
    paddingVertical: 18, 
    borderRadius: 16, 
    marginBottom: 16,
    minWidth: 250,
    alignItems: 'center'
  },
  situpBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  
  cheatBtn: { padding: 16 },
  cheatBtnText: { color: '#555', fontSize: 14, textDecorationLine: 'underline' },
  
  progressEmoji: { fontSize: 56, marginBottom: 16 },
  progressTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 8 },
  progressSub: { color: '#9E9E9E', fontSize: 14, marginBottom: 40 },
  
  progressBar: { 
    width: 250, 
    height: 20, 
    backgroundColor: '#2A2A38', 
    borderRadius: 10, 
    overflow: 'hidden',
    marginBottom: 16 
  },
  progressFill: { 
    height: '100%', 
    backgroundColor: '#6C63FF',
    borderRadius: 10 
  },
  progressPercent: { color: '#6C63FF', fontSize: 20, fontWeight: '800', marginBottom: 8 },
  
  encouragement: { color: '#4CAF50', fontSize: 16, fontWeight: '600', marginTop: 20 },
  
  unlockedEmoji: { fontSize: 72, marginBottom: 20 },
  unlockedTitle: { color: '#4CAF50', fontSize: 32, fontWeight: '900', marginBottom: 12 },
  unlockedSub: { color: '#9E9E9E', fontSize: 16, textAlign: 'center', marginBottom: 40, lineHeight: 24 },
  
  startBtn: { 
    backgroundColor: '#4CAF50', 
    paddingHorizontal: 40, 
    paddingVertical: 20, 
    borderRadius: 16, 
    marginBottom: 16,
    minWidth: 280,
    alignItems: 'center'
  },
  startBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  
  sprintBtn: { 
    backgroundColor: '#6C63FF', 
    paddingHorizontal: 40, 
    paddingVertical: 18, 
    borderRadius: 16,
    minWidth: 280,
    alignItems: 'center'
  },
  sprintBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
});
