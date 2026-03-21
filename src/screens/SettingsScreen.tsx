import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  Switch,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useNavigation,
  useIsFocused,
  type CompositeNavigationProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { MenuStackParamList, RootStackParamList } from '../navigation/types';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';
import { canDrawOverlays, requestOverlayPermission } from '../../modules/app-launcher';
import { useAppStore } from '../store/useAppStore';
import {
  updateUserProfile,
  getUserProfile,
  resetStudyProgress,
  clearAiCache,
} from '../db/queries/progress';
import { getAllSubjects } from '../db/queries/topics';
import {
  requestNotificationPermissions,
  refreshAccountabilityNotifications,
} from '../services/notificationService';
import { getDb, runInTransaction } from '../db/database';
import { fetchExamDates } from '../services/aiService';
import {
  testGroqConnection,
  testHuggingFaceConnection,
  testOpenRouterConnection,
} from '../services/ai/providerHealth';
import type { ContentType, Subject } from '../types';
import { theme } from '../constants/theme';
import { BUNDLED_HF_TOKEN, DEFAULT_HF_TRANSCRIPTION_MODEL } from '../config/appConfig';
import ScreenHeader from '../components/ScreenHeader';

const ALL_CONTENT_TYPES: { type: ContentType; label: string }[] = [
  { type: 'keypoints', label: 'Key Points' },
  { type: 'quiz', label: 'Quiz' },
  { type: 'story', label: 'Story' },
  { type: 'mnemonic', label: 'Mnemonic' },
  { type: 'teach_back', label: 'Teach Back' },
  { type: 'error_hunt', label: 'Error Hunt' },
  { type: 'detective', label: 'Detective' },
];

const BACKUP_VERSION = 1;

type BackupRow = Record<string, unknown>;

interface AppBackup {
  version: number;
  exportedAt: string;
  user_profile: BackupRow | null;
  topic_progress: BackupRow[];
  daily_log: BackupRow[];
  lecture_notes: BackupRow[];
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

async function exportBackup(): Promise<boolean> {
  const db = getDb();
  const [profile, topicProgress, dailyLog, lectureNotes] = await Promise.all([
    db.getFirstAsync<BackupRow>('SELECT * FROM user_profile WHERE id = 1'),
    db.getAllAsync<BackupRow>('SELECT * FROM topic_progress'),
    db.getAllAsync<BackupRow>('SELECT * FROM daily_log ORDER BY date DESC LIMIT 90'),
    db.getAllAsync<BackupRow>('SELECT * FROM lecture_notes ORDER BY created_at DESC LIMIT 500'),
  ]);

  const backup: AppBackup = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    user_profile: profile,
    topic_progress: topicProgress,
    daily_log: dailyLog,
    lecture_notes: lectureNotes,
  };

  const json = JSON.stringify(backup, null, 2);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filePath = `${FileSystem.cacheDirectory}guru_backup_${dateStr}.json`;
  await FileSystem.writeAsStringAsync(filePath, json);

  if (await Sharing.isAvailableAsync()) {
    try {
      await Sharing.shareAsync(filePath, {
        mimeType: 'application/json',
        dialogTitle: 'Save Guru Backup',
      });
      return true;
    } catch (e) {
      // User cancelled sharing
      return false;
    }
  } else {
    Alert.alert('Backup saved', `File written to:\n${filePath}`);
    return true;
  }
}

async function importBackup(): Promise<{ ok: boolean; message: string }> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return { ok: false, message: 'Cancelled' };

  const content = await FileSystem.readAsStringAsync(result.assets[0].uri);
  let backup: AppBackup;
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

  let restoredTopics = 0;
  let restoredLogs = 0;

  await runInTransaction(async (tx) => {
    const validStatuses = new Set(['unseen', 'seen', 'reviewed', 'mastered']);

    for (const [index, row] of (backup.topic_progress ?? []).entries()) {
      const typedRow = row as Record<string, unknown>;
      if (!typedRow.topic_id || typeof typedRow.status === 'undefined') {
        if (__DEV__) console.warn('Skipping invalid topic_progress row:', typedRow);
        continue;
      }

      const status =
        typeof typedRow.status === 'string' && validStatuses.has(typedRow.status)
          ? typedRow.status
          : 'unseen';
      const confidence =
        typeof typedRow.confidence === 'number' ? Math.min(5, Math.max(0, typedRow.confidence)) : 0;

      await tx.runAsync(
        `INSERT OR REPLACE INTO topic_progress
         (topic_id, status, confidence, last_studied_at, times_studied, xp_earned, next_review_date, user_notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          asNumber(typedRow.topic_id),
          status,
          confidence,
          asNullableString(typedRow.last_studied_at),
          asNumber(typedRow.times_studied),
          asNumber(typedRow.xp_earned),
          asNullableString(typedRow.next_review_date),
          asString(typedRow.user_notes),
        ],
      );
      restoredTopics++;

      if ((index + 1) % 50 === 0) await yieldToUi();
    }

    for (const [index, row] of (backup.daily_log ?? []).entries()) {
      const typedRow = row as Record<string, unknown>;
      if (!typedRow.date) {
        if (__DEV__) console.warn('Skipping invalid daily_log row:', typedRow);
        continue;
      }

      await tx.runAsync(
        `INSERT OR REPLACE INTO daily_log (date, checked_in, mood, total_minutes, xp_earned, session_count)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          asString(typedRow.date),
          asNumber(typedRow.checked_in),
          asNullableString(typedRow.mood),
          asNumber(typedRow.total_minutes),
          asNumber(typedRow.xp_earned),
          asNumber(typedRow.session_count),
        ],
      );
      restoredLogs++;

      if ((index + 1) % 50 === 0) await yieldToUi();
    }

    const p = backup.user_profile as Record<string, unknown> | null;
    if (p) {
      await tx.runAsync(
        `UPDATE user_profile SET
         display_name = ?, total_xp = ?, current_level = ?,
         streak_current = ?, streak_best = ?,
         daily_goal_minutes = ?, preferred_session_length = ?
         WHERE id = 1`,
        [
          asString(p.display_name, 'Doctor'),
          asNumber(p.total_xp),
          asNumber(p.current_level, 1),
          asNumber(p.streak_current),
          asNumber(p.streak_best),
          asNumber(p.daily_goal_minutes, 120),
          asNumber(p.preferred_session_length, 45),
        ],
      );
    }
  });

  return { ok: true, message: `Restored ${restoredTopics} topics, ${restoredLogs} log entries` };
}

