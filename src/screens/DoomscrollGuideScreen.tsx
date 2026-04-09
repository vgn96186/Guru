import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Platform, StatusBar } from 'react-native';
import LinearText from '../components/primitives/LinearText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import * as Haptics from 'expo-haptics';
import {
  scheduleHarassment,
  requestNotificationPermissions,
  cancelAllNotifications,
} from '../services/notificationService';
import { showWarning, showInfo } from '../components/dialogService';
import { profileRepository } from '../db/repositories';
import { useAppStore } from '../store/useAppStore';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { linearTheme as n } from '../theme/linearTheme';
import type { HarassmentTone } from '../types';

const TONE_OPTIONS: { tone: HarassmentTone; icon: string; label: string }[] = [
  { tone: 'shame', icon: '😈', label: 'Shame' },
  { tone: 'motivational', icon: '💪', label: 'Motivational' },
  { tone: 'tough_love', icon: '🎯', label: 'Tough Love' },
];

export default function DoomscrollGuideScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const profile = useAppStore((s) => s.profile);
  const refreshProfile = useAppStore((s) => s.refreshProfile);
  const [harassmentActive, setHarassmentActive] = useState(false);
  const [selectedTone, setSelectedTone] = useState<HarassmentTone>(
    profile?.harassmentTone ?? 'shame',
  );

  async function handleToneSelect(tone: HarassmentTone) {
    setSelectedTone(tone);
    await profileRepository.updateProfile({ harassmentTone: tone });
    await refreshProfile();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  async function activateHarassment() {
    const hasPerm = await requestNotificationPermissions();
    if (!hasPerm) {
      showWarning('Permissions Needed', 'You need to enable notifications to use Harassment Mode.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await scheduleHarassment(selectedTone);
    setHarassmentActive(true);

    showInfo(
      'Harassment Mode Activated 🚨',
      'If you close this app and go doomscroll, I will start blowing up your phone with notifications every 3 minutes starting soon. The only way to stop it is to come back and study.',
    );
  }

  async function deactivateHarassment() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await cancelAllNotifications();
    setHarassmentActive(false);
    showInfo('Deactivated', 'Harassment mode has been turned off.');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ScrollView contentContainerStyle={styles.container}>
        <ResponsiveContainer style={{ alignItems: 'center' }}>
          <LinearText style={styles.emoji}>📱</LinearText>
          <LinearText style={styles.title}>The Ultimate Fix</LinearText>
          <LinearText style={styles.sub}>
            If your brain refuses to open this app when you're procrastinating, you need to force
            the issue.
          </LinearText>

          <View style={styles.card}>
            <LinearText style={styles.cardTitle}>🚨 Feature 1: Harassment Mode</LinearText>
            <LinearText style={styles.cardText}>
              About to open Instagram or YouTube? Tap the button below first. The app will schedule
              10 push notifications to fire every 3 minutes while you're scrolling.
            </LinearText>
            <LinearText style={styles.cardText}>
              Opening the app again cancels the bombardment.
            </LinearText>

            {/* Tone selector */}
            <LinearText style={styles.toneLabel}>Notification Tone:</LinearText>
            <View style={styles.toneRow}>
              {TONE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.tone}
                  style={[styles.toneBtn, selectedTone === opt.tone && styles.toneBtnActive]}
                  onPress={() => handleToneSelect(opt.tone)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Notification tone: ${opt.label}`}
                  accessibilityState={{ selected: selectedTone === opt.tone }}
                >
                  <LinearText style={styles.toneIcon}>{opt.icon}</LinearText>
                  <LinearText
                    style={[
                      styles.toneBtnText,
                      selectedTone === opt.tone && styles.toneBtnTextActive,
                    ]}
                  >
                    {opt.label}
                  </LinearText>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.btn, harassmentActive && styles.btnActive]}
              onPress={activateHarassment}
              disabled={harassmentActive}
              accessibilityRole="button"
              accessibilityLabel={
                harassmentActive ? 'Bombardment armed' : 'Activate harassment mode'
              }
              accessibilityState={{ disabled: harassmentActive }}
            >
              <LinearText style={styles.btnText}>
                {harassmentActive ? '💣 Bombardment Armed' : 'Activate Harassment Mode'}
              </LinearText>
            </TouchableOpacity>

            {harassmentActive && (
              <TouchableOpacity
                style={styles.deactivateBtn}
                onPress={deactivateHarassment}
                accessibilityRole="button"
                accessibilityLabel="Deactivate harassment mode"
              >
                <LinearText style={styles.deactivateBtnText}>Deactivate Harassment Mode</LinearText>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.card}>
            <LinearText style={styles.cardTitle}>🔗 Feature 2: App Hijacking (OS Level)</LinearText>
            <LinearText style={styles.cardText}>
              You can use your phone's built-in automation to automatically open this study app
              EVERY TIME you try to open a distraction app.
            </LinearText>

            {Platform.OS === 'ios' ? (
              <View style={styles.osBox}>
                <LinearText style={styles.osTitle}>For iOS (Shortcuts App):</LinearText>
                <LinearText style={styles.osStep}>1. Open the 'Shortcuts' app.</LinearText>
                <LinearText style={styles.osStep}>2. Tap 'Automation' → '+' → 'App'.</LinearText>
                <LinearText style={styles.osStep}>
                  3. Choose 'Is Opened' and select Instagram, TikTok, etc.
                </LinearText>
                <LinearText style={styles.osStep}>
                  4. Tap 'Next' → 'Add Action' → 'Open App'.
                </LinearText>
                <LinearText style={styles.osStep}>
                  5. Select 'NEET Study' as the app to open.
                </LinearText>
                <LinearText style={styles.osStep}>6. Turn OFF 'Ask Before Running'.</LinearText>
              </View>
            ) : (
              <View style={styles.osBox}>
                <LinearText style={styles.osTitle}>For Android (Modes & Routines):</LinearText>
                <LinearText style={styles.osStep}>
                  1. Go to Settings → 'Modes and Routines'.
                </LinearText>
                <LinearText style={styles.osStep}>2. Create a new Routine (+).</LinearText>
                <LinearText style={styles.osStep}>
                  3. If condition: 'App opened' (Select Instagram/YouTube).
                </LinearText>
                <LinearText style={styles.osStep}>
                  4. Then action: 'Open an app or do an app action'.
                </LinearText>
                <LinearText style={styles.osStep}>5. Select this app ('NEET Study').</LinearText>
                <LinearText style={styles.osStep}>
                  Now you literally cannot open Instagram without passing through this app first.
                </LinearText>
              </View>
            )}
          </View>

          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <LinearText style={styles.backBtnText}>Got it, take me back</LinearText>
          </TouchableOpacity>
        </ResponsiveContainer>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  container: { padding: 24, paddingBottom: 40, alignItems: 'center' },
  emoji: { fontSize: 56, marginBottom: 16 },
  title: {
    color: n.colors.error,
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 12,
    textAlign: 'center',
  },
  sub: {
    color: n.colors.textMuted,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },

  card: {
    backgroundColor: n.colors.surface,
    width: '100%',
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  cardTitle: { color: n.colors.textPrimary, fontSize: 18, fontWeight: '800', marginBottom: 12 },
  cardText: { color: n.colors.textMuted, fontSize: 14, lineHeight: 22, marginBottom: 16 },

  toneLabel: {
    color: n.colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  toneRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  toneBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: n.colors.border,
    backgroundColor: n.colors.background,
  },
  toneBtnActive: { borderColor: n.colors.accent, backgroundColor: '#6C63FF22' },
  toneIcon: { fontSize: 20, marginBottom: 4 },
  toneBtnText: { color: n.colors.textMuted, fontSize: 11, fontWeight: '700' },
  toneBtnTextActive: { color: n.colors.accent },

  btn: { backgroundColor: n.colors.error, padding: 16, borderRadius: 12, alignItems: 'center' },
  btnActive: { backgroundColor: n.colors.success },
  btnText: { color: n.colors.textPrimary, fontSize: 16, fontWeight: '800' },
  deactivateBtn: {
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F4433655',
  },
  deactivateBtnText: { color: n.colors.error, fontSize: 14, fontWeight: '700' },

  osBox: { backgroundColor: n.colors.border, padding: 16, borderRadius: 12 },
  osTitle: { color: n.colors.accent, fontSize: 16, fontWeight: '700', marginBottom: 8 },
  osStep: { color: n.colors.textSecondary, fontSize: 14, marginBottom: 6, lineHeight: 20 },

  backBtn: { marginTop: 16, padding: 16 },
  backBtnText: { color: n.colors.textMuted, fontSize: 16, fontWeight: '600' },
});
