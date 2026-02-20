import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking, Alert } from 'react-native';
import { EXTERNAL_APPS, type ExternalApp } from '../constants/externalApps';

interface Props {
  onLogSession: (appId: string) => void;
}

export default function ExternalToolsRow({ onLogSession }: Props) {

  async function launchApp(app: ExternalApp) {
    // 1. Try custom scheme first (most reliable for direct app opening)
    // 2. If fails, try the Android intent string (standard Android trick)
    // 3. Fallback to web link
    try {
      if (app.customScheme) {
        const canOpen = await Linking.canOpenURL(app.customScheme);
        if (canOpen) {
          await Linking.openURL(app.customScheme);
          return;
        }
      }

      // Android specific: try launching via intent URI
      const intentUrl = `intent://#Intent;package=${app.packageName};end`;
      try {
        await Linking.openURL(intentUrl);
        return;
      } catch (e) {
        // intent failed, move to web
      }

      await Linking.openURL(app.webUrl);
    } catch (e) {
      console.warn('Could not launch app', e);
      // Last resort: try web URL directly
      Linking.openURL(app.webUrl).catch(() => {
        Alert.alert('Could not open app', `Please ensure ${app.name} is installed.`);
      });
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>LAUNCH & LOG</Text>
        <Text style={styles.subtitle}>Track study time in other apps</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {EXTERNAL_APPS.map(app => (
          <TouchableOpacity
            key={app.id}
            style={[styles.appBtn, { borderColor: app.color + '44' }]}
            onPress={() => onLogSession(app.id)}
            onLongPress={() => launchApp(app)}
            delayLongPress={500}
            activeOpacity={0.7}
          >
            <View style={[styles.iconBox, { backgroundColor: app.color + '22' }]}>
              <Text style={styles.icon}>{app.iconEmoji}</Text>
            </View>
            <Text style={styles.appName} numberOfLines={1}>{app.name}</Text>
            <Text style={styles.actionText}>Log</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 24 },
  header: { paddingHorizontal: 16, marginBottom: 12 },
  title: { color: '#9E9E9E', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  subtitle: { color: '#555', fontSize: 11, marginTop: 2 },
  scroll: { paddingHorizontal: 16, gap: 12 },
  appBtn: {
    width: 80,
    alignItems: 'center',
    backgroundColor: '#1A1A24',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  icon: { fontSize: 20 },
  appName: { color: '#fff', fontSize: 11, fontWeight: '600', marginBottom: 2 },
  actionText: { color: '#6C63FF', fontSize: 10, fontWeight: '700' },
});
