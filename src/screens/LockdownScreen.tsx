import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, BackHandler, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

export default function LockdownScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const [timeLeft, setTimeLeft] = useState(route.params?.duration ?? 300); // 5 mins default
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    // Prevent physical back button on Android
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setAttempts(a => a + 1);
      return true; // block back
    });

    const timer = setInterval(() => {
      setTimeLeft((prev: number) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigation.navigate('Home');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      backHandler.remove();
      clearInterval(timer);
    };
  }, []);

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  
  const messages = [
    "No escape.",
    "Nice try. Get back to work.",
    "Did you really just try to leave?",
    "Your brain is looking for cheap dopamine. Denied.",
    "This is literally just 5 minutes of your life."
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.emoji}>🔒</Text>
        <Text style={styles.title}>LOCKDOWN MODE</Text>
        <Text style={styles.sub}>You committed to this block. You cannot leave.</Text>
        
        <Text style={styles.timer}>
          {mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
        </Text>

        {attempts > 0 && (
          <Text style={styles.shameText}>
            {messages[Math.min(attempts - 1, messages.length - 1)]}
          </Text>
        )}

        <TouchableOpacity 
          style={styles.studyBtn}
          onPress={() => navigation.navigate('Session', { mood: 'distracted', mode: 'sprint', forcedMinutes: Math.ceil(timeLeft/60) })}
        >
          <Text style={styles.studyBtnText}>Open Flashcards</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A0A' },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emoji: { fontSize: 64, marginBottom: 24 },
  title: { color: '#F44336', fontSize: 32, fontWeight: '900', letterSpacing: 2, marginBottom: 12, textAlign: 'center' },
  sub: { color: '#9E9E9E', fontSize: 16, textAlign: 'center', marginBottom: 48, lineHeight: 24 },
  timer: { color: '#fff', fontSize: 72, fontWeight: '900', fontVariant: ['tabular-nums'], marginBottom: 48 },
  shameText: { color: '#FF9800', fontSize: 16, fontWeight: '700', textAlign: 'center', marginBottom: 32, fontStyle: 'italic' },
  studyBtn: { backgroundColor: '#6C63FF', width: '100%', padding: 20, borderRadius: 16, alignItems: 'center' },
  studyBtnText: { color: '#fff', fontSize: 18, fontWeight: '800', textTransform: 'uppercase' }
});
