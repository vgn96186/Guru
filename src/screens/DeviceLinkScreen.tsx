import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SettingsModalParamList } from '../navigation/types';
import { theme } from '../constants/theme';
import { useAppStore } from '../store/useAppStore';
import { profileRepository } from '../db/repositories';
import { ResponsiveContainer } from '../hooks/useResponsive';
import ScreenHeader from '../components/ScreenHeader';

export default function DeviceLinkScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SettingsModalParamList>>();
  const profile = useAppStore((s) => s.profile);
  const refreshProfile = useAppStore((s) => s.refreshProfile);
  const [code, setCode] = useState(profile?.syncCode || '');

  async function handleSave() {
    const cleanCode = code.trim().toUpperCase();
    await profileRepository.updateProfile({ syncCode: cleanCode || null });
    await refreshProfile();
    navigation.goBack();
  }

  function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const randomValues = new Uint32Array(12);
    globalThis.crypto.getRandomValues(randomValues);
    let randomCode = '';
    for (let i = 0; i < 12; i++) {
      randomCode += chars.charAt(randomValues[i] % chars.length);
    }
    const formattedCode = `${randomCode.substring(0, 4)}-${randomCode.substring(4, 8)}-${randomCode.substring(8, 12)}`;
    setCode(formattedCode);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ResponsiveContainer style={styles.content}>
          <ScreenHeader
            title="Device Linking"
            subtitle="Keep your phone and lecture device tied to the same study session."
          />
          <Text style={styles.emoji}>📡</Text>
          <Text style={styles.sub}>
            Watch lectures on your tablet and keep this phone synced as a hostage/remote control.
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>Enter a shared Room Code on both devices:</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. NEETT2026"
              placeholderTextColor={theme.colors.textMuted}
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              maxLength={14}
            />

            <TouchableOpacity
              onPress={generateCode}
              accessibilityRole="button"
              accessibilityLabel="Generate random secure code"
            >
              <Text style={styles.generateText}>Or generate a random secure code</Text>
            </TouchableOpacity>

            <View style={styles.warningBox}>
              <Text style={styles.warningText}>⚠️ SECURITY WARNING</Text>
              <Text style={styles.warningSubText}>
                Sync uses a public MQTT broker for low-latency connection. Do not share this code or
                discuss sensitive info.
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleSave}
            accessibilityRole="button"
            accessibilityLabel={code.trim() ? 'Connect devices' : 'Disconnect'}
          >
            <Text style={styles.saveBtnText}>{code.trim() ? 'Connect Devices' : 'Disconnect'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </ResponsiveContainer>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  container: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  content: { width: '100%', justifyContent: 'center', alignItems: 'center' },
  emoji: { fontSize: 56, marginBottom: 16 },
  sub: {
    color: theme.colors.textMuted,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  card: {
    backgroundColor: theme.colors.surface,
    width: '100%',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 24,
  },
  label: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    backgroundColor: theme.colors.inputBg,
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    letterSpacing: 2,
  },
  generateText: {
    color: theme.colors.primary,
    fontSize: 14,
    marginTop: 16,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  saveBtn: {
    backgroundColor: theme.colors.primary,
    width: '100%',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  saveBtnText: { color: theme.colors.textInverse, fontSize: 18, fontWeight: '800' },
  cancelBtn: { padding: 16 },
  cancelBtnText: { color: theme.colors.textSecondary, fontSize: 16, fontWeight: '600' },
  warningBox: {
    marginTop: 24,
    padding: 16,
    backgroundColor: theme.colors.errorSurface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.error,
  },
  warningText: { color: theme.colors.error, fontSize: 14, fontWeight: '800', marginBottom: 4 },
  warningSubText: { color: theme.colors.textSecondary, fontSize: 13, lineHeight: 18 },
});
