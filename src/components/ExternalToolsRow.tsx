import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { EXTERNAL_APPS, type ExternalApp } from '../constants/externalApps';
import { launchMedicalApp, type SupportedMedicalApp } from '../services/appLauncher';
import { useAppStore } from '../store/useAppStore';

interface Props {
  onLogSession: (appId: string) => void;
}

export default function ExternalToolsRow({ onLogSession }: Props) {
  const faceTrackingEnabled = useAppStore(s => s.profile?.faceTrackingEnabled ?? false);

  async function launchApp(app: ExternalApp) {
    try {
      await launchMedicalApp(app.id as SupportedMedicalApp, faceTrackingEnabled);
    } catch (e: any) {
      Alert.alert('Could not open app', e?.message ?? `Please ensure ${app.name} is installed.`);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>OPEN LECTURE APP</Text>
        <Text style={styles.subtitle}>Long-press to log manually</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {EXTERNAL_APPS.map(app => (
          <TouchableOpacity
            key={app.id}
            testID={`external-app-${app.id}`}
            style={[styles.appBtn, { borderColor: app.color + '55' }]}
            onPress={() => launchApp(app)}
            onLongPress={() => onLogSession(app.id)}
            delayLongPress={500}
            activeOpacity={0.7}
          >
            <View style={[styles.iconBox, { backgroundColor: app.color + '22' }]}>
              <Text style={styles.icon}>{app.iconEmoji}</Text>
            </View>
            <Text style={styles.appName} numberOfLines={1}>{app.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 8, marginTop: 4 },
  header: { paddingHorizontal: 16, marginBottom: 10 },
  title: { color: '#9E9E9E', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  subtitle: { color: '#444', fontSize: 10, marginTop: 2 },
  scroll: { paddingHorizontal: 16, gap: 10 },
  appBtn: {
    width: 76,
    alignItems: 'center',
    backgroundColor: '#1A1A24',
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
  appName: { color: '#fff', fontSize: 11, fontWeight: '600', textAlign: 'center' },
});