export default function SettingsScreen() {
  const navigation =
    useNavigation<
      CompositeNavigationProp<
        NativeStackNavigationProp<MenuStackParamList, 'Settings'>,
        NativeStackNavigationProp<RootStackParamList>
      >
    >();
  const isFocused = useIsFocused();
  const { profile, refreshProfile } = useAppStore();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['ai_config']));

  function SectionToggle({
    id,
    title,
    children,
  }: {
    id: string;
    title: string;
    children: React.ReactNode;
  }) {
    const isExpanded = expandedSections.has(id);
    return (
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={() =>
            setExpandedSections((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          activeOpacity={0.8}
        >
          <Text style={styles.sectionTitle}>{title}</Text>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={theme.colors.textMuted}
          />
        </TouchableOpacity>
        {isExpanded && <View style={styles.sectionContent}>{children}</View>}
      </View>
    );
  }

  // Permissions State
  const [permStatus, setPermStatus] = useState({
    notifs: 'undetermined',
    overlay: 'undetermined',
    mic: 'undetermined',
  });

  const [groqKey, setGroqKey] = useState('');
  const [orKey, setOrKey] = useState('');
  const [huggingFaceToken, setHuggingFaceToken] = useState('');
  const [huggingFaceModel, setHuggingFaceModel] = useState(DEFAULT_HF_TRANSCRIPTION_MODEL);
  const [transcriptionProvider, setTranscriptionProvider] = useState<
    'auto' | 'groq' | 'huggingface' | 'cloudflare' | 'local'
  >('auto');
  const [name, setName] = useState('');
  const [inicetDate, setInicetDate] = useState('2026-05-01');
  const [neetDate, setNeetDate] = useState('2026-08-01');
  const [sessionLength, setSessionLength] = useState('45');
  const [dailyGoal, setDailyGoal] = useState('120');
  const [notifs, setNotifs] = useState(true);
  const [strictMode, setStrictMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [maintenanceBusy, setMaintenanceBusy] = useState<string | null>(null);
  const [bodyDoubling, setBodyDoubling] = useState(true);
  const [blockedTypes, setBlockedTypes] = useState<ContentType[]>([]);
  const [idleTimeout, setIdleTimeout] = useState('2');
  const [breakDuration, setBreakDuration] = useState('5');
  const [pomodoroEnabled, setPomodoroEnabled] = useState(true);
  const [pomodoroInterval, setPomodoroInterval] = useState('20');
  const [notifHour, setNotifHour] = useState('7');
  const [guruFrequency, setGuruFrequency] = useState<'rare' | 'normal' | 'frequent' | 'off'>(
    'normal',
  );
  const [focusSubjectIds, setFocusSubjectIds] = useState<number[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  const [fetchingDates, setFetchingDates] = useState(false);
  const [fetchDatesMsg, setFetchDatesMsg] = useState('');
  const [testingGroqKey, setTestingGroqKey] = useState(false);
  const [groqKeyTestResult, setGroqKeyTestResult] = useState<'ok' | 'fail' | null>(null);
  const [testingOpenRouterKey, setTestingOpenRouterKey] = useState(false);
  const [openRouterKeyTestResult, setOpenRouterKeyTestResult] = useState<'ok' | 'fail' | null>(
    null,
  );
  const [testingHuggingFaceToken, setTestingHuggingFaceToken] = useState(false);
  const [huggingFaceTokenTestResult, setHuggingFaceTokenTestResult] = useState<
    'ok' | 'fail' | null
  >(null);

  useEffect(() => {
    if (isFocused) {
      checkPermissions();
    }
  }, [isFocused]);

  async function testGroqKey() {
    const key = groqKey.trim() || profile?.groqApiKey || '';
    if (!key) {
      Alert.alert('No key', 'Enter a Groq API key first.');
      return;
    }
    setTestingGroqKey(true);
    setGroqKeyTestResult(null);
    const res = await testGroqConnection(key);
    setGroqKeyTestResult(res.ok ? 'ok' : 'fail');
    setTestingGroqKey(false);
  }

  async function testOpenRouterKey() {
    const key = orKey.trim() || profile?.openrouterKey || '';
    if (!key) {
      Alert.alert('No key', 'Enter an OpenRouter API key first.');
      return;
    }
    setTestingOpenRouterKey(true);
    setOpenRouterKeyTestResult(null);
    const res = await testOpenRouterConnection(key);
    setOpenRouterKeyTestResult(res.ok ? 'ok' : 'fail');
    setTestingOpenRouterKey(false);
  }

  async function testHuggingFaceKey() {
    const token = huggingFaceToken.trim() || profile?.huggingFaceToken || '';
    if (!token) {
      Alert.alert('No token', 'Enter a Hugging Face token first.');
      return;
    }
    setTestingHuggingFaceToken(true);
    setHuggingFaceTokenTestResult(null);
    const res = await testHuggingFaceConnection(token, huggingFaceModel.trim());
    setHuggingFaceTokenTestResult(res.ok ? 'ok' : 'fail');
    setTestingHuggingFaceToken(false);
  }

  async function handleAutoFetchDates() {
    const gk = groqKey.trim() || profile?.groqApiKey || '';
    const or = orKey.trim() || profile?.openrouterKey || '';
    if (!gk && !or) {
      setFetchDatesMsg('Add a Groq or OpenRouter key first to auto-fetch dates.');
      return;
    }
    const key = gk; // fetchExamDates uses first arg as primary key
    setFetchingDates(true);
    setFetchDatesMsg('');
    try {
      const dates = await fetchExamDates(key, or || undefined);
      setInicetDate(dates.inicetDate);
      setNeetDate(dates.neetDate);
      setFetchDatesMsg(
        `✅ Fetched: INICET ${dates.inicetDate} · NEET-PG ${dates.neetDate}. Verify and save.`,
      );
    } catch (e: any) {
      setFetchDatesMsg(`❌ ${e?.message || 'Could not fetch dates. Try manually.'}`);
    } finally {
      setFetchingDates(false);
    }
  }

  async function checkPermissions() {
    const n = await Notifications.getPermissionsAsync();
    const m = await Audio.getPermissionsAsync();
    let o = 'undetermined';
    if (Platform.OS === 'android') {
      const hasOverlay = await canDrawOverlays();
      o = hasOverlay ? 'granted' : 'denied';
    }

    setPermStatus({
      notifs: n.status,
      mic: m.status,
      overlay: o,
    });
  }

  useEffect(() => {
    const loadSubjects = async () => {
      try {
        const subs = await getAllSubjects();
        setSubjects(subs);
      } catch {
        /* non-critical */
      }
    };
    loadSubjects();
    if (profile) {
      setGroqKey(profile.groqApiKey ?? '');
      setOrKey(profile.openrouterKey ?? '');
      setHuggingFaceToken(profile.huggingFaceToken ?? BUNDLED_HF_TOKEN);
      setHuggingFaceModel(profile.huggingFaceTranscriptionModel ?? DEFAULT_HF_TRANSCRIPTION_MODEL);
      setTranscriptionProvider(profile.transcriptionProvider ?? 'auto');
      setName(profile.displayName);
      setInicetDate(profile.inicetDate);
      setNeetDate(profile.neetDate);
      setSessionLength(profile.preferredSessionLength.toString());
      setDailyGoal(profile.dailyGoalMinutes.toString());
      setNotifs(profile.notificationsEnabled);
      setStrictMode(profile.strictModeEnabled);
      setBodyDoubling(profile.bodyDoublingEnabled ?? true);
      setBlockedTypes(profile.blockedContentTypes ?? []);
      setIdleTimeout((profile.idleTimeoutMinutes ?? 2).toString());
      setBreakDuration((profile.breakDurationMinutes ?? 5).toString());
      setPomodoroEnabled(profile.pomodoroEnabled ?? true);
      setPomodoroInterval((profile.pomodoroIntervalMinutes ?? 20).toString());
      setNotifHour((profile.notificationHour ?? 7).toString());
      setGuruFrequency(profile.guruFrequency ?? 'normal');
      setFocusSubjectIds(profile.focusSubjectIds ?? []);
    }
  }, [profile]);

  async function save() {
    setSaving(true);
    try {
      updateUserProfile({
        groqApiKey: groqKey.trim(),
        openrouterKey: orKey.trim(),
        huggingFaceToken: huggingFaceToken.trim(),
        huggingFaceTranscriptionModel: huggingFaceModel.trim() || DEFAULT_HF_TRANSCRIPTION_MODEL,
        transcriptionProvider,
        displayName: name.trim() || 'Doctor',
        inicetDate,
        neetDate,
        preferredSessionLength: parseInt(sessionLength) || 45,
        dailyGoalMinutes: parseInt(dailyGoal) || 120,
        notificationsEnabled: notifs,
        strictModeEnabled: strictMode,
        bodyDoublingEnabled: bodyDoubling,
        blockedContentTypes: blockedTypes,
        idleTimeoutMinutes: Math.min(60, Math.max(1, parseInt(idleTimeout) || 2)),
        breakDurationMinutes: Math.min(30, Math.max(1, parseInt(breakDuration) || 5)),
        pomodoroEnabled,
        pomodoroIntervalMinutes: Math.min(60, Math.max(5, parseInt(pomodoroInterval) || 20)),
        notificationHour: Math.min(23, Math.max(0, parseInt(notifHour) || 7)),
        guruFrequency,
        focusSubjectIds,
      });

      if (notifs) {
        await requestNotificationPermissions();
        await refreshAccountabilityNotifications();
      }

      refreshProfile();
      Alert.alert('Saved', 'Settings updated!');
    } finally {
      setSaving(false);
    }
  }

  async function testNotification() {
    try {
      await refreshAccountabilityNotifications();
      Alert.alert('Done', 'Notifications scheduled! Check your notification panel.');
    } catch (e) {
      Alert.alert('Error', 'Could not schedule notifications.');
    }
  }

  const handleSelectBackupDir = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert('Not supported', 'This feature is only available on Android.');
      return;
    }
    try {
      const { StorageAccessFramework } = await import('expo-file-system/legacy');
      const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (permissions.granted) {
        await updateUserProfile({ backupDirectoryUri: permissions.directoryUri } as any);
        await refreshProfile();
        Alert.alert(
          'Success',
          'Backup directory configured! Your data will now stay synced there.',
        );
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to configure backup directory.');
    }
  };

  async function runMaintenanceTask(
    key: string,
    task: () => Promise<number>,
    labels: { done: string; none: string; failed: string },
  ) {
    setMaintenanceBusy(key);
    try {
      const count = await task();
      Alert.alert(
        count > 0 ? labels.done : labels.none,
        count > 0 ? `${count} item(s) processed.` : 'Nothing needed fixing.',
      );
    } catch (err) {
      Alert.alert(labels.failed, err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setMaintenanceBusy(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          title="Settings"
          subtitle="Control sync, backups, AI, and study behavior."
          onBackPress={() => navigation.navigate('MenuHome')}
        />

        <SectionToggle id="ai_config" title="🤖 AI Configuration">
          <Label text="Groq API Key (console.groq.com)" />
          <TextInput
            style={styles.input}
            placeholder="gsk_..."
            placeholderTextColor={theme.colors.textMuted}
            value={groqKey}
            onChangeText={setGroqKey}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.hint}>
            Used for transcription and AI generation. Get a free key at console.groq.com
          </Text>
          <TouchableOpacity
            style={[styles.testBtn, { marginBottom: 4 }]}
            onPress={testGroqKey}
            disabled={testingGroqKey}
            activeOpacity={0.8}
          >
            {testingGroqKey ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <Text
                style={[
                  styles.testBtnText,
                  groqKeyTestResult === 'ok' && { color: theme.colors.success },
                  groqKeyTestResult === 'fail' && { color: theme.colors.error },
                ]}
              >
                {groqKeyTestResult === 'ok'
                  ? '✅ Groq key works!'
                  : groqKeyTestResult === 'fail'
                    ? '❌ Key invalid or unreachable'
                    : 'Test Groq Connection'}
              </Text>
            )}
          </TouchableOpacity>

          <Label text="OpenRouter API Key — optional fallback" />
          <TextInput
            style={styles.input}
            placeholder="sk-or-v1-..."
            placeholderTextColor={theme.colors.textMuted}
            value={orKey}
            onChangeText={setOrKey}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.hint}>
            Optional. Guru falls back to free OpenRouter models (Llama 3.3, Qwen 2.5, etc.) when
            Groq is unavailable. Get a free key at openrouter.ai
          </Text>
          <TouchableOpacity
            style={[styles.testBtn, { marginBottom: 4 }]}
            onPress={testOpenRouterKey}
            disabled={testingOpenRouterKey}
            activeOpacity={0.8}
          >
            {testingOpenRouterKey ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <Text
                style={[
                  styles.testBtnText,
                  openRouterKeyTestResult === 'ok' && { color: theme.colors.success },
                  openRouterKeyTestResult === 'fail' && { color: theme.colors.error },
                ]}
              >
                {openRouterKeyTestResult === 'ok'
                  ? '✅ OpenRouter key works!'
                  : openRouterKeyTestResult === 'fail'
                    ? '❌ Key invalid or unreachable'
                    : 'Test OpenRouter Connection'}
              </Text>
            )}
          </TouchableOpacity>

          <Label text="Hugging Face token — optional transcription provider" />
          <TextInput
            style={styles.input}
            placeholder="hf_..."
            placeholderTextColor={theme.colors.textMuted}
            value={huggingFaceToken}
            onChangeText={setHuggingFaceToken}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.hint}>
            Used only for speech-to-text. Create a token at huggingface.co/settings/tokens.
          </Text>
          <TouchableOpacity
            style={[styles.testBtn, { marginBottom: 4 }]}
            onPress={testHuggingFaceKey}
            disabled={testingHuggingFaceToken}
            activeOpacity={0.8}
          >
            {testingHuggingFaceToken ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <Text
                style={[
                  styles.testBtnText,
                  huggingFaceTokenTestResult === 'ok' && { color: theme.colors.success },
                  huggingFaceTokenTestResult === 'fail' && { color: theme.colors.error },
                ]}
              >
                {huggingFaceTokenTestResult === 'ok'
                  ? '✅ Hugging Face token works!'
                  : huggingFaceTokenTestResult === 'fail'
                    ? '❌ Token invalid or unreachable'
                    : 'Test Hugging Face Token'}
              </Text>
            )}
          </TouchableOpacity>

          <Label text="Hugging Face transcription model" />
          <TextInput
            style={styles.input}
            placeholder={DEFAULT_HF_TRANSCRIPTION_MODEL}
            placeholderTextColor={theme.colors.textMuted}
            value={huggingFaceModel}
            onChangeText={setHuggingFaceModel}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.hint}>
            Example: `openai/whisper-large-v3-turbo`. This is cloud inference, not the local
            whisper.cpp downloader below.
          </Text>

          <Label text="Preferred transcription provider" />
          <View style={styles.frequencyRow}>
            {(
              [
                ['auto', 'Auto'],
                ['groq', 'Groq'],
                ['huggingface', 'Hugging Face'],
                ['local', 'Local Whisper'],
              ] as const
            ).map(([provider, label]) => (
              <TouchableOpacity
                key={provider}
                style={[styles.freqBtn, transcriptionProvider === provider && styles.freqBtnActive]}
                onPress={() => setTranscriptionProvider(provider)}
              >
                <Text
                  style={[
                    styles.freqText,
                    transcriptionProvider === provider && styles.freqTextActive,
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.hint}>
            `Auto` tries Groq first, then Hugging Face, then Local Whisper if enabled.
          </Text>

          <TouchableOpacity
            style={styles.localModelBtn}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('LocalModel' as any)}
          >
            <Text style={styles.localModelBtnText}>🧠 Download Local AI Models (Offline)</Text>
          </TouchableOpacity>
        </SectionToggle>

        <SectionToggle id="permissions" title="✅ Permissions & Diagnostics">
          <PermissionRow
            label="Notifications"
            status={permStatus.notifs}
            onFix={async () => {
              await Notifications.requestPermissionsAsync();
              checkPermissions();
            }}
          />
          <PermissionRow
            label="Microphone (Audio)"
            status={permStatus.mic}
            onFix={async () => {
              await Audio.requestPermissionsAsync();
              checkPermissions();
            }}
          />
          {Platform.OS === 'android' && (
            <PermissionRow
              label="Draw Over Apps (Break Overlay)"
              status={permStatus.overlay}
              onFix={async () => {
                await requestOverlayPermission();
                Alert.alert(
                  'Overlay Permission',
                  'Please enable Guru in the settings screen that just opened, then return to the app.',
                );
              }}
            />
          )}
          <TouchableOpacity style={styles.diagBtn} onPress={() => Linking.openSettings()}>
            <Text style={styles.diagBtnText}>Open System Settings</Text>
          </TouchableOpacity>
        </SectionToggle>

        <SectionToggle id="profile" title="👤 Profile">
          <TouchableOpacity
            style={[
              styles.testBtn,
              { marginTop: 0, marginBottom: 16, borderColor: theme.colors.successTintSoft },
            ]}
            onPress={() => navigation.navigate('DeviceLink')}
            activeOpacity={0.8}
          >
            <Text style={[styles.testBtnText, { color: theme.colors.success }]}>
              📱 Link Another Device (Sync)
            </Text>
          </TouchableOpacity>
          <Label text="Your name" />
          <TextInput
            style={styles.input}
            placeholder="Dr. ..."
            placeholderTextColor={theme.colors.textMuted}
            value={name}
            onChangeText={setName}
          />
        </SectionToggle>

        <SectionToggle id="exam_dates" title="📅 Exam Dates">
          <Label text="INICET date (YYYY-MM-DD)" />
          <TextInput
            style={styles.input}
            value={inicetDate}
            onChangeText={setInicetDate}
            placeholderTextColor={theme.colors.textMuted}
          />
          <Label text="NEET-PG date (YYYY-MM-DD)" />
          <TextInput
            style={styles.input}
            value={neetDate}
            onChangeText={setNeetDate}
            placeholderTextColor={theme.colors.textMuted}
          />
          <TouchableOpacity
            style={[styles.autoFetchBtn, fetchingDates && styles.autoFetchBtnDisabled]}
            onPress={handleAutoFetchDates}
            disabled={fetchingDates}
            activeOpacity={0.8}
          >
            {fetchingDates ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <Text style={styles.autoFetchBtnText}>🤖 Auto-fetch dates via AI</Text>
            )}
          </TouchableOpacity>
          {fetchDatesMsg ? (
            <Text
              style={[
                styles.hint,
                fetchDatesMsg.startsWith('✅')
                  ? { color: theme.colors.success }
                  : { color: theme.colors.error },
              ]}
            >
              {fetchDatesMsg}
            </Text>
          ) : (
            <Text style={styles.hint}>
              Uses AI to estimate upcoming exam dates. Always verify on nbe.edu.in.
            </Text>
          )}
        </SectionToggle>

        <SectionToggle id="study_prefs" title="⏱️ Study Preferences">
          <Label text="Preferred session length (minutes)" />
          <TextInput
            style={styles.input}
            value={sessionLength}
            onChangeText={setSessionLength}
            keyboardType="number-pad"
            placeholderTextColor={theme.colors.textMuted}
          />
          <Label text="Daily study goal (minutes)" />
          <TextInput
            style={styles.input}
            value={dailyGoal}
            onChangeText={setDailyGoal}
            keyboardType="number-pad"
            placeholderTextColor={theme.colors.textMuted}
          />
          <View style={[styles.switchRow, { marginTop: 16 }]}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={styles.switchLabel}>Strict Mode 👮</Text>
              <Text style={styles.hint}>
                Nag you instantly if you leave the app or are idle. Idle time won't count towards
                session duration.
              </Text>
            </View>
            <Switch
              value={strictMode}
              onValueChange={setStrictMode}
              trackColor={{ true: theme.colors.error, false: theme.colors.border }}
              thumbColor={theme.colors.textPrimary}
            />
          </View>
        </SectionToggle>

        <SectionToggle id="notifications" title="🔔 Notifications">
          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchLabel}>Enable Guru's reminders</Text>
              <Text style={styles.hint}>
                Guru will send personalized daily accountability messages
              </Text>
            </View>
            <Switch
              value={notifs}
              onValueChange={setNotifs}
              trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
              thumbColor={theme.colors.textPrimary}
            />
          </View>
          <Label text="Reminder hour (0–23, e.g. 7 = 7:30 AM)" />
          <TextInput
            style={styles.input}
            value={notifHour}
            onChangeText={setNotifHour}
            keyboardType="number-pad"
            placeholderTextColor={theme.colors.textMuted}
          />
          <Text style={styles.hint}>Evening nudge fires ~11 hours after this.</Text>
          <Label text="Guru presence frequency" />
          <View style={styles.frequencyRow}>
            {(['rare', 'normal', 'frequent', 'off'] as const).map((freq) => (
              <TouchableOpacity
                key={freq}
                style={[styles.freqBtn, guruFrequency === freq && styles.freqBtnActive]}
                onPress={() => setGuruFrequency(freq)}
              >
                <Text style={[styles.freqText, guruFrequency === freq && styles.freqTextActive]}>
                  {freq.charAt(0).toUpperCase() + freq.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.hint}>
            How often Guru sends ambient messages during sessions. Rare: every 30min, Normal: every
            20min, Frequent: every 10min.
          </Text>
          <TouchableOpacity style={styles.testBtn} onPress={testNotification} activeOpacity={0.8}>
            <Text style={styles.testBtnText}>Schedule Notifications Now</Text>
          </TouchableOpacity>
        </SectionToggle>

        <SectionToggle id="body_doubling" title="👻 Body Doubling">
          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={styles.switchLabel}>Guru presence during sessions</Text>
              <Text style={styles.hint}>
                Ambient toast messages and pulsing dot while you study. Helps with focus.
              </Text>
            </View>
            <Switch
              value={bodyDoubling}
              onValueChange={setBodyDoubling}
              trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
              thumbColor={theme.colors.textPrimary}
            />
          </View>
        </SectionToggle>

        <SectionToggle id="content" title="🃏 Content Type Preferences">
          <Text style={styles.hint}>
            Block card types you don't want in sessions. Keypoints can't be blocked.
          </Text>
          <View style={styles.chipGrid}>
            {ALL_CONTENT_TYPES.map(({ type, label }) => {
              const isBlocked = blockedTypes.includes(type);
              const isLocked = type === 'keypoints';
              return (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeChip,
                    isBlocked && styles.typeChipBlocked,
                    isLocked && styles.typeChipLocked,
                  ]}
                  onPress={() => {
                    if (isLocked) return;
                    setBlockedTypes((prev) =>
                      isBlocked ? prev.filter((t) => t !== type) : [...prev, type],
                    );
                  }}
                  activeOpacity={isLocked ? 1 : 0.8}
                >
                  <Text style={[styles.typeChipText, isBlocked && styles.typeChipTextBlocked]}>
                    {label}
                  </Text>
                  {isBlocked && <Text style={styles.typeChipX}> ✕</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </SectionToggle>

        <SectionToggle id="focus_subjects" title="🔬 Focus Subjects">
          <Text style={styles.hint}>
            Pin subjects to limit sessions to those areas only. Clear all to study everything.
          </Text>
          <View style={styles.chipGrid}>
            {subjects.map((s) => {
              const isFocused = focusSubjectIds.includes(s.id);
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[
                    styles.typeChip,
                    isFocused && { backgroundColor: s.colorHex + '33', borderColor: s.colorHex },
                  ]}
                  onPress={() =>
                    setFocusSubjectIds((prev) =>
                      isFocused ? prev.filter((id) => id !== s.id) : [...prev, s.id],
                    )
                  }
                  activeOpacity={0.8}
                >
                  <Text style={[styles.typeChipText, isFocused && { color: s.colorHex }]}>
                    {s.shortCode}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {focusSubjectIds.length > 0 && (
            <TouchableOpacity onPress={() => setFocusSubjectIds([])} style={styles.clearBtn}>
              <Text style={styles.clearBtnText}>Clear focus (study all subjects)</Text>
            </TouchableOpacity>
          )}
        </SectionToggle>

        <SectionToggle id="session" title="⏱️ Session Timing">
          <Label text="Idle timeout (minutes before auto-pause)" />
          <TextInput
            style={styles.input}
            value={idleTimeout}
            onChangeText={setIdleTimeout}
            keyboardType="number-pad"
            placeholderTextColor={theme.colors.textMuted}
          />
          <Label text="Break duration between topics (minutes)" />
          <TextInput
            style={styles.input}
            value={breakDuration}
            onChangeText={setBreakDuration}
            keyboardType="number-pad"
            placeholderTextColor={theme.colors.textMuted}
          />
        </SectionToggle>

        <SectionToggle id="pomodoro" title="🍅 Pomodoro (Lecture Overlay)">
          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={styles.switchLabel}>Enable Pomodoro Suggestion</Text>
              <Text style={styles.hint}>
                Auto-expand the overlay every interval to suggest a quick memory quiz break.
              </Text>
            </View>
            <Switch
              value={pomodoroEnabled}
              onValueChange={setPomodoroEnabled}
              trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
              thumbColor={theme.colors.textPrimary}
            />
          </View>
          <Label text="Pomodoro interval (minutes)" />
          <TextInput
            style={styles.input}
            value={pomodoroInterval}
            onChangeText={setPomodoroInterval}
            keyboardType="number-pad"
            placeholderTextColor={theme.colors.textMuted}
            editable={pomodoroEnabled}
          />
          <Text style={styles.hint}>Suggested: 20-30 minutes for optimal focus.</Text>
        </SectionToggle>

        <SectionToggle id="data" title="🗑️ Data">
          <TouchableOpacity
            style={styles.dangerBtn}
            onPress={() =>
              Alert.alert(
                'Clear AI Cache?',
                'All cached content cards will be regenerated fresh on next use.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: () => {
                      clearAiCache();
                      Alert.alert('Done', 'AI cache cleared.');
                    },
                  },
                ],
              )
            }
            activeOpacity={0.8}
          >
            <Text style={styles.dangerBtnText}>🧹 Clear AI Content Cache</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>
            Forces fresh generation of all key points, quizzes, stories, etc.
          </Text>
          <TouchableOpacity
            style={[styles.dangerBtn, { borderColor: theme.colors.errorTintSoft, marginTop: 10 }]}
            onPress={() =>
              Alert.alert(
                'Reset all progress?',
                'This clears all topic progress, XP, streaks, and daily logs. This cannot be undone. Export a backup first.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Reset',
                    style: 'destructive',
                    onPress: () => {
                      resetStudyProgress();
                      refreshProfile();
                      Alert.alert('Reset', 'Progress has been wiped. Start fresh!');
                    },
                  },
                ],
              )
            }
            activeOpacity={0.8}
          >
            <Text style={[styles.dangerBtnText, { color: theme.colors.error }]}>
              💀 Reset All Progress
            </Text>
          </TouchableOpacity>
          <Text style={styles.hint}>
            Wipes XP, streaks, topic statuses, and daily logs. API keys are kept.
          </Text>
        </SectionToggle>

        <SectionToggle id="backup" title="💾 Backup & Restore">
          <Text style={styles.hint}>
            Export your study progress to a JSON file, or restore from a previous backup.
          </Text>
          {profile?.lastBackupDate && (
            <Text style={styles.backupDate}>
              Last backup: {new Date(profile.lastBackupDate).toLocaleString()}
            </Text>
          )}
          <View style={styles.backupRow}>
            <TouchableOpacity
              style={[styles.backupBtn, backupBusy && styles.saveBtnDisabled]}
              disabled={backupBusy}
              activeOpacity={0.8}
              onPress={async () => {
                setBackupBusy(true);
                try {
                  const success = await exportBackup();
                  if (success) {
                    const now = new Date().toISOString();
                    updateUserProfile({ lastBackupDate: now });
                    refreshProfile();
                    Alert.alert('Backup successful');
                  }
                } catch (e: any) {
                  Alert.alert('Export failed', e?.message ?? 'Unknown error');
                } finally {
                  setBackupBusy(false);
                }
              }}
            >
              {backupBusy ? (
                <ActivityIndicator size="small" color={theme.colors.textPrimary} />
              ) : (
                <Text style={styles.backupBtnText}>⬆️ Export</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.backupBtn,
                { borderColor: theme.colors.successTintSoft },
                backupBusy && styles.saveBtnDisabled,
              ]}
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
              <Text style={[styles.backupBtnText, { color: theme.colors.success }]}>⬇️ Import</Text>
            </TouchableOpacity>
          </View>
        </SectionToggle>

        <SectionToggle id="advanced" title="🛠️ Library Maintenance">
          <Text style={styles.hint}>
            Run repair and recovery only when you need it instead of during startup.
          </Text>
          <TouchableOpacity
            style={[styles.maintenanceBtn, maintenanceBusy !== null && styles.saveBtnDisabled]}
            disabled={maintenanceBusy !== null}
            activeOpacity={0.8}
            onPress={() =>
              runMaintenanceTask(
                'retry',
                async () => {
                  const { retryFailedTasks } = await import('../services/lectureSessionMonitor');
                  const activeProfile = await getUserProfile();
                  return retryFailedTasks(activeProfile?.groqApiKey || undefined);
                },
                {
                  done: 'Lecture retry finished',
                  none: 'Lecture retry checked',
                  failed: 'Lecture retry failed',
                },
              )
            }
          >
            {maintenanceBusy === 'retry' ? (
              <ActivityIndicator size="small" color={theme.colors.textPrimary} />
            ) : (
              <Text style={styles.maintenanceBtnText}>Retry failed lecture processing</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.maintenanceBtn, maintenanceBusy !== null && styles.saveBtnDisabled]}
            disabled={maintenanceBusy !== null}
            activeOpacity={0.8}
            onPress={() =>
              runMaintenanceTask(
                'legacy',
                async () => {
                  const { autoRepairLegacyNotes } =
                    await import('../services/lectureSessionMonitor');
                  return autoRepairLegacyNotes();
                },
                {
                  done: 'Legacy notes repaired',
                  none: 'Legacy notes checked',
                  failed: 'Legacy note repair failed',
                },
              )
            }
          >
            {maintenanceBusy === 'legacy' ? (
              <ActivityIndicator size="small" color={theme.colors.textPrimary} />
            ) : (
              <Text style={styles.maintenanceBtnText}>Repair legacy lecture notes</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.maintenanceBtn, maintenanceBusy !== null && styles.saveBtnDisabled]}
            disabled={maintenanceBusy !== null}
            activeOpacity={0.8}
            onPress={() =>
              runMaintenanceTask(
                'transcripts',
                async () => {
                  const { scanAndRecoverOrphanedTranscripts } =
                    await import('../services/lectureSessionMonitor');
                  return scanAndRecoverOrphanedTranscripts();
                },
                {
                  done: 'Orphan transcripts recovered',
                  none: 'Transcript folders checked',
                  failed: 'Transcript recovery failed',
                },
              )
            }
          >
            {maintenanceBusy === 'transcripts' ? (
              <ActivityIndicator size="small" color={theme.colors.textPrimary} />
            ) : (
              <Text style={styles.maintenanceBtnText}>Recover orphan transcripts</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.maintenanceBtn, maintenanceBusy !== null && styles.saveBtnDisabled]}
            disabled={maintenanceBusy !== null}
            activeOpacity={0.8}
            onPress={() =>
              runMaintenanceTask(
                'recordings',
                async () => {
                  const { scanAndRecoverOrphanedRecordings } =
                    await import('../services/lectureSessionMonitor');
                  return scanAndRecoverOrphanedRecordings();
                },
                {
                  done: 'Orphan recordings recovered',
                  none: 'Recording folders checked',
                  failed: 'Recording recovery failed',
                },
              )
            }
          >
            {maintenanceBusy === 'recordings' ? (
              <ActivityIndicator size="small" color={theme.colors.textPrimary} />
            ) : (
              <Text style={styles.maintenanceBtnText}>Recover orphan recordings</Text>
            )}
          </TouchableOpacity>
        </SectionToggle>

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={save}
          disabled={saving}
          activeOpacity={0.8}
        >
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Settings'}</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>Guru AI · v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function PermissionRow({
  label,
  status,
  onFix,
}: {
  label: string;
  status: string;
  onFix: () => void;
}) {
  const isOk = status === 'granted';
  return (
    <View style={styles.permRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.permLabel}>{label}</Text>
        <Text style={[styles.permStatus, isOk ? styles.permOk : styles.permError]}>
          {isOk ? '✓ Active' : status === 'denied' ? '✗ Disabled' : '○ Not Set'}
        </Text>
      </View>
      {!isOk && (
        <TouchableOpacity style={styles.fixBtn} onPress={onFix}>
          <Text style={styles.fixBtnText}>Fix</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function Label({ text }: { text: string }) {
  return <Text style={styles.label}>{text}</Text>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, paddingBottom: 60 },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 20,
    marginTop: 8,
  },
  section: { marginBottom: theme.spacing.xl },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  sectionTitle: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sectionContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: theme.spacing.lg,
  },
  label: { color: theme.colors.textSecondary, fontSize: 13, marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: theme.colors.background,
    borderRadius: 10,
    padding: 12,
    color: theme.colors.textPrimary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 4,
  },
  apiKeyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  apiKeyInput: { flex: 1, marginBottom: 0 },
  inputSuccess: { borderColor: theme.colors.success },
  inputError: { borderColor: theme.colors.error },
  validateBtn: {
    backgroundColor: theme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 52,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  validateBtnSuccess: {
    backgroundColor: theme.colors.successSurface,
    borderColor: theme.colors.success,
  },
  validateBtnError: { backgroundColor: theme.colors.errorSurface, borderColor: theme.colors.error },
  validateBtnTesting: { backgroundColor: theme.colors.card, borderColor: theme.colors.primary },
  validateBtnText: { color: theme.colors.textPrimary, fontWeight: '700', fontSize: 14 },
  validationMsg: { fontSize: 12, marginTop: 6, marginBottom: 2 },
  validationSuccess: { color: theme.colors.success },
  validationError: { color: theme.colors.error },
  hint: { color: theme.colors.textMuted, fontSize: 12, marginBottom: 4 },
  localModelBtn: {
    marginTop: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    alignItems: 'center',
  },
  localModelBtnText: { color: theme.colors.textPrimary, fontWeight: '700', fontSize: 14 },
  autoFetchBtn: {
    marginTop: 10,
    backgroundColor: theme.colors.card,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primaryTintMedium,
  },
  autoFetchBtnDisabled: { opacity: 0.5 },
  autoFetchBtnText: { color: theme.colors.primary, fontSize: 13, fontWeight: '600' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  switchLabel: {
    color: theme.colors.textPrimary,
    fontWeight: '600',
    fontSize: 15,
    marginBottom: 2,
  },
  testBtn: {
    marginTop: 12,
    backgroundColor: theme.colors.card,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primaryTintMedium,
  },
  testBtnText: { color: theme.colors.primary, fontWeight: '600', fontSize: 14 },
  saveBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnDisabled: { backgroundColor: theme.colors.border },
  saveBtnText: { color: theme.colors.textPrimary, fontWeight: '800', fontSize: 17 },
  backupRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  backupBtn: {
    flex: 1,
    backgroundColor: theme.colors.background,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primaryTintMedium,
  },
  backupBtnText: { color: theme.colors.primary, fontWeight: '700', fontSize: 14 },
  backupDate: {
    color: theme.colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  frequencyRow: { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 4 },
  freqBtn: {
    flex: 1,
    backgroundColor: theme.colors.background,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  freqBtnActive: {
    backgroundColor: theme.colors.primaryTintSoft,
    borderColor: theme.colors.primary,
  },
  freqText: { color: theme.colors.textSecondary, fontSize: 13, fontWeight: '600' },
  freqTextActive: { color: theme.colors.primary, fontWeight: '700' },
  footer: {
    color: theme.colors.borderLight,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 18,
  },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  typeChip: {
    backgroundColor: theme.colors.background,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeChipBlocked: {
    backgroundColor: theme.colors.errorSurface,
    borderColor: theme.colors.errorTintSoft,
  },
  typeChipLocked: { borderColor: theme.colors.primaryTintMedium, opacity: 0.5 },
  typeChipText: { color: theme.colors.textPrimary, fontSize: 13, fontWeight: '600' },
  typeChipTextBlocked: { color: theme.colors.error },
  typeChipX: { color: theme.colors.error, fontSize: 11 },
  clearBtn: { marginTop: 10, padding: 10, alignItems: 'center' },
  clearBtnText: { color: theme.colors.textMuted, fontSize: 13 },
  maintenanceBtn: {
    marginTop: 10,
    backgroundColor: theme.colors.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  maintenanceBtnText: { color: theme.colors.textPrimary, fontWeight: '700', fontSize: 14 },
  dangerBtn: {
    backgroundColor: theme.colors.background,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primaryTintMedium,
  },
  dangerBtnText: { color: theme.colors.primary, fontWeight: '700', fontSize: 14 },
  modelSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 8,
  },
  modelSelectorText: { color: theme.colors.textPrimary, fontSize: 14, fontWeight: '600' },
  modelSelectorArrow: { color: theme.colors.textMuted, fontSize: 12 },
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.backdropStrong,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '60%',
  },
  modalTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
  },
  modelItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  modelItemActive: {
    backgroundColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 0,
  },
  modelItemText: { color: theme.colors.textSecondary, fontSize: 15 },
  modelItemTextActive: { color: theme.colors.primary, fontWeight: '700' },
  checkMark: { color: theme.colors.primary, fontWeight: 'bold' },
  closeBtn: {
    marginTop: theme.spacing.lg,
    padding: 14,
    alignItems: 'center',
    backgroundColor: theme.colors.border,
    borderRadius: 12,
  },
  closeBtnText: { color: theme.colors.textPrimary, fontWeight: '600' },
  // Diagnostics
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  permLabel: { color: theme.colors.textPrimary, fontSize: 14, fontWeight: '600' },
  permStatus: { fontSize: 12, marginTop: 2 },
  permOk: { color: theme.colors.success },
  permError: { color: theme.colors.error },
  fixBtn: {
    backgroundColor: theme.colors.primaryTintSoft,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  fixBtnText: { color: theme.colors.primary, fontSize: 12, fontWeight: '800' },
  diagBtn: { marginTop: 12, alignItems: 'center', padding: 10 },
  diagBtnText: { color: theme.colors.textMuted, fontSize: 13, textDecorationLine: 'underline' },
});
