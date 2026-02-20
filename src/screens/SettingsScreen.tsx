import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, StatusBar, Switch, Alert, ActivityIndicator, FlatList, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { useAppStore } from '../store/useAppStore';
import { updateUserProfile, getUserProfile } from '../db/queries/progress';
import { requestNotificationPermissions, refreshAccountabilityNotifications } from '../services/notificationService';
import { getDb } from '../db/database';

const BACKUP_VERSION = 1;

// List of known Gemini models to check against
const KNOWN_MODELS = [
  'gemini-3.0-flash-preview',
  'gemini-3.0-flash',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-exp',
  'gemini-1.5-flash',
];

async function listGeminiModels(key: string): Promise<{ ok: boolean; models: string[]; error?: string }> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, models: [], error: data?.error?.message || `HTTP ${res.status}` };
    }
    const data = await res.json();
    const models = (data.models || [])
      .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m: any) => m.name.replace('models/', ''));
    return { ok: true, models };
  } catch (e: any) {
    return { ok: false, models: [], error: e?.message || 'Network error' };
  }
}

async function exportBackup(): Promise<void> {
  const db = getDb();
  const profile = db.getFirstSync<Record<string, unknown>>('SELECT * FROM user_profile WHERE id = 1');
  const topicProgress = db.getAllSync<Record<string, unknown>>('SELECT * FROM topic_progress');
  const dailyLog = db.getAllSync<Record<string, unknown>>('SELECT * FROM daily_log ORDER BY date DESC LIMIT 90');
  const lectureNotes = db.getAllSync<Record<string, unknown>>('SELECT * FROM lecture_notes ORDER BY created_at DESC LIMIT 500');

  const backup = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    user_profile: profile,
    topic_progress: topicProgress,
    daily_log: dailyLog,
    lecture_notes: lectureNotes,
  };

  const json = JSON.stringify(backup, null, 2);
  const dateStr = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.document, `guru_backup_${dateStr}.json`);
  file.write(json);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save Guru Backup' });
  } else {
    Alert.alert('Backup saved', `File written to:\n${file.uri}`);
  }
}

async function importBackup(): Promise<{ ok: boolean; message: string }> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.[0]) return { ok: false, message: 'Cancelled' };

  const file = new File(result.assets[0].uri);
  const content = await file.text();
  let backup: any;
  try {
    backup = JSON.parse(content);
  } catch {
    return { ok: false, message: 'Invalid JSON file' };
  }

  if (!backup.version || !backup.topic_progress || !backup.user_profile) {
    return { ok: false, message: 'Invalid backup format — missing required fields' };
  }
  if (backup.version > BACKUP_VERSION) {
    return { ok: false, message: 'Backup was made with a newer version of the app' };
  }

  const db = getDb();
  // Restore topic_progress (most important)
  for (const row of backup.topic_progress as Record<string, any>[]) {
    db.runSync(
      `INSERT OR REPLACE INTO topic_progress
       (topic_id, status, confidence, last_studied_at, times_studied, xp_earned, next_review_date, user_notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.topic_id, row.status, row.confidence, row.last_studied_at,
       row.times_studied, row.xp_earned, row.next_review_date ?? null, row.user_notes ?? ''],
    );
  }
  // Restore daily_log
  for (const row of (backup.daily_log ?? []) as Record<string, any>[]) {
    db.runSync(
      `INSERT OR REPLACE INTO daily_log (date, checked_in, mood, total_minutes, xp_earned, session_count)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [row.date, row.checked_in, row.mood, row.total_minutes, row.xp_earned, row.session_count],
    );
  }
  // Restore key profile fields (keep api key from current settings)
  const p = backup.user_profile as Record<string, any>;
  if (p) {
    db.runSync(
      `UPDATE user_profile SET
       display_name = ?, total_xp = ?, current_level = ?,
       streak_current = ?, streak_best = ?,
       daily_goal_minutes = ?, preferred_session_length = ?
       WHERE id = 1`,
      [p.display_name ?? 'Doctor', p.total_xp ?? 0, p.current_level ?? 1,
       p.streak_current ?? 0, p.streak_best ?? 0,
       p.daily_goal_minutes ?? 120, p.preferred_session_length ?? 45],
    );
  }

  return { ok: true, message: `Restored ${backup.topic_progress.length} topics, ${(backup.daily_log ?? []).length} log entries` };
}

type ValidationState = 'idle' | 'testing' | 'success' | 'error';

