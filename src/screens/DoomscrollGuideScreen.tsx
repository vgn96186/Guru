import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { scheduleHarassment, requestNotificationPermissions } from '../services/notificationService';

export default function DoomscrollGuideScreen() {
  const navigation = useNavigation();
  const [harassmentActive, setHarassmentActive] = useState(false);

  async function activateHarassment() {
    const hasPerm = await requestNotificationPermissions();
    if (!hasPerm) {
      Alert.alert('Permissions Needed', 'You need to enable notifications to use Harassment Mode.');
      return;
    }
    
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await scheduleHarassment();
    setHarassmentActive(true);
    
    Alert.alert(
      'Harassment Mode Activated 🚨',
      'If you close this app and go doomscroll, I will start blowing up your phone with notifications every 3 minutes starting soon. The only way to stop it is to come back and study.',
      [{ text: 'I understand the consequences' }]
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.emoji}>📱</Text>
        <Text style={styles.title}>The Ultimate Fix</Text>
        <Text style={styles.sub}>
          If your brain refuses to open this app when you're procrastinating, you need to force the issue.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>🚨 Feature 1: Harassment Mode</Text>
          <Text style={styles.cardText}>
            About to open Instagram or YouTube? Tap the button below first. The app will schedule 10 highly aggressive, shaming push notifications to fire every 3 minutes while you're scrolling.
          </Text>
          <Text style={styles.cardText}>
            Opening the app again cancels the bombardment.
          </Text>
          <TouchableOpacity 
            style={[styles.btn, harassmentActive && styles.btnActive]} 
            onPress={activateHarassment}
            disabled={harassmentActive}
          >
            <Text style={styles.btnText}>
              {harassmentActive ? '💣 Bombardment Armed' : 'Activate Harassment Mode'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>🔗 Feature 2: App Hijacking (OS Level)</Text>
          <Text style={styles.cardText}>
            You can use your phone's built-in automation to automatically open this study app EVERY TIME you try to open a distraction app.
          </Text>
          
          {Platform.OS === 'ios' ? (
            <View style={styles.osBox}>
              <Text style={styles.osTitle}>For iOS (Shortcuts App):</Text>
              <Text style={styles.osStep}>1. Open the 'Shortcuts' app.</Text>
              <Text style={styles.osStep}>2. Tap 'Automation' → '+' → 'App'.</Text>
              <Text style={styles.osStep}>3. Choose 'Is Opened' and select Instagram, TikTok, etc.</Text>
              <Text style={styles.osStep}>4. Tap 'Next' → 'Add Action' → 'Open App'.</Text>
              <Text style={styles.osStep}>5. Select 'NEET Study' as the app to open.</Text>
              <Text style={styles.osStep}>6. Turn OFF 'Ask Before Running'.</Text>
            </View>
          ) : (
            <View style={styles.osBox}>
              <Text style={styles.osTitle}>For Android (Modes & Routines):</Text>
              <Text style={styles.osStep}>1. Go to Settings → 'Modes and Routines'.</Text>
              <Text style={styles.osStep}>2. Create a new Routine (+).</Text>
              <Text style={styles.osStep}>3. If condition: 'App opened' (Select Instagram/YouTube).</Text>
              <Text style={styles.osStep}>4. Then action: 'Open an app or do an app action'.</Text>
              <Text style={styles.osStep}>5. Select this app ('NEET Study').</Text>
              <Text style={styles.osStep}>Now you literally cannot open Instagram without passing through this app first.</Text>
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Got it, take me back</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0A0A' },
  container: { padding: 24, alignItems: 'center' },
  emoji: { fontSize: 56, marginBottom: 16 },
  title: { color: '#F44336', fontSize: 28, fontWeight: '900', marginBottom: 12, textAlign: 'center' },
  sub: { color: '#9E9E9E', fontSize: 16, textAlign: 'center', marginBottom: 32, lineHeight: 24 },
  
  card: { backgroundColor: '#1A1A24', width: '100%', padding: 20, borderRadius: 16, marginBottom: 24, borderWidth: 1, borderColor: '#333' },
  cardTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 12 },
  cardText: { color: '#ccc', fontSize: 14, lineHeight: 22, marginBottom: 16 },
  
  btn: { backgroundColor: '#F44336', padding: 16, borderRadius: 12, alignItems: 'center' },
  btnActive: { backgroundColor: '#4CAF50' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  
  osBox: { backgroundColor: '#2A2A38', padding: 16, borderRadius: 12 },
  osTitle: { color: '#6C63FF', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  osStep: { color: '#E0E0E0', fontSize: 14, marginBottom: 6, lineHeight: 20 },
  
  backBtn: { marginTop: 16, padding: 16 },
  backBtnText: { color: '#666', fontSize: 16, fontWeight: '600' }
});
