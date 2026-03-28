import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useKeepAwake } from 'expo-keep-awake';
import { Accelerometer } from 'expo-sensors';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { theme } from '../constants/theme';
import { generateWakeUpMessage } from '../services/aiService';

type Nav = NativeStackNavigationProp<RootStackParamList, 'SleepMode'>;

interface AccelerometerData {
  x: number;
  y: number;
  z: number;
}

interface Subscription {
  remove: () => void;
}

export default function SleepModeScreen() {
  useKeepAwake(); // Keep screen on all night
  const navigation = useNavigation<Nav>();

  const [currentTime, setCurrentTime] = useState(new Date());
  const [alarmTime, setAlarmTime] = useState<Date | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [alarmRinging, setAlarmRinging] = useState(false);
  const [movementCount, setMovementCount] = useState(0);
  const [notifId, setNotifId] = useState<string | null>(null);

  // Custom time picker states
  const [hoursToAdd, setHoursToAdd] = useState(8);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const soundRef = useRef<Audio.Sound | null>(null);
  const vibrateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep the nightstand clock accurate to the actual minute boundary.
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const triggerAlarm = useCallback(async () => {
    setAlarmRinging(true);
    setIsTracking(false);

    // Fade in screen
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 3000,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();

    // Vibrate and maybe play sound
    const interval = setInterval(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, 1000);

    vibrateIntervalRef.current = interval;
  }, [fadeAnim]);

  // Sleep tracking with Accelerometer
  useEffect(() => {
    let subscription: Subscription | undefined;
    if (isTracking) {
      Accelerometer.setUpdateInterval(1000); // Check once a second
      let lastPoint = { x: 0, y: 0, z: 0 };

      subscription = Accelerometer.addListener((data: AccelerometerData) => {
        // Simple movement detection: if acceleration change is significant
        const dx = Math.abs(data.x - lastPoint.x);
        const dy = Math.abs(data.y - lastPoint.y);
        const dz = Math.abs(data.z - lastPoint.z);

        if (dx > 0.3 || dy > 0.3 || dz > 0.3) {
          setMovementCount((c) => c + 1);
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

      // Wake up window: 30 minutes before alarm
      // If movement is detected in the 30-min window, wake them up (light sleep phase)
      if (timeDiffMins <= 30 && timeDiffMins > 0) {
        if (movementCount > 5) {
          // 5 significant movements in the window
          triggerAlarm();
        }
      }
      // Hard alarm time
      else if (timeDiffMins <= 0) {
        triggerAlarm();
      }
    }, 5000); // Check every 5s

    return () => clearInterval(interval);
  }, [isTracking, alarmTime, alarmRinging, movementCount, triggerAlarm]);

  async function stopAlarm() {
    if (vibrateIntervalRef.current) {
      clearInterval(vibrateIntervalRef.current);
      vibrateIntervalRef.current = null;
    }
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    setAlarmRinging(false);
    navigation.replace('WakeUp');
  }

  async function handleSnooze() {
    if (vibrateIntervalRef.current) {
      clearInterval(vibrateIntervalRef.current);
      vibrateIntervalRef.current = null;
    }
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    setAlarmRinging(false);

    // Snooze for 9 minutes
    const snoozeTarget = new Date();
    snoozeTarget.setMinutes(snoozeTarget.getMinutes() + 9);
    setAlarmTime(snoozeTarget);
    setIsTracking(true);
    setMovementCount(0); // Reset movements for snooze period
    fadeAnim.setValue(0);
  }

  async function toggleTracking() {
    if (!isTracking) {
      await Notifications.requestPermissionsAsync();

      const target = new Date();
      target.setHours(target.getHours() + hoursToAdd);
      setAlarmTime(target);
      setIsTracking(true);
      setMovementCount(0);

      const { title, body } = await generateWakeUpMessage();

      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { screen: 'WakeUp' },
          sound: 'default',
        },
        trigger: { date: target } as unknown as Notifications.NotificationTriggerInput,
      });
      setNotifId(id);
    } else {
      setIsTracking(false);
      setAlarmTime(null);
      if (notifId) {
        await Notifications.cancelScheduledNotificationAsync(notifId);
        setNotifId(null);
      }
    }
  }

  const timeString = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateString = currentTime.toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
  const hoursLabel = `${hoursToAdd} ${hoursToAdd === 1 ? 'hr' : 'hrs'}`;
  const projectedAlarmTime = new Date(currentTime.getTime() + hoursToAdd * 60 * 60 * 1000);
  const projectedAlarmLabel = projectedAlarmTime.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  const activeAlarmLabel = alarmTime?.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  const remainingMs = alarmTime ? Math.max(0, alarmTime.getTime() - currentTime.getTime()) : 0;
  const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
  const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
  const remainingLabel =
    alarmTime && isTracking
      ? `${remainingHours > 0 ? `${remainingHours}h ` : ''}${remainingMinutes}m left`
      : null;

  if (alarmRinging) {
    return (
      <View style={styles.alarmContainer}>
        <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
        <Animated.View style={[styles.alarmOverlay, { opacity: fadeAnim }]} />
        <Text style={styles.alarmTime}>{timeString}</Text>
        <Text style={styles.alarmTitle}>Good Morning, Doctor.</Text>
        <Text style={styles.alarmSub}>Time to rise and build some momentum.</Text>

        <TouchableOpacity style={styles.stopBtn} onPress={stopAlarm} activeOpacity={0.8}>
          <Text style={styles.stopBtnText}>I'M AWAKE</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.snoozeBtn} onPress={handleSnooze} activeOpacity={0.8}>
          <Text style={styles.snoozeBtnText}>Snooze (9 min)</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <ResponsiveContainer style={styles.container}>
        <View style={styles.topSection}>
          <View style={styles.modeBadge}>
            <View
              style={[
                styles.modeDot,
                { backgroundColor: isTracking ? theme.colors.success : theme.colors.primaryLight },
              ]}
            />
            <Text style={styles.modeBadgeText}>
              {isTracking ? 'Nightstand Active' : 'Nightstand Mode'}
            </Text>
          </View>
          <Text style={styles.dateText}>{dateString}</Text>
          <Text style={styles.clock}>{timeString}</Text>
        </View>

        <View style={styles.bottomSection}>
          {isTracking ? (
            <View style={styles.infoCard}>
              <Text style={styles.infoEyebrow}>WAKE PLAN</Text>
              <Text style={styles.infoTitle}>Alarm at {activeAlarmLabel}</Text>
              <View style={styles.infoPillRow}>
                {remainingLabel ? (
                  <View style={styles.infoPill}>
                    <Text style={styles.infoPillText}>{remainingLabel}</Text>
                  </View>
                ) : null}
                <View style={styles.infoPill}>
                  <Text style={styles.infoPillText}>{movementCount} movements tracked</Text>
                </View>
              </View>
              <Text style={styles.infoBody}>
                Screen stays awake all night. Leave the phone on your nightstand or face down so
                movement detection can catch a lighter sleep phase.
              </Text>
            </View>
          ) : (
            <View style={styles.infoCard}>
              <Text style={styles.infoEyebrow}>WAKE PLAN</Text>
              <Text style={styles.infoTitle}>Wake me in</Text>
              <View style={styles.timePickerRow}>
                <TouchableOpacity
                  style={styles.timePickerBtn}
                  onPress={() => setHoursToAdd(Math.max(1, hoursToAdd - 1))}
                  accessibilityRole="button"
                  accessibilityLabel="Decrease wake interval"
                >
                  <Text style={styles.timePickerText}>-</Text>
                </TouchableOpacity>
                <Text style={styles.timePickerVal}>{hoursLabel}</Text>
                <TouchableOpacity
                  style={styles.timePickerBtn}
                  onPress={() => setHoursToAdd(Math.min(12, hoursToAdd + 1))}
                  accessibilityRole="button"
                  accessibilityLabel="Increase wake interval"
                >
                  <Text style={styles.timePickerText}>+</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.infoBody}>Alarm will ring at {projectedAlarmLabel}</Text>
              <Text style={styles.infoHint}>
                Best for bedside charging with the phone left still and visible.
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.toggleBtn, isTracking && styles.toggleBtnActive]}
            onPress={toggleTracking}
            activeOpacity={0.85}
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
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' }, // Pure black for OLED screens
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 28,
  },
  topSection: {
    alignItems: 'center',
    marginTop: 16,
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1F2130',
    backgroundColor: '#101018',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 14,
  },
  modeDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  modeBadgeText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  dateText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.3,
    marginBottom: 18,
  },
  clock: {
    color: theme.colors.textPrimary,
    fontSize: 88,
    lineHeight: 94,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    letterSpacing: -3,
  },
  bottomSection: {
    width: '100%',
    alignItems: 'center',
  },
  infoCard: {
    width: '100%',
    backgroundColor: '#0E1018',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1D2130',
    paddingHorizontal: 20,
    paddingVertical: 22,
    alignItems: 'center',
    marginBottom: 18,
  },
  infoEyebrow: {
    color: theme.colors.primaryLight,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  infoTitle: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    textAlign: 'center',
  },
  infoPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    marginBottom: 14,
  },
  infoPill: {
    borderRadius: 999,
    backgroundColor: '#151928',
    borderWidth: 1,
    borderColor: '#23283A',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  infoPillText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  infoBody: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  infoHint: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 8,
  },
  timePickerRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  timePickerBtn: {
    backgroundColor: '#1A1A24',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  timePickerText: { color: '#fff', fontSize: 24, fontWeight: '400' },
  timePickerVal: {
    color: '#6C63FF',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 28,
    minWidth: 88,
    paddingHorizontal: 8,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },

  toggleBtn: {
    width: '100%',
    backgroundColor: '#1A1A24',
    paddingHorizontal: 32,
    paddingVertical: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  toggleBtnActive: { backgroundColor: '#2A0A0A', borderColor: '#F44336' },
  toggleBtnText: {
    color: theme.colors.textSecondary,
    fontWeight: '800',
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 0.2,
  },

  backBtn: { marginTop: 20, padding: 12 },
  backBtnText: { color: theme.colors.textSecondary, fontSize: 14, lineHeight: 20 },

  alarmContainer: {
    flex: 1,
    backgroundColor: '#0F0F14',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  alarmOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#6C63FF22' },
  alarmTime: { color: '#fff', fontSize: 64, fontWeight: '900', marginBottom: 16 },
  alarmTitle: { color: '#fff', fontSize: 24, lineHeight: 30, fontWeight: '800', marginBottom: 8 },
  alarmSub: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 60,
  },

  stopBtn: {
    backgroundColor: '#6C63FF',
    paddingHorizontal: 40,
    paddingVertical: 20,
    borderRadius: 20,
    elevation: 8,
    shadowColor: '#6C63FF',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    marginBottom: 20,
  },
  stopBtnText: { color: '#fff', fontSize: 20, lineHeight: 26, fontWeight: '900', letterSpacing: 2 },
  snoozeBtn: {
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: '#1A1A24',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  snoozeBtnText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
});
