import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MenuStackParamList } from '../navigation/types';
import { linearTheme as n } from '../theme/linearTheme';
import { useAppStore } from '../store/useAppStore';
import { profileRepository } from '../db/repositories';
import { ResponsiveContainer } from '../hooks/useResponsive';
import ScreenHeader from '../components/ScreenHeader';
import LinearButton from '../components/primitives/LinearButton';
import LinearSurface from '../components/primitives/LinearSurface';
import LinearTextInput from '../components/primitives/LinearTextInput';
import LinearText from '../components/primitives/LinearText';
import { Ionicons } from '@expo/vector-icons';

export default function DeviceLinkScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MenuStackParamList>>();
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
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ResponsiveContainer style={styles.content}>
          <ScreenHeader
            title="Device Linking"
            subtitle="Keep your phone and lecture device tied to the same study session."
            onBackPress={() => navigation.navigate('MenuHome')}
          />
          <Ionicons
            name="sync-outline"
            size={56}
            color={n.colors.accent}
            style={{ marginBottom: 16 }}
          />
          <LinearText style={styles.sub}>
            Watch lectures on your tablet and keep this phone synced as a hostage/remote control.
          </LinearText>

          <LinearSurface padded={false} style={styles.card}>
            <LinearText style={styles.label}>Enter a shared Room Code on both devices:</LinearText>
            <LinearTextInput
              style={styles.input}
              placeholder="e.g. NEETT2026"
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
              <LinearText style={styles.generateText}>Or generate a random secure code</LinearText>
            </TouchableOpacity>

            <LinearSurface
              compact
              padded={false}
              borderColor={n.colors.error}
              style={styles.warningBox}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Ionicons name="warning-outline" size={16} color={n.colors.error} />
                <LinearText style={styles.warningText}>SECURITY WARNING</LinearText>
              </View>
              <LinearText style={styles.warningSubText}>
                Sync uses a public MQTT broker for low-latency connection. Do not share this code or
                discuss sensitive info.
              </LinearText>
            </LinearSurface>
          </LinearSurface>

          <LinearButton
            variant="glassTinted"
            style={styles.saveBtn}
            onPress={handleSave}
            accessibilityRole="button"
            accessibilityLabel={code.trim() ? 'Connect devices' : 'Disconnect'}
            label={code.trim() ? 'Connect Devices' : 'Disconnect'}
          />

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <LinearText style={styles.cancelBtnText}>Cancel</LinearText>
          </TouchableOpacity>
        </ResponsiveContainer>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  container: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  content: { width: '100%', justifyContent: 'center', alignItems: 'center' },
  emoji: { fontSize: 56, marginBottom: 16 },
  sub: {
    color: n.colors.textMuted,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  card: {
    width: '100%',
    padding: 24,
    marginBottom: 24,
  },
  label: {
    color: n.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    color: n.colors.textPrimary,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    padding: 16,
    letterSpacing: 2,
  },
  generateText: {
    color: n.colors.accent,
    fontSize: 14,
    marginTop: 16,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  saveBtn: {
    width: '100%',
    minHeight: 56,
    marginBottom: 16,
  },
  cancelBtn: { padding: 16 },
  cancelBtnText: { color: n.colors.textSecondary, fontSize: 16, fontWeight: '600' },
  warningBox: {
    marginTop: 24,
    padding: 16,
    backgroundColor: n.colors.errorSurface,
  },
  warningText: { color: n.colors.error, fontSize: 14, fontWeight: '800', marginBottom: 4 },
  warningSubText: { color: n.colors.textSecondary, fontSize: 13, lineHeight: 18 },
});
