import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useKeepAwake } from 'expo-keep-awake';
import { Accelerometer } from 'expo-sensors';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

const { } = {};

type Nav = NativeStackNavigationProp<RootStackParamList, 'SleepMode'>;

function buildAlarmDate(hour: number, minute: number): Date {
  const now = new Date();
  const target = new Date();
  target.setHours(hour, minute, 0, 0);
  // If chosen time is in the past today, push to tomorrow
  if (target <= now) target.setDate(target.getDate() + 1);
  return target;
}

export default function SleepModeScreen() {
  useKeepAwake();
  const navigation = useNavigation<Nav>();

  const [currentTime, setCurrentTime] = useState(new Date());
  const [alarmTime, setAlarmTime] = useState<Date | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [alarmRinging, setAlarmRinging] = useState(false);
  const [movementCount, setMovementCount] = useState(0);
  const [snoozed, setSnoozed] = useState(false);

  // Time picker state — default to 8h from now
  const [pickHour, setPickHour] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 8);
    return d.getHours();
  });
  const [pickMinute, setPickMinute] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 8);
    return Math.round(d.getMinutes() / 15) * 15 % 60;
  });

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const soundRef = useRef<Audio.Sound | null>(null);

  // Update clock every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000 * 60);
    return () => clearInterval(timer);
  }, []);

  // Sleep tracking with Accelerometer
  useEffect(() => {
    let subscription: any;
    if (isTracking) {
      Accelerometer.setUpdateInterval(1000);
      let lastPoint = { x: 0, y: 0, z: 0 };
      subscription = Accelerometer.addListener(data => {
        const dx = Math.abs(data.x - lastPoint.x);
        const dy = Math.abs(data.y - lastPoint.y);
        const dz = Math.abs(data.z - lastPoint.z);
        if (dx > 0.3 || dy > 0.3 || dz > 0.3) {
          setMovementCount(c => c + 1);
        }
        lastPoint = data;
      });
    } else {
      subscription?.remove();
    }
    return () => subscription?.remove();
  }, [isTracking]);

  // Alarm logic
  useEffect(() => {
    if (!isTracking || !alarmTime || alarmRinging) return;

    const interval = setInterval(() => {
      const now = new Date();
      const timeDiffMs = alarmTime.getTime() - now.getTime();
      const timeDiffMins = timeDiffMs / (1000 * 60);

      if (timeDiffMins <= 30 && timeDiffMins > 0) {
        if (movementCount > 5) triggerAlarm();
      } else if (timeDiffMins <= 0) {
        triggerAlarm();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isTracking, alarmTime, alarmRinging, movementCount]);

  async function triggerAlarm() {
    setAlarmRinging(true);
    setIsTracking(false);

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 3000,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();

    const interval = setInterval(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, 1000);

    (soundRef as any).vibrateInterval = interval;
  }

  function stopAlarm() {
    if ((soundRef as any).vibrateInterval) {
      clearInterval((soundRef as any).vibrateInterval);
    }
    setAlarmRinging(false);
    navigation.replace('WakeUp');
  }

  function snoozeAlarm() {
    if ((soundRef as any).vibrateInterval) {
      clearInterval((soundRef as any).vibrateInterval);
    }
    const newAlarm = new Date(Date.now() + 10 * 60 * 1000);
    setAlarmTime(newAlarm);
    setAlarmRinging(false);
    setIsTracking(true);
    setMovementCount(0);
    setSnoozed(true);
    fadeAnim.setValue(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  function startTracking() {
    const target = buildAlarmDate(pickHour, pickMinute);
    setAlarmTime(target);
    setIsTracking(true);
    setMovementCount(0);
    setSnoozed(false);
  }

  function stopTracking() {
    setIsTracking(false);
    setAlarmTime(null);
  }

  function adjustHour(delta: number) {
    setPickHour(h => (h + delta + 24) % 24);
  }

  function adjustMinute(delta: number) {
    setPickMinute(m => (m + delta + 60) % 60);
  }

  const timeString = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const alarmLabel = alarmTime
    ? alarmTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : `${pickHour.toString().padStart(2, '0')}:${pickMinute.toString().padStart(2, '0')}`;

  if (alarmRinging) {
    return (
      <View style={styles.alarmContainer}>
        <Animated.View style={[styles.alarmOverlay, { opacity: fadeAnim }]} />
        <Text style={styles.alarmTime}>{timeString}</Text>
        <Text style={styles.alarmTitle}>Good Morning, Doctor.</Text>
        <Text style={styles.alarmSub}>Time to rise and build some momentum.</Text>

        <TouchableOpacity style={styles.stopBtn} onPress={stopAlarm} activeOpacity={0.8}>
          <Text style={styles.stopBtnText}>I'M AWAKE</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.snoozeBtn} onPress={snoozeAlarm} activeOpacity={0.8}>
          <Text style={styles.snoozeBtnText}>💤 Snooze 10 min</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.clock}>{timeString}</Text>

        {isTracking ? (
          <View style={styles.trackingInfo}>
            <Text style={styles.trackingText}>
              {snoozed ? 'Snoozed 10 min 💤' : 'Nightstand Mode Active'}
            </Text>
            <Text style={styles.alarmText}>
              Alarm set for {alarmLabel}
            </Text>
            <Text style={styles.trackingSub}>Screen will stay on. Place face down.</Text>
          </View>
        ) : (
          <View style={styles.setupInfo}>
            <Text style={styles.setupText}>
              Set phone on nightstand to track sleep and wake up in a light sleep phase.
            </Text>

            {/* Wake-time picker */}
            <View style={styles.pickerRow}>
              <View style={styles.pickerUnit}>
                <TouchableOpacity style={styles.pickerBtn} onPress={() => adjustHour(1)}>
                  <Text style={styles.pickerBtnText}>▲</Text>
                </TouchableOpacity>
                <Text style={styles.pickerValue}>{pickHour.toString().padStart(2, '0')}</Text>
                <TouchableOpacity style={styles.pickerBtn} onPress={() => adjustHour(-1)}>
                  <Text style={styles.pickerBtnText}>▼</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.pickerColon}>:</Text>
              <View style={styles.pickerUnit}>
                <TouchableOpacity style={styles.pickerBtn} onPress={() => adjustMinute(15)}>
                  <Text style={styles.pickerBtnText}>▲</Text>
                </TouchableOpacity>
                <Text style={styles.pickerValue}>{pickMinute.toString().padStart(2, '0')}</Text>
                <TouchableOpacity style={styles.pickerBtn} onPress={() => adjustMinute(-15)}>
                  <Text style={styles.pickerBtnText}>▼</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.pickerLabel}>Wake at</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.toggleBtn, isTracking && styles.toggleBtnActive]}
          onPress={isTracking ? stopTracking : startTracking}
        >
          <Text style={styles.toggleBtnText}>
            {isTracking ? 'Cancel Alarm' : 'Start Sleep Tracking'}
          </Text>
        </TouchableOpacity>

        {!isTracking && (
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>Exit</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  clock: { color: '#333', fontSize: 80, fontWeight: '900', fontVariant: ['tabular-nums'], marginBottom: 40 },

  setupInfo: { marginBottom: 40, alignItems: 'center' },
  setupText: { color: '#555', textAlign: 'center', fontSize: 14, lineHeight: 20, marginBottom: 24 },

  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  pickerUnit: { alignItems: 'center' },
  pickerBtn: { padding: 8 },
  pickerBtnText: { color: '#6C63FF', fontSize: 18, fontWeight: '700' },
  pickerValue: { color: '#fff', fontSize: 36, fontWeight: '900', fontVariant: ['tabular-nums'], minWidth: 56, textAlign: 'center' },
  pickerColon: { color: '#fff', fontSize: 36, fontWeight: '900', marginBottom: 8 },
  pickerLabel: { color: '#555', fontSize: 12, textAlign: 'center' },

  trackingInfo: { alignItems: 'center', marginBottom: 40 },
  trackingText: { color: '#6C63FF', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  alarmText: { color: '#9E9E9E', fontSize: 14, marginBottom: 4 },
  trackingSub: { color: '#444', fontSize: 12 },

  toggleBtn: { backgroundColor: '#1A1A24', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 16, borderWidth: 1, borderColor: '#333' },
  toggleBtnActive: { backgroundColor: '#2A0A0A', borderColor: '#F44336' },
  toggleBtnText: { color: '#9E9E9E', fontWeight: '800', fontSize: 16 },

  backBtn: { marginTop: 20, padding: 12 },
  backBtnText: { color: '#555', fontSize: 14 },

  alarmContainer: { flex: 1, backgroundColor: '#0F0F14', justifyContent: 'center', alignItems: 'center', padding: 24 },
  alarmOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#6C63FF22' },
  alarmTime: { color: '#fff', fontSize: 64, fontWeight: '900', marginBottom: 16 },
  alarmTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 8 },
  alarmSub: { color: '#9E9E9E', fontSize: 16, textAlign: 'center', marginBottom: 48 },

  stopBtn: { backgroundColor: '#6C63FF', paddingHorizontal: 40, paddingVertical: 20, borderRadius: 20, elevation: 8, shadowColor: '#6C63FF', shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, marginBottom: 16 },
  stopBtnText: { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: 2 },
  snoozeBtn: { paddingHorizontal: 32, paddingVertical: 14, borderRadius: 16, borderWidth: 1, borderColor: '#444' },
  snoozeBtnText: { color: '#9E9E9E', fontSize: 16, fontWeight: '700' },
});
