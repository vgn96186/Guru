import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useAppStore } from '../store/useAppStore';
import { profileRepository } from '../db/repositories';
import { ResponsiveContainer } from '../hooks/useResponsive';

export default function DeviceLinkScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const profile = useAppStore(s => s.profile);
  const refreshProfile = useAppStore(s => s.refreshProfile);
  const [code, setCode] = useState(profile?.syncCode || '');

  async function handleSave() {
    const cleanCode = code.trim().toUpperCase();
    await profileRepository.updateProfile({ syncCode: cleanCode || null });
    await refreshProfile();
    navigation.goBack();
  }

  function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomCode = '';
    for (let i = 0; i < 12; i++) {
      randomCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const formattedCode = `${randomCode.substring(0,4)}-${randomCode.substring(4,8)}-${randomCode.substring(8,12)}`;
    setCode(formattedCode);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        <ResponsiveContainer style={{ justifyContent: 'center', alignItems: 'center' }}>
          <Text style={styles.emoji}>📡</Text>
          <Text style={styles.title}>Device Linking</Text>
          <Text style={styles.sub}>
            Watch lectures on your tablet and keep this phone synced as a hostage/remote control.
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>Enter a shared Room Code on both devices:</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. NEETT2026"
              placeholderTextColor="#666"
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              maxLength={14}
            />
            
            <TouchableOpacity onPress={generateCode}>
              <Text style={styles.generateText}>Or generate a random secure code</Text>
            </TouchableOpacity>
            
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>⚠️ SECURITY WARNING</Text>
              <Text style={styles.warningSubText}>Sync uses a public MQTT broker for low-latency connection. Do not share this code or discuss sensitive info.</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>{code.trim() ? 'Connect Devices' : 'Disconnect'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </ResponsiveContainer>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  container: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  emoji: { fontSize: 56, marginBottom: 16 },
  title: { color: '#6C63FF', fontSize: 28, fontWeight: '900', marginBottom: 12 },
  sub: { color: '#9E9E9E', fontSize: 16, textAlign: 'center', marginBottom: 32, lineHeight: 24 },
  card: { backgroundColor: '#1A1A24', width: '100%', padding: 24, borderRadius: 16, borderWidth: 1, borderColor: '#333', marginBottom: 24 },
  label: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  input: { backgroundColor: '#0A0A0A', color: '#fff', fontSize: 24, fontWeight: '900', textAlign: 'center', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#6C63FF', letterSpacing: 2 },
  generateText: { color: '#6C63FF', fontSize: 14, marginTop: 16, textAlign: 'center', textDecorationLine: 'underline' },
  saveBtn: { backgroundColor: '#6C63FF', width: '100%', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 16 },
  saveBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  cancelBtn: { padding: 16 },
  cancelBtnText: { color: '#666', fontSize: 16, fontWeight: '600' },
  warningBox: { marginTop: 24, padding: 16, backgroundColor: '#2C1A1A', borderRadius: 8, borderWidth: 1, borderColor: '#F44336' },
  warningText: { color: '#F44336', fontSize: 14, fontWeight: '800', marginBottom: 4 },
  warningSubText: { color: '#FFCDD2', fontSize: 13, lineHeight: 18 }
});
