import React, { useEffect, useState } from 'react';
import { StyleSheet, BackHandler, StatusBar } from 'react-native';
import { confirmDestructive } from '../components/dialogService';
import LinearText from '../components/primitives/LinearText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import * as Haptics from 'expo-haptics';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { linearTheme as n } from '../theme/linearTheme';
import LinearButton from '../components/primitives/LinearButton';

export default function LockdownScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Lockdown'>>();
  const [timeLeft, setTimeLeft] = useState(route.params.duration ?? 300); // 5 mins default
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    // Prevent physical back button on Android
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setAttempts((a) => a + 1);
      return true; // block back
    });

    const timer = setInterval(() => {
      setTimeLeft((prev: number) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigation.navigate('Tabs');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      backHandler.remove();
      clearInterval(timer);
    };
  }, [navigation]);

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;

  const messages = [
    "Stay with it. You're almost there.",
    'Your future self thanks you for this discipline.',
    "The timer's ticking. Make it count.",
    'Focus builds momentum. Keep going.',
    'You chose this. Honor that choice.',
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ResponsiveContainer style={styles.container}>
        <LinearText style={styles.emoji}>🔒</LinearText>
        <LinearText style={styles.title}>FOCUS TIMER</LinearText>
        <LinearText style={styles.sub}>Stay focused for this block. You've got this.</LinearText>

        <LinearText style={styles.timer}>
          {mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
        </LinearText>

        {attempts > 0 && (
          <LinearText style={styles.shameText}>
            {messages[Math.min(attempts - 1, messages.length - 1)]}
          </LinearText>
        )}

        <LinearButton
          variant="secondary"
          style={styles.studyBtn}
          onPress={() =>
            navigation.navigate('Tabs', {
              screen: 'HomeTab',
              params: {
                screen: 'Session',
                params: {
                  mood: 'distracted',
                  mode: 'sprint',
                  forcedMinutes: Math.ceil(timeLeft / 60),
                },
              },
            })
          }
          accessibilityRole="button"
          accessibilityLabel={`Start ${Math.ceil(timeLeft / 60)} minute sprint`}
          label={`Start ${Math.ceil(timeLeft / 60)}-min Sprint`}
        />

        <LinearButton
          variant="ghost"
          style={styles.exitBtn}
          textStyle={styles.exitBtnText}
          onPress={async () => {
            const ok = await confirmDestructive(
              'Give up?',
              'Are you sure you want to break the lockdown?',
            );
            if (ok) navigation.navigate('Tabs');
          }}
          accessibilityRole="button"
          accessibilityLabel="Force exit lockdown"
          label="Force Exit"
        />
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emoji: { fontSize: 64, marginBottom: 24 },
  title: {
    color: n.colors.warning,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 12,
    textAlign: 'center',
  },
  sub: {
    color: n.colors.textMuted,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 48,
    lineHeight: 24,
  },
  timer: {
    color: n.colors.textPrimary,
    fontSize: 72,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    marginBottom: 48,
  },
  shameText: {
    color: n.colors.warning,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 32,
    fontStyle: 'italic',
  },
  studyBtn: {
    width: '100%',
    minHeight: 60,
    marginBottom: 24,
  },
  exitBtn: { paddingVertical: 12, paddingHorizontal: 8, minHeight: 0 },
  exitBtnText: { textDecorationLine: 'underline' },
});
