import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { EXTERNAL_APPS, type ExternalApp } from '../constants/externalApps';
import { launchMedicalApp, type SupportedMedicalApp } from '../services/appLauncher';
import { useAppStore } from '../store/useAppStore';

interface Props {
  onLogSession: (appId: string) => void;
}

export default function ExternalToolsRow({ onLogSession }: Props) {
  const faceTrackingEnabled = useAppStore(s => s.profile?.faceTrackingEnabled ?? false);

  async function launchApp(app: ExternalApp) {
    await launchMedicalApp(app.id as SupportedMedicalApp, faceTrackingEnabled);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Watch a Lecture</Text>
        <Text style={styles.subtitle}>Tap to open · long-press to log manually</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {EXTERNAL_APPS.map(app => (
          <TouchableOpacity
            key={app.id}
            style={[styles.appBtn, { borderColor: app.color + '44' }]}
            onPress={() => launchApp(app)}
            onLongPress={() => onLogSession(app.id)}
            delayLongPress={500}
            activeOpacity={0.7}
          >
            <View style={[styles.iconBox, { backgroundColor: app.color + '22' }]}>
              <Text style={styles.icon}>{app.iconEmoji}</Text>
            </View>
            <Text style={styles.appName} numberOfLines={1}>{app.name}</Text>
            <Text style={styles.actionText}>Open</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 4, marginBottom: 8 },
  header: { paddingHorizontal: 16, marginBottom: 14 },
  title: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  subtitle: { color: '#777', fontSize: 12, marginTop: 3 },
  scroll: { paddingHorizontal: 16, gap: 12 },
  appBtn: {
    width: 88,
    alignItems: 'center',
    backgroundColor: '#1A1A24',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  icon: { fontSize: 22 },
  appName: { color: '#fff', fontSize: 11, fontWeight: '700', marginBottom: 3 },
  actionText: { color: '#6C63FF', fontSize: 10, fontWeight: '700' },
});
