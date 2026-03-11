const fs = require('fs');

// 1. We need an aggressive "Strict Mode" that literally blocks the user from leaving the app or doing anything else
// Let's create a new component or screen for "Lockdown"
const lockdownScreen = `import React, { useEffect, useState } from 'react';
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
`;

fs.writeFileSync('../src/screens/LockdownScreen.tsx', lockdownScreen);

// 2. Add to navigation
let nav = fs.readFileSync('../src/navigation/RootNavigator.tsx', 'utf-8');
if (!nav.includes('LockdownScreen')) {
  nav = nav.replace(
    "import AppNavigator from './AppNavigator';",
    "import AppNavigator from './AppNavigator';\nimport LockdownScreen from '../screens/LockdownScreen';"
  );
  nav = nav.replace(
    "</Stack.Navigator>",
    "  <Stack.Screen name=\"Lockdown\" component={LockdownScreen} options={{ gestureEnabled: false, presentation: 'fullScreenModal' }} />\n    </Stack.Navigator>"
  );
  fs.writeFileSync('../src/navigation/RootNavigator.tsx', nav);
}

let navTypes = fs.readFileSync('../src/navigation/types.ts', 'utf-8');
if (!navTypes.includes('Lockdown:')) {
  navTypes = navTypes.replace(
    "export type RootStackParamList = {",
    "export type RootStackParamList = {\n  Lockdown: { duration: number };"
  );
  fs.writeFileSync('../src/navigation/types.ts', navTypes);
}

// 3. Let's make the "Inertia" button even more aggressive by adding a "Lockdown" button to Home
let home = fs.readFileSync('../src/screens/HomeScreen.tsx', 'utf-8');
const doomButton = `
        <TouchableOpacity 
          style={{ marginHorizontal: 16, marginTop: 16, backgroundColor: '#2A0505', padding: 20, borderRadius: 16, borderWidth: 2, borderColor: '#F44336', alignItems: 'center' }} 
          onPress={() => navigation.getParent()?.navigate('Lockdown', { duration: 300 })}
          activeOpacity={0.9}
        >
          <Text style={{ fontSize: 32, marginBottom: 8 }}>⛓️</Text>
          <Text style={{ color: '#F44336', fontWeight: '900', fontSize: 18, textTransform: 'uppercase', letterSpacing: 1 }}>Force 5-Min Lockdown</Text>
          <Text style={{ color: '#FF9800', fontSize: 12, marginTop: 8, textAlign: 'center' }}>Blocks back button. Shames you if you try to leave.</Text>
        </TouchableOpacity>
`;

if (!home.includes('Force 5-Min Lockdown')) {
  home = home.replace(
    "{/* Boss Battle Entry */}",
    doomButton + "\\n        {/* Boss Battle Entry */}"
  );
  fs.writeFileSync('../src/screens/HomeScreen.tsx', home);
}

console.log('Added Aggressive Lockdown Mode');