async function validateGeminiKey(key: string): Promise<{ ok: boolean; model?: string; error?: string }> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.0-flash-preview:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
        generationConfig: { maxOutputTokens: 5 },
      }),
    });
    if (res.ok) return { ok: true, model: 'Gemini 3.0 Flash Preview' };
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data?.error?.message || `HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error' };
  }
}

export default function SettingsScreen() {
  const { profile, refreshProfile } = useAppStore();
  const [apiKey, setApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini-2.0-flash');
  const [availableModels, setAvailableModels] = useState<string[]>(KNOWN_MODELS);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [name, setName] = useState('');
  const [inicetDate, setInicetDate] = useState('2026-05-01');
  const [neetDate, setNeetDate] = useState('2026-08-01');
  const [sessionLength, setSessionLength] = useState('45');
  const [dailyGoal, setDailyGoal] = useState('120');
  const [notifs, setNotifs] = useState(true);
  const [strictMode, setStrictMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validation, setValidation] = useState<ValidationState>('idle');
  const [validationMsg, setValidationMsg] = useState('');
  const [backupBusy, setBackupBusy] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (profile) {
      if (profile.openrouterApiKey.includes('|')) {
        const parts = profile.openrouterApiKey.split('|');
        setApiKey(parts[0]);
        setSelectedModel(parts[1]);
      } else {
        setApiKey(profile.openrouterApiKey);
      }
      setName(profile.displayName);
      setInicetDate(profile.inicetDate);
      setNeetDate(profile.neetDate);
      setSessionLength(profile.preferredSessionLength.toString());
      setDailyGoal(profile.dailyGoalMinutes.toString());
      setNotifs(profile.notificationsEnabled);
      setStrictMode(profile.strictModeEnabled);
      if (profile.openrouterApiKey) setValidation('success');
    }
  }, [profile]);

  function handleApiKeyChange(text: string) {
    setApiKey(text);
    setValidation('idle');
    setValidationMsg('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = text.trim();
    if (trimmed.length > 20) {
      debounceRef.current = setTimeout(() => runValidation(trimmed), 1200);
    }
  }

  async function runValidation(key: string) {
    setValidation('testing');
    setValidationMsg('');
    
    // First, list models
    const listRes = await listGeminiModels(key);
    if (!listRes.ok) {
      setValidation('error');
      setValidationMsg(listRes.error || 'Invalid key');
      return;
    }

    setAvailableModels(listRes.models.length > 0 ? listRes.models : KNOWN_MODELS);
    
    // If current model isn't in list, switch to first available
    if (listRes.models.length > 0 && !listRes.models.includes(selectedModel)) {
      // Prefer flash models if available
      const best = listRes.models.find(m => m.includes('flash')) || listRes.models[0];
      setSelectedModel(best);
    }

    setValidation('success');
    setValidationMsg(`Connected — ${listRes.models.length} models found`);
  }

  async function save() {
    setSaving(true);
    try {
      // Store model name WITH key (hacky but saves migration)
      const keyToStore = `${apiKey.trim()}|${selectedModel}`;
      
      updateUserProfile({
        openrouterApiKey: keyToStore,
        displayName: name.trim() || 'Doctor',
        inicetDate,
        neetDate,
        preferredSessionLength: parseInt(sessionLength) || 45,
        dailyGoalMinutes: parseInt(dailyGoal) || 120,
        notificationsEnabled: notifs,
        strictModeEnabled: strictMode,
      });

      if (notifs) {
        const granted = await requestNotificationPermissions();
        if (granted && apiKey.trim()) {
          await refreshAccountabilityNotifications();
        }
      }

      refreshProfile();
      Alert.alert('Saved', 'Settings updated! Guru has been notified. 😏');
    } finally {
      setSaving(false);
    }
  }

  async function testNotification() {
    if (!apiKey.trim()) {
      Alert.alert('No API key', 'Add your OpenRouter API key first.');
      return;
    }
    try {
      await refreshAccountabilityNotifications();
      Alert.alert('Done', 'Notifications scheduled! Check your notification panel.');
    } catch (e) {
      Alert.alert('Error', 'Could not schedule notifications.');
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Settings</Text>

        <Section title="🤖 AI Configuration">
          <Label text="Gemini API Key (Google AI Studio)" />
          <View style={styles.apiKeyRow}>
            <TextInput
              style={[styles.input, styles.apiKeyInput,
                validation === 'success' && styles.inputSuccess,
                validation === 'error' && styles.inputError,
              ]}
              placeholder="AIza..."
              placeholderTextColor="#444"
              value={apiKey}
              onChangeText={handleApiKeyChange}
              secureTextEntry
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={[styles.validateBtn,
                validation === 'success' && styles.validateBtnSuccess,
                validation === 'error' && styles.validateBtnError,
                validation === 'testing' && styles.validateBtnTesting,
              ]}
              onPress={() => apiKey.trim().length > 20 ? runValidation(apiKey.trim()) : null}
              activeOpacity={0.8}
              disabled={validation === 'testing'}
            >
              {validation === 'testing' ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.validateBtnText}>
                  {validation === 'success' ? '✓' : validation === 'error' ? '✗' : 'Test'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
          {validationMsg ? (
            <Text style={[styles.validationMsg,
              validation === 'success' ? styles.validationSuccess : styles.validationError,
            ]}>
              {validation === 'success' ? '✅ ' : '❌ '}{validationMsg}
            </Text>
          ) : null}
          
          <Label text="Selected Model" />
          <TouchableOpacity 
            style={styles.modelSelector} 
            activeOpacity={0.8}
            onPress={() => setShowModelPicker(true)}
          >
            <Text style={styles.modelSelectorText}>{selectedModel}</Text>
            <Text style={styles.modelSelectorArrow}>▼</Text>
          </TouchableOpacity>
          
          <Text style={styles.hint}>
            Get your free key at aistudio.google.com
          </Text>
        </Section>

        {/* Model Picker Modal */}
        <Modal visible={showModelPicker} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select Model</Text>
              <FlatList
                data={availableModels}
                keyExtractor={item => item}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    style={[styles.modelItem, item === selectedModel && styles.modelItemActive]}
                    onPress={() => {
                      setSelectedModel(item);
                      setShowModelPicker(false);
                    }}
                  >
                    <Text style={[styles.modelItemText, item === selectedModel && styles.modelItemTextActive]}>
                      {item}
                    </Text>
                    {item === selectedModel && <Text style={styles.checkMark}>✓</Text>}
                  </TouchableOpacity>
                )}
              />
              <TouchableOpacity style={styles.closeBtn} onPress={() => setShowModelPicker(false)}>
                <Text style={styles.closeBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Section title="👤 Profile">
          <Label text="Your name" />
          <TextInput
            style={styles.input}
            placeholder="Dr. ..."
            placeholderTextColor="#444"
            value={name}
            onChangeText={setName}
          />
        </Section>

        <Section title="📅 Exam Dates">
          <Label text="INICET date (YYYY-MM-DD)" />
          <TextInput style={styles.input} value={inicetDate} onChangeText={setInicetDate} placeholderTextColor="#444" />
          <Label text="NEET-PG date (YYYY-MM-DD)" />
          <TextInput style={styles.input} value={neetDate} onChangeText={setNeetDate} placeholderTextColor="#444" />
        </Section>

        <Section title="⏱️ Study Preferences">
          <Label text="Preferred session length (minutes)" />
          <TextInput
            style={styles.input}
            value={sessionLength}
            onChangeText={setSessionLength}
            keyboardType="number-pad"
            placeholderTextColor="#444"
          />
          <Label text="Daily study goal (minutes)" />
          <TextInput
            style={styles.input}
            value={dailyGoal}
            onChangeText={setDailyGoal}
            keyboardType="number-pad"
            placeholderTextColor="#444"
          />
          <View style={[styles.switchRow, { marginTop: 16 }]}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={styles.switchLabel}>Strict Mode 👮</Text>
              <Text style={styles.hint}>Nag you instantly if you leave the app or are idle. Idle time won't count towards session duration.</Text>
            </View>
            <Switch
              value={strictMode}
              onValueChange={setStrictMode}
              trackColor={{ true: '#F44336', false: '#333' }}
              thumbColor="#fff"
            />
          </View>
        </Section>

        <Section title="🔔 Notifications">
          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchLabel}>Enable Guru's reminders</Text>
              <Text style={styles.hint}>Guru will send personalized daily accountability messages</Text>
            </View>
            <Switch
              value={notifs}
              onValueChange={setNotifs}
              trackColor={{ true: '#6C63FF', false: '#333' }}
              thumbColor="#fff"
            />
          </View>
          <TouchableOpacity style={styles.testBtn} onPress={testNotification} activeOpacity={0.8}>
            <Text style={styles.testBtnText}>Schedule Notifications Now</Text>
          </TouchableOpacity>
        </Section>

        <Section title="💾 Backup & Restore">
          <Text style={styles.hint}>Export your study progress to a JSON file, or restore from a previous backup.</Text>
          <View style={styles.backupRow}>
            <TouchableOpacity
              style={[styles.backupBtn, backupBusy && styles.saveBtnDisabled]}
              disabled={backupBusy}
              activeOpacity={0.8}
              onPress={async () => {
                setBackupBusy(true);
                try {
                  await exportBackup();
                } catch (e: any) {
                  Alert.alert('Export failed', e?.message ?? 'Unknown error');
                } finally {
                  setBackupBusy(false);
                }
              }}
            >
              {backupBusy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.backupBtnText}>⬆️  Export</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.backupBtn, { borderColor: '#4CAF5066' }, backupBusy && styles.saveBtnDisabled]}
              disabled={backupBusy}
              activeOpacity={0.8}
              onPress={async () => {
                Alert.alert(
                  'Restore from backup?',
                  'This will overwrite your current progress with data from the backup file.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Restore',
                      style: 'destructive',
                      onPress: async () => {
                        setBackupBusy(true);
                        try {
                          const res = await importBackup();
                          Alert.alert(res.ok ? 'Restored!' : 'Import failed', res.message);
                          if (res.ok) refreshProfile();
                        } catch (e: any) {
                          Alert.alert('Import failed', e?.message ?? 'Unknown error');
                        } finally {
                          setBackupBusy(false);
                        }
                      },
                    },
                  ],
                );
              }}
            >
              <Text style={[styles.backupBtnText, { color: '#4CAF50' }]}>⬇️  Import</Text>
            </TouchableOpacity>
          </View>
        </Section>

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={save}
          disabled={saving}
          activeOpacity={0.8}
        >
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Settings'}</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>
          NEET Study — Powered by Guru AI{'\n'}
          Google Gemini 3.0 Flash Preview
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

function Label({ text }: { text: string }) {
  return <Text style={styles.label}>{text}</Text>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  content: { padding: 16, paddingBottom: 60 },
  title: { color: '#fff', fontSize: 26, fontWeight: '900', marginBottom: 20, marginTop: 8 },
  section: { marginBottom: 24 },
  sectionTitle: { color: '#9E9E9E', fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  sectionContent: { backgroundColor: '#1A1A24', borderRadius: 16, padding: 16 },
  label: { color: '#9E9E9E', fontSize: 13, marginBottom: 6, marginTop: 8 },
  input: { backgroundColor: '#0F0F14', borderRadius: 10, padding: 12, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: '#2A2A38', marginBottom: 4 },
  apiKeyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  apiKeyInput: { flex: 1, marginBottom: 0 },
  inputSuccess: { borderColor: '#4CAF50' },
  inputError: { borderColor: '#F44336' },
  validateBtn: { backgroundColor: '#2A2A38', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', minWidth: 52, borderWidth: 1, borderColor: '#444' },
  validateBtnSuccess: { backgroundColor: '#1B3A1F', borderColor: '#4CAF50' },
  validateBtnError: { backgroundColor: '#3A1B1B', borderColor: '#F44336' },
  validateBtnTesting: { backgroundColor: '#1A1A2E', borderColor: '#6C63FF' },
  validateBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  validationMsg: { fontSize: 12, marginTop: 6, marginBottom: 2 },
  validationSuccess: { color: '#4CAF50' },
  validationError: { color: '#F44336' },
  hint: { color: '#555', fontSize: 12, marginBottom: 4 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  switchLabel: { color: '#fff', fontWeight: '600', fontSize: 15, marginBottom: 2 },
  testBtn: { marginTop: 12, backgroundColor: '#1A1A2E', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#6C63FF44' },
  testBtnText: { color: '#6C63FF', fontWeight: '600', fontSize: 14 },
  saveBtn: { backgroundColor: '#6C63FF', borderRadius: 16, padding: 18, alignItems: 'center', marginTop: 8 },
  saveBtnDisabled: { backgroundColor: '#333' },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 17 },
  backupRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  backupBtn: { flex: 1, backgroundColor: '#0F0F14', borderRadius: 10, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#6C63FF66' },
  backupBtnText: { color: '#6C63FF', fontWeight: '700', fontSize: 14 },
  footer: { color: '#333', fontSize: 11, textAlign: 'center', marginTop: 24, lineHeight: 18 },
  modelSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0F0F14', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#2A2A38', marginBottom: 8 },
  modelSelectorText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  modelSelectorArrow: { color: '#666', fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1A1A24', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '60%' },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 16, textAlign: 'center' },
  modelItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#333' },
  modelItemActive: { backgroundColor: '#2A2A38', borderRadius: 8, paddingHorizontal: 12, borderBottomWidth: 0 },
  modelItemText: { color: '#9E9E9E', fontSize: 15 },
  modelItemTextActive: { color: '#6C63FF', fontWeight: '700' },
  checkMark: { color: '#6C63FF', fontWeight: 'bold' },
  closeBtn: { marginTop: 16, padding: 14, alignItems: 'center', backgroundColor: '#333', borderRadius: 12 },
  closeBtnText: { color: '#fff', fontWeight: '600' },
});
