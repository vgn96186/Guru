import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { EXTERNAL_APPS, type ExternalApp } from '../constants/externalApps';
import { launchMedicalApp, type SupportedMedicalApp } from '../services/appLauncher';
import { useAppStore } from '../store/useAppStore';
import { theme } from '../constants/theme';
import { showToast } from './Toast';
import { BUNDLED_GROQ_KEY } from '../config/appConfig';

interface Props {
  onLogSession: (appId: string) => void;
}

export default React.memo(function ExternalToolsRow({ onLogSession }: Props) {
  const profile = useAppStore((s) => s.profile);
  const faceTrackingEnabled = profile?.faceTrackingEnabled ?? false;
  const groqKey = (profile?.groqApiKey || BUNDLED_GROQ_KEY || '').trim();
  const localWhisperPath =
    profile?.useLocalWhisper && profile?.localWhisperPath ? profile.localWhisperPath : undefined;

  async function launchApp(app: ExternalApp) {
    try {
      Haptics.selectionAsync();
      await launchMedicalApp(app.id as SupportedMedicalApp, faceTrackingEnabled, {
        onMicUsed: () => {
          showToast(
            'Using microphone. Keep device speaker on so we can capture the lecture.',
            'info',
          );
        },
        groqKey: groqKey || undefined,
        localWhisperPath,
      });
    } catch (e: any) {
      Alert.alert('Could not open app', e?.message ?? `Please ensure ${app.name} is installed.`);
    }
  }

  function handleLongPress(appId: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLogSession(appId);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>OPEN LECTURE APP</Text>
        <Text style={styles.subtitle}>
          Tap to launch capture. Long press to log manually.
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {EXTERNAL_APPS.map((app) => (
          <TouchableOpacity
            key={app.id}
            testID={`external-app-${app.id}`}
            style={[styles.appBtn, { borderColor: app.color + '55' }]}
            onPress={() => launchApp(app)}
            onLongPress={() => handleLongPress(app.id)}
            delayLongPress={500}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${app.name} lecture app`}
            accessibilityHint="Tap to launch with capture. Long press to log a manual session."
          >
            <View style={[styles.iconBox, { backgroundColor: app.color + '22' }]}>
              <Text style={styles.icon}>{app.iconEmoji}</Text>
            </View>
            <Text style={styles.appName} numberOfLines={2}>
              {app.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 8, marginTop: 4 },
  header: { paddingHorizontal: 16, marginBottom: 10 },
  title: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  subtitle: { color: theme.colors.textSecondary, fontSize: 11, marginTop: 4, lineHeight: 16 },
  scroll: { paddingHorizontal: 16, gap: 10 },
  appBtn: {
    width: 76,
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderWidth: 1,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  icon: { fontSize: 22 },
  appName: {
    color: theme.colors.textPrimary,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
});
