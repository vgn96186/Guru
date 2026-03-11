import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Modal,
  StyleSheet, StatusBar, Switch, Alert, ActivityIndicator, Platform, Linking, AppState
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';
import { canDrawOverlays, requestOverlayPermission } from '../../modules/app-launcher';
import { useAppStore } from '../store/useAppStore';
import { updateUserProfile, resetStudyProgress, clearAiCache } from '../db/queries/progress';
import { getCacheStats } from '../db/queries/aiCache';
import { getAllSubjects } from '../db/queries/topics';
import { exportDatabase, importDatabase } from '../services/backupService';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { requestNotificationPermissions, refreshAccountabilityNotifications } from '../services/notificationService';
import { isSyncAvailable } from '../services/deviceSyncService';
import { getExamDateSyncMeta, syncExamDatesFromInternet, type ExamDateSyncMeta } from '../services/examDateSyncService';
import { getDb } from '../db/database';
import { getDefaultSubjectLoadMultiplier } from '../services/studyPlanner';
import type { ContentType, Subject } from '../types';

const ALL_CONTENT_TYPES: { type: ContentType; label: string }[] = [
  { type: 'keypoints', label: 'Key Points' },
  { type: 'quiz', label: 'Quiz' },
  { type: 'story', label: 'Story' },
  { type: 'mnemonic', label: 'Mnemonic' },
  { type: 'teach_back', label: 'Teach Back' },
  { type: 'error_hunt', label: 'Error Hunt' },
  { type: 'detective', label: 'Detective' },
];

const BACKUP_VERSION = 2;
const PLACEHOLDER_COLOR = '#7B8193';
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const JSON_BACKUP_TABLES = [
  'user_profile',
  'topic_progress',
  'daily_log',
  'lecture_notes',
  'ai_cache',
  'sessions',
  'external_app_logs',
  'brain_dumps',
] as const;

type BackupTableName = typeof JSON_BACKUP_TABLES[number];
type BackupRow = Record<string, unknown>;
type BackupTableData = Record<BackupTableName, BackupRow[]>;

type ValidationErrors = Partial<Record<'inicetDate' | 'neetDate' | 'sessionLength' | 'dailyGoal' | 'notifHour', string>>;

function normalizeUserDateInput(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;

  let y: number, m: number, d: number;
  const ymd = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) {
    y = Number(ymd[1]);
    m = Number(ymd[2]);
    d = Number(ymd[3]);
  } else {
    const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmy) {
      d = Number(dmy[1]);
      m = Number(dmy[2]);
      y = Number(dmy[3]);
    } else {
      return null;
    }
  }

  if (y < 2020 || y > 2035 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  
  // Robust check for valid calendar date (e.g. not Feb 30)
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) {
    return `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
  }
  return null;
}

async function exportBackup(): Promise<boolean> {
  const db = getDb();
  const tables = {} as BackupTableData;
  for (const table of JSON_BACKUP_TABLES) {
    tables[table] = db.getAllSync<BackupRow>(`SELECT * FROM ${table}`);
  }

  const backup: {
    version: number;
    exportedAt: string;
    tables: BackupTableData;
  } = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables,
  };

  const json = JSON.stringify(backup, null, 2);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filePath = `${FileSystem.cacheDirectory}guru_backup_${dateStr}.json`;
  await FileSystem.writeAsStringAsync(filePath, json);

  if (await Sharing.isAvailableAsync()) {
    try {
      await Sharing.shareAsync(filePath, { mimeType: 'application/json', dialogTitle: 'Save Guru Backup' });
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
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.[0]) return { ok: false, message: 'Cancelled' };

  const content = await FileSystem.readAsStringAsync(result.assets[0].uri);
  let backup: any;
  try {
    backup = JSON.parse(content);
  } catch {
    return { ok: false, message: 'Invalid JSON file' };
  }

  if (!backup.version) {
    return { ok: false, message: 'Invalid backup format — missing version' };
  }
  if (backup.version > BACKUP_VERSION) {
    return { ok: false, message: 'Backup was made with a newer version of the app' };
  }

  const db = getDb();
  const tablesFromBackup: Partial<Record<BackupTableName, BackupRow[]>> = (() => {
    if (backup.tables && typeof backup.tables === 'object') {
      const out: Partial<Record<BackupTableName, BackupRow[]>> = {};
      for (const table of JSON_BACKUP_TABLES) {
        const rows = (backup.tables as Record<string, unknown>)[table];
        if (Array.isArray(rows)) {
          out[table] = rows as BackupRow[];
        }
      }
      return out;
    }
    // Legacy v1 format compatibility
    const legacy: Partial<Record<BackupTableName, BackupRow[]>> = {};
    if (backup.user_profile) legacy.user_profile = [backup.user_profile as BackupRow];
    if (Array.isArray(backup.topic_progress)) legacy.topic_progress = backup.topic_progress as BackupRow[];
    if (Array.isArray(backup.daily_log)) legacy.daily_log = backup.daily_log as BackupRow[];
    if (Array.isArray(backup.lecture_notes)) legacy.lecture_notes = backup.lecture_notes as BackupRow[];
    return legacy;
  })();

  if (Object.keys(tablesFromBackup).length === 0) {
    return { ok: false, message: 'Invalid backup format — no restorable tables found' };
  }

  const restoredCounts: Record<string, number> = {};
  const toBindValue = (value: unknown): string | number | null => {
    if (value === null || typeof value === 'undefined') return null;
    if (typeof value === 'string' || typeof value === 'number') return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    return JSON.stringify(value);
  };
  const runSql = (sql: string) => {
    const maybeExecSync = (db as any).execSync;
    if (typeof maybeExecSync === 'function') {
      maybeExecSync.call(db, sql);
    } else {
      db.runSync(sql);
    }
  };
  const getColumns = (table: string): string[] => {
    try {
      const cols = db.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`);
      return cols.map(c => c.name);
    } catch {
      return [];
    }
  };

  try {
    runSql('BEGIN IMMEDIATE');

    for (const table of JSON_BACKUP_TABLES) {
      if (table === 'user_profile') continue;
      if (!(table in tablesFromBackup)) continue;
      const columns = getColumns(table);
      if (columns.length === 0) continue; // table missing in current schema
      db.runSync(`DELETE FROM ${table}`);
      restoredCounts[table] = 0;
    }

    // Restore user_profile via UPDATE to avoid wiping newer columns not present in older backups
    if (tablesFromBackup.user_profile?.[0]) {
      const row = tablesFromBackup.user_profile[0];
      const userCols = getColumns('user_profile');
      const setCols = Object.keys(row).filter(c => c !== 'id' && userCols.includes(c));
      if (setCols.length > 0) {
        const setSql = setCols.map(c => `${c} = ?`).join(', ');
        const values = setCols.map(c => toBindValue(row[c]));
        db.runSync(`UPDATE user_profile SET ${setSql} WHERE id = 1`, values);
      }
      restoredCounts.user_profile = 1;
    }

    for (const table of JSON_BACKUP_TABLES) {
      if (table === 'user_profile') continue;
      const rows = tablesFromBackup[table];
      if (!rows || rows.length === 0) continue;

      const tableCols = getColumns(table);
      if (tableCols.length === 0) continue;

      for (const rawRow of rows) {
        const cols = Object.keys(rawRow).filter(c => tableCols.includes(c));
        if (cols.length === 0) continue;
        const placeholders = cols.map(() => '?').join(', ');
        const values = cols.map(c => toBindValue(rawRow[c]));
        db.runSync(
          `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
          values,
        );
        restoredCounts[table] = (restoredCounts[table] ?? 0) + 1;
      }
    }

    runSql('COMMIT');
  } catch (e) {
    try { runSql('ROLLBACK'); } catch {}
    if (__DEV__) console.warn('[Settings] Backup import failed:', e);
    return { ok: false, message: 'Import failed during restore. Your existing data was kept.' };
  }

  const summary = [
    `topics: ${restoredCounts.topic_progress ?? 0}`,
    `logs: ${restoredCounts.daily_log ?? 0}`,
    `notes: ${restoredCounts.lecture_notes ?? 0}`,
    `sessions: ${restoredCounts.sessions ?? 0}`,
  ].join(', ');
  return { ok: true, message: `Restored backup successfully (${summary})` };
}

export default function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isFocused = useIsFocused();
  const { profile, refreshProfile } = useAppStore();
  
  // Permissions State
  const [permStatus, setPermStatus] = useState({
    notifs: 'undetermined',
    overlay: 'undetermined',
    mic: 'undetermined',
  });

  const [apiKey, setApiKey] = useState('');
  const [orKey, setOrKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [name, setName] = useState('');
  const [inicetDate, setInicetDate] = useState('2026-05-17');
  const [neetDate, setNeetDate] = useState('2026-08-30');
  const [datePickerTarget, setDatePickerTarget] = useState<'inicet' | 'neet' | null>(null);
  const [sessionLength, setSessionLength] = useState('45');
  const [dailyGoal, setDailyGoal] = useState('120');
  const [notifs, setNotifs] = useState(true);
  const [strictMode, setStrictMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [examSyncBusy, setExamSyncBusy] = useState(false);
  const [bodyDoubling, setBodyDoubling] = useState(true);
  const [blockedTypes, setBlockedTypes] = useState<ContentType[]>([]);
  const [idleTimeout, setIdleTimeout] = useState('2');
  const [breakDuration, setBreakDuration] = useState('5');
  const [visualTimersEnabled, setVisualTimersEnabled] = useState(false);
  const [notifHour, setNotifHour] = useState('7');
  const [guruFrequency, setGuruFrequency] = useState<'rare' | 'normal' | 'frequent' | 'off'>('normal');
  const [focusSubjectIds, setFocusSubjectIds] = useState<number[]>([]);
  const [subjectLoadOverrides, setSubjectLoadOverrides] = useState<Record<string, string>>({});
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [showAdvancedAi, setShowAdvancedAi] = useState(false);
  const [examSyncMeta, setExamSyncMeta] = useState<ExamDateSyncMeta | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef<() => void>(() => {});
  const overlayFixPendingRef = useRef(false);

  // Track dirty state — any setter marks as dirty and triggers auto-save
  const markDirty = useCallback(() => {
    setIsDirty(true);
    if (saveState !== 'saving') setSaveState('idle');
    if (saveError) setSaveError('');
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => { saveRef.current(); }, 2000);
  }, [saveState, saveError]);

  const clearFieldError = useCallback((field: keyof ValidationErrors) => {
    setValidationErrors(prev => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const isValidIsoDate = useCallback((value: string): boolean => {
    if (!DATE_REGEX.test(value)) return false;
    const parts = value.split('-').map(Number);
    if (parts.length !== 3) return false;
    const [y, m, d] = parts;
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }, []);

  const clampInt = useCallback((raw: string, fallback: number, min: number, max: number): number => {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  }, []);

  // Auto-save on leaving the screen
  useEffect(() => {
    return () => {
      if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
      if (saveStateTimeoutRef.current) clearTimeout(saveStateTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isFocused && isDirty) {
      saveRef.current();
    }
  }, [isFocused, isDirty]);

  useEffect(() => {
    if (isFocused) {
      checkPermissions();
      getExamDateSyncMeta().then(setExamSyncMeta).catch(() => setExamSyncMeta(null));
    }
  }, [isFocused]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState !== 'active') return;
      if (!isFocused) return;
      if (overlayFixPendingRef.current) {
        overlayFixPendingRef.current = false;
      }
      checkPermissions();
    });
    return () => sub.remove();
  }, [isFocused]);

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
    try { setSubjects(getAllSubjects()); } catch { /* non-critical */ }
    if (profile) {
      // Strip legacy pipe-delimited model name if present
      const rawKey = profile.openrouterApiKey;
      setApiKey(rawKey.includes('|') ? rawKey.split('|')[0] : rawKey);
      setOrKey(profile.openrouterKey ?? '');
      setGroqKey(profile.groqApiKey ?? '');
      setName(profile.displayName);
      setInicetDate(profile.inicetDate || '2026-05-17');
      setNeetDate(profile.neetDate || '2026-08-30');
      setSessionLength(profile.preferredSessionLength.toString());
      setDailyGoal(profile.dailyGoalMinutes.toString());
      setNotifs(profile.notificationsEnabled);
      setStrictMode(profile.strictModeEnabled);
      setBodyDoubling(profile.bodyDoublingEnabled ?? true);
      setBlockedTypes(profile.blockedContentTypes ?? []);
      setIdleTimeout((profile.idleTimeoutMinutes ?? 2).toString());
      setBreakDuration((profile.breakDurationMinutes ?? 5).toString());
      setVisualTimersEnabled(profile.visualTimersEnabled ?? false);
      setNotifHour((profile.notificationHour ?? 7).toString());
      setGuruFrequency(profile.guruFrequency ?? 'normal');
      setFocusSubjectIds(profile.focusSubjectIds ?? []);
      setSubjectLoadOverrides(
        Object.fromEntries(
          Object.entries(profile.customSubjectLoadMultipliers ?? {}).map(([code, value]) => [code, String(value)])
        ),
      );
    }
  }, [profile]);

  // Mark dirty whenever any setting value changes (skip initial load)
  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (!initialLoadDone.current) {
      // First render after profile loads — don't mark dirty
      if (profile) initialLoadDone.current = true;
      return;
    }
    markDirty();
  }, [apiKey, orKey, groqKey, name, inicetDate, neetDate, sessionLength, dailyGoal,
      notifs, strictMode, bodyDoubling, blockedTypes, idleTimeout, breakDuration,
      visualTimersEnabled, notifHour, guruFrequency, focusSubjectIds, subjectLoadOverrides]);

  async function save() {
    if (saving) return;
    if (autoSaveRef.current) {
      clearTimeout(autoSaveRef.current);
      autoSaveRef.current = null;
    }
    setSaving(true);
    setSaveState('saving');
    setSaveError('');

    const nextValidationErrors: ValidationErrors = {};
    const normalizedInicet = normalizeUserDateInput(inicetDate);
    const normalizedNeet = normalizeUserDateInput(neetDate);
    const fallbackInicet = profile?.inicetDate && isValidIsoDate(profile.inicetDate) ? profile.inicetDate : null;
    const fallbackNeet = profile?.neetDate && isValidIsoDate(profile.neetDate) ? profile.neetDate : null;

    const finalInicetDate = normalizedInicet ?? fallbackInicet;
    const finalNeetDate = normalizedNeet ?? fallbackNeet;

    if (!finalInicetDate) {
      nextValidationErrors.inicetDate = 'Use a valid date (YYYY-MM-DD, e.g. 2026-05-17).';
    }
    if (!finalNeetDate) {
      nextValidationErrors.neetDate = 'Use a valid date (YYYY-MM-DD, e.g. 2026-08-30).';
    }

    const parsedSessionLength = Number.parseInt(sessionLength, 10);
    if (Number.isNaN(parsedSessionLength)) {
      nextValidationErrors.sessionLength = 'Enter a number between 10 and 240 minutes.';
    }
    const parsedDailyGoal = Number.parseInt(dailyGoal, 10);
    if (Number.isNaN(parsedDailyGoal)) {
      nextValidationErrors.dailyGoal = 'Enter a number between 30 and 720 minutes.';
    }
    const parsedNotifHour = Number.parseInt(notifHour, 10);
    if (Number.isNaN(parsedNotifHour)) {
      nextValidationErrors.notifHour = 'Enter an hour between 0 and 23.';
    }

    if (Object.keys(nextValidationErrors).length > 0) {
      setValidationErrors(nextValidationErrors);
      setSaveState('error');
      setSaveError('Could not save. Fix the highlighted fields.');
      setSaving(false);
      return;
    }

    const sanitizedSessionLength = clampInt(sessionLength, 45, 10, 240);
    const sanitizedDailyGoal = clampInt(dailyGoal, 120, 30, 720);
    const sanitizedNotifHour = clampInt(notifHour, 7, 0, 23);
    const sanitizedIdleTimeout = clampInt(idleTimeout, 2, 1, 60);
    const sanitizedBreakDuration = clampInt(breakDuration, 5, 1, 30);
    const sanitizedSubjectLoads = Object.entries(subjectLoadOverrides).reduce<Record<string, number>>((acc, [code, raw]) => {
      const trimmed = raw.trim();
      if (!trimmed) return acc;
      const parsed = Number.parseFloat(trimmed);
      if (Number.isNaN(parsed)) return acc;
      acc[code] = Math.max(0.7, Math.min(1.8, Number(parsed.toFixed(2))));
      return acc;
    }, {});

    setValidationErrors({});
    if (finalInicetDate) setInicetDate(finalInicetDate);
    if (finalNeetDate) setNeetDate(finalNeetDate);
    setSessionLength(String(sanitizedSessionLength));
    setDailyGoal(String(sanitizedDailyGoal));
    setNotifHour(String(sanitizedNotifHour));
    setIdleTimeout(String(sanitizedIdleTimeout));
    setBreakDuration(String(sanitizedBreakDuration));

    try {
      updateUserProfile({
        openrouterApiKey: apiKey.trim(),
        openrouterKey: orKey.trim(),
        groqApiKey: groqKey.trim(),
        displayName: name.trim() || 'Doctor',
        inicetDate: finalInicetDate ?? inicetDate,
        neetDate: finalNeetDate ?? neetDate,
        preferredSessionLength: sanitizedSessionLength,
        dailyGoalMinutes: sanitizedDailyGoal,
        notificationsEnabled: notifs,
        strictModeEnabled: strictMode,
        bodyDoublingEnabled: bodyDoubling,
        blockedContentTypes: blockedTypes,
        idleTimeoutMinutes: sanitizedIdleTimeout,
        breakDurationMinutes: sanitizedBreakDuration,
        visualTimersEnabled,
        notificationHour: sanitizedNotifHour,
        guruFrequency,
        focusSubjectIds,
        customSubjectLoadMultipliers: sanitizedSubjectLoads,
      });

      if (notifs) {
        const granted = await requestNotificationPermissions();
        if (granted) {
          await refreshAccountabilityNotifications();
        }
      }

      refreshProfile();
      setIsDirty(false);
      if (autoSaveRef.current) {
        clearTimeout(autoSaveRef.current);
        autoSaveRef.current = null;
      }
      setSaveState('saved');
      if (saveStateTimeoutRef.current) clearTimeout(saveStateTimeoutRef.current);
      saveStateTimeoutRef.current = setTimeout(() => {
        setSaveState('idle');
      }, 2200);
    } catch (err: any) {
      console.error('[Settings] Save failed:', err);
      setSaveState('error');
      setSaveError(err?.message ?? 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  // Keep saveRef updated so auto-save timer always calls the latest version
  saveRef.current = save;

  async function testNotification() {
    try {
      await refreshAccountabilityNotifications();
      Alert.alert('Done', 'Notifications scheduled! Check your notification panel.');
    } catch (e) {
      Alert.alert('Error', 'Could not schedule notifications.');
    }
  }

  async function syncExamDatesNow() {
    if (examSyncBusy) return;
    setExamSyncBusy(true);
    try {
      const res = await syncExamDatesFromInternet();
      refreshProfile();
      // Update local form state so unsaved edits reflect synced dates
      if (res.inicetDate) setInicetDate(res.inicetDate);
      if (res.neetDate) setNeetDate(res.neetDate);
      const nextMeta = await getExamDateSyncMeta();
      setExamSyncMeta(nextMeta);
      Alert.alert(
        res.updated ? 'Exam Dates Updated' : 'Exam Dates Checked',
        `${res.message}\n\nINI-CET: ${res.inicetDate ?? 'Unknown'}\nNEET-PG: ${res.neetDate ?? 'Unknown'}`,
      );
    } catch (err: any) {
      Alert.alert('Exam Date Sync Failed', err?.message ?? 'Could not verify exam dates from online sources.');
    } finally {
      setExamSyncBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} testID="settings-screen">
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
      <ScrollView contentContainerStyle={styles.content} testID="settings-scroll">
        <ResponsiveContainer>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.saveStatusRow}>
          {saveState === 'saving' && (
            <>
              <ActivityIndicator size="small" color="#6C63FF" />
              <Text style={[styles.saveStatusText, styles.saveStatusPending]}>Saving changes...</Text>
            </>
          )}
          {saveState === 'idle' && isDirty && (
            <Text style={[styles.saveStatusText, styles.saveStatusPending]}>Unsaved changes. Auto-save runs in ~2 seconds.</Text>
          )}
          {saveState === 'saved' && !isDirty && (
            <Text style={[styles.saveStatusText, styles.saveStatusSaved]}>All changes saved.</Text>
          )}
          {saveState === 'error' && (
            <View style={styles.saveErrorRow}>
              <Text style={[styles.saveStatusText, styles.saveStatusError]}>{saveError || 'Save failed.'}</Text>
              <TouchableOpacity onPress={save} disabled={saving} activeOpacity={0.8}>
                <Text style={styles.retrySaveText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <Section title="🤖 AI Configuration" initiallyExpanded>
          <TouchableOpacity 
            style={[styles.testBtn, { marginTop: 0, marginBottom: 16, borderColor: '#4CAF5044' }]} 
            onPress={() => navigation.navigate('LocalModel' as any)} 
            activeOpacity={0.8}
          >
            <Text style={[styles.testBtnText, { color: '#4CAF50' }]}>🦙 Manage On-Device Models</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>
            Default routing is local model first, then Groq cloud fallback. OpenRouter and legacy keys are optional.
          </Text>

          <Label text="Groq API Key (primary cloud fallback)" />
          <TextInput
            style={styles.input}
            placeholder="gsk_..."
            placeholderTextColor={PLACEHOLDER_COLOR}
            value={groqKey}
            onChangeText={setGroqKey}
            secureTextEntry
            autoCapitalize="none"
          />
          <Text style={styles.hint}>
            Used when local model is unavailable or too slow for the task.
          </Text>

          <TouchableOpacity
            style={styles.advancedToggle}
            onPress={() => setShowAdvancedAi(prev => !prev)}
            activeOpacity={0.8}
          >
            <Text style={styles.advancedToggleText}>{showAdvancedAi ? 'Hide Advanced AI Keys ▲' : 'Show Advanced AI Keys ▼'}</Text>
          </TouchableOpacity>

          {showAdvancedAi && (
            <>
              <Label text="OpenRouter API Key (optional fallback)" />
              <TextInput
                style={styles.input}
                placeholder="sk-or-..."
                placeholderTextColor={PLACEHOLDER_COLOR}
                value={orKey}
                onChangeText={setOrKey}
                secureTextEntry
                autoCapitalize="none"
              />
              <Text style={styles.hint}>
                Secondary fallback after Groq. Useful if you want additional cloud model options.
              </Text>

              <Label text="Legacy API Key (migration only)" />
              <TextInput
                style={styles.input}
                placeholder="legacy key"
                placeholderTextColor={PLACEHOLDER_COLOR}
                value={apiKey}
                onChangeText={setApiKey}
                secureTextEntry
                autoCapitalize="none"
              />
              <Text style={styles.hint}>
                Kept only for backward compatibility with older setups.
              </Text>
            </>
          )}
        </Section>

        <Section title="✅ Permissions & Diagnostics" initiallyExpanded={false}>
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
                overlayFixPendingRef.current = true;
                await requestOverlayPermission();
                Alert.alert('Overlay Permission', 'Please enable Guru in the settings screen that just opened, then return to the app.');
              }}
            />
          )}
          <TouchableOpacity 
            style={styles.diagBtn} 
            onPress={() => Linking.openSettings()}
          >
            <Text style={styles.diagBtnText}>Open System Settings</Text>
          </TouchableOpacity>
        </Section>

        <Section title="👤 Profile" initiallyExpanded>
          {!isSyncAvailable() && (
            <Text style={[styles.hint, { color: '#F44336', marginBottom: 16 }]}>
              Tablet Sync is currently unavailable on this device (MQTT module missing).
            </Text>
          )}
          <TouchableOpacity 
            style={[styles.testBtn, { marginTop: 0, marginBottom: 16, borderColor: '#4CAF5044' }]} 
            onPress={() => navigation.navigate('DeviceLink')} 
            activeOpacity={0.8}
            disabled={!isSyncAvailable()}
          >
            <Text style={[styles.testBtnText, { color: isSyncAvailable() ? '#4CAF50' : '#555' }]}>📱 Link Another Device (Sync)</Text>
          </TouchableOpacity>
          <Label text="Your name" />
          <TextInput
            style={styles.input}
            placeholder="Dr. ..."
            placeholderTextColor={PLACEHOLDER_COLOR}
            value={name}
            onChangeText={setName}
          />
        </Section>

        <Section title="📅 Exam Dates" initiallyExpanded>
          <Label text="INICET Date" />
          <TouchableOpacity
            style={[styles.dateBtn, validationErrors.inicetDate && styles.inputError]}
            onPress={() => setDatePickerTarget('inicet')}
            activeOpacity={0.8}
          >
            <Text style={styles.dateBtnText}>
              {inicetDate ? new Date(inicetDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Tap to set date'}
            </Text>
            <Text style={styles.dateBtnIcon}>📅</Text>
          </TouchableOpacity>
          {!!validationErrors.inicetDate && <Text style={styles.fieldError}>{validationErrors.inicetDate}</Text>}

          <Label text="NEET-PG Date" />
          <TouchableOpacity
            style={[styles.dateBtn, validationErrors.neetDate && styles.inputError]}
            onPress={() => setDatePickerTarget('neet')}
            activeOpacity={0.8}
          >
            <Text style={styles.dateBtnText}>
              {neetDate ? new Date(neetDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Tap to set date'}
            </Text>
            <Text style={styles.dateBtnIcon}>📅</Text>
          </TouchableOpacity>
          {!!validationErrors.neetDate && <Text style={styles.fieldError}>{validationErrors.neetDate}</Text>}

          {datePickerTarget && (
            <DateTimePicker
              value={new Date((datePickerTarget === 'inicet' ? inicetDate : neetDate) + 'T00:00:00')}
              mode="date"
              display="default"
              minimumDate={new Date()}
              onChange={(_, selected) => {
                if (selected) {
                  const iso = selected.toISOString().slice(0, 10);
                  if (datePickerTarget === 'inicet') { setInicetDate(iso); clearFieldError('inicetDate'); }
                  else { setNeetDate(iso); clearFieldError('neetDate'); }
                }
                setDatePickerTarget(null);
              }}
            />
          )}
          <Text style={styles.hint}>
            Guru auto-checks official websites in the background whenever the app opens or returns to foreground.
          </Text>
          <Text style={styles.hint}>
            If online verification fails, you can still enter dates manually and save.
          </Text>
          <TouchableOpacity
            style={[styles.testBtn, examSyncBusy && styles.saveBtnDisabled]}
            onPress={syncExamDatesNow}
            activeOpacity={0.8}
            disabled={examSyncBusy}
          >
            {examSyncBusy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.testBtnText}>Verify Exam Dates From Internet</Text>
            )}
          </TouchableOpacity>
          {examSyncMeta?.lastCheckedAt && (
            <Text style={styles.syncMetaText}>
              Last checked: {new Date(examSyncMeta.lastCheckedAt).toLocaleString()}
            </Text>
          )}
          {examSyncMeta?.lastError && (
            <Text style={styles.syncErrorText}>{examSyncMeta.lastError}</Text>
          )}
        </Section>

        <Section title="⏱️ Study Preferences" initiallyExpanded>
          <Label text="Preferred session length (minutes)" />
          <TextInput
            style={[styles.input, validationErrors.sessionLength && styles.inputError]}
            value={sessionLength}
            onChangeText={(text) => {
              setSessionLength(text);
              clearFieldError('sessionLength');
            }}
            keyboardType="number-pad"
            placeholderTextColor={PLACEHOLDER_COLOR}
          />
          {!!validationErrors.sessionLength && <Text style={styles.fieldError}>{validationErrors.sessionLength}</Text>}
          <Label text="Daily study goal (minutes)" />
          <TextInput
            style={[styles.input, validationErrors.dailyGoal && styles.inputError]}
            value={dailyGoal}
            onChangeText={(text) => {
              setDailyGoal(text);
              clearFieldError('dailyGoal');
            }}
            keyboardType="number-pad"
            placeholderTextColor={PLACEHOLDER_COLOR}
          />
          {!!validationErrors.dailyGoal && <Text style={styles.fieldError}>{validationErrors.dailyGoal}</Text>}
          <Label text="Per-subject workload overrides" />
          <Text style={styles.hint}>
            Leave blank to use Guru's default weighting. Use higher values for subjects where your lecture load is heavier than the default plan.
          </Text>
          <View style={styles.subjectLoadList}>
            {subjects.map((subject) => {
              const rawValue = subjectLoadOverrides[subject.shortCode] ?? '';
              const defaultMultiplier = getDefaultSubjectLoadMultiplier(subject.shortCode);
              return (
                <View key={subject.id} style={styles.subjectLoadRow}>
                  <View style={styles.subjectLoadMeta}>
                    <View style={[styles.subjectDot, { backgroundColor: subject.colorHex }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.subjectLoadCode}>{subject.shortCode} · {subject.name}</Text>
                      <Text style={styles.subjectLoadHint}>Default {defaultMultiplier.toFixed(2)}x</Text>
                    </View>
                  </View>
                  <TextInput
                    style={styles.subjectLoadInput}
                    value={rawValue}
                    onChangeText={(text) => {
                      setSubjectLoadOverrides(prev => ({ ...prev, [subject.shortCode]: text }));
                    }}
                    keyboardType="decimal-pad"
                    placeholder={defaultMultiplier.toFixed(2)}
                    placeholderTextColor={PLACEHOLDER_COLOR}
                  />
                </View>
              );
            })}
          </View>
          <TouchableOpacity
            onPress={() => setSubjectLoadOverrides({})}
            style={styles.clearBtn}
            activeOpacity={0.8}
          >
            <Text style={styles.clearBtnText}>Reset all subject overrides</Text>
          </TouchableOpacity>
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
          <View style={[styles.switchRow, { marginTop: 16 }]}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={styles.switchLabel}>Visual Timers 🍅</Text>
              <Text style={styles.hint}>Show circular timers during study breaks instead of plain text.</Text>
            </View>
            <Switch
              value={visualTimersEnabled}
              onValueChange={setVisualTimersEnabled}
              trackColor={{ true: '#6C63FF', false: '#333' }}
              thumbColor="#fff"
            />
          </View>
        </Section>

        <Section title="🔔 Notifications" initiallyExpanded>
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
          <Label text="Reminder hour (0–23, e.g. 7 = 7:30 AM)" />
          <TextInput
            style={[styles.input, validationErrors.notifHour && styles.inputError]}
            value={notifHour}
            onChangeText={(text) => {
              setNotifHour(text);
              clearFieldError('notifHour');
            }}
            keyboardType="number-pad"
            placeholderTextColor={PLACEHOLDER_COLOR}
          />
          {!!validationErrors.notifHour && <Text style={styles.fieldError}>{validationErrors.notifHour}</Text>}
          <Text style={styles.hint}>Evening nudge fires ~11 hours after this.</Text>
          <Label text="Guru presence frequency" />
          <View style={styles.frequencyRow}>
            {(['rare', 'normal', 'frequent', 'off'] as const).map(freq => (
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
            How often Guru sends ambient messages during sessions. Rare: every 30min, Normal: every 20min, Frequent: every 10min.
          </Text>
          <TouchableOpacity style={styles.testBtn} onPress={testNotification} activeOpacity={0.8}>
            <Text style={styles.testBtnText}>Schedule Notifications Now</Text>
          </TouchableOpacity>
        </Section>

        <Section title="👻 Body Doubling" initiallyExpanded={false}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={styles.switchLabel}>Guru presence during sessions</Text>
              <Text style={styles.hint}>Ambient toast messages and pulsing dot while you study. Helps with focus.</Text>
            </View>
            <Switch
              value={bodyDoubling}
              onValueChange={setBodyDoubling}
              trackColor={{ true: '#6C63FF', false: '#333' }}
              thumbColor="#fff"
            />
          </View>
        </Section>

        <Section title="🃏 Content Type Preferences" initiallyExpanded={false}>
          <Text style={styles.hint}>Block card types you don't want in sessions. Keypoints can't be blocked.</Text>
          <View style={styles.chipGrid}>
            {ALL_CONTENT_TYPES.map(({ type, label }) => {
              const isBlocked = blockedTypes.includes(type);
              const isLocked = type === 'keypoints';
              return (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeChip, isBlocked && styles.typeChipBlocked, isLocked && styles.typeChipLocked]}
                  onPress={() => {
                    if (isLocked) return;
                    setBlockedTypes(prev => isBlocked ? prev.filter(t => t !== type) : [...prev, type]);
                  }}
                  activeOpacity={isLocked ? 1 : 0.8}
                >
                  <Text style={[styles.typeChipText, isBlocked && styles.typeChipTextBlocked]}>{label}</Text>
                  {isBlocked && <Text style={styles.typeChipX}> ✕</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </Section>

        <Section title="🔬 Focus Subjects" initiallyExpanded={false}>
          <Text style={styles.hint}>Pin subjects to limit sessions to those areas only. Clear all to study everything.</Text>
          <View style={styles.chipGrid}>
            {subjects.map(s => {
              const isFocused = focusSubjectIds.includes(s.id);
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.typeChip, isFocused && { backgroundColor: s.colorHex + '33', borderColor: s.colorHex }]}
                  onPress={() => setFocusSubjectIds(prev => isFocused ? prev.filter(id => id !== s.id) : [...prev, s.id])}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.typeChipText, isFocused && { color: s.colorHex }]}>{s.shortCode}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {focusSubjectIds.length > 0 && (
            <TouchableOpacity onPress={() => setFocusSubjectIds([])} style={styles.clearBtn}>
              <Text style={styles.clearBtnText}>Clear focus (study all subjects)</Text>
            </TouchableOpacity>
          )}
        </Section>

        <Section title="⏱️ Session Timing" initiallyExpanded={false}>
          <Label text="Idle timeout (minutes before auto-pause)" />
          <TextInput
            style={styles.input}
            value={idleTimeout}
            onChangeText={setIdleTimeout}
            keyboardType="number-pad"
            placeholderTextColor={PLACEHOLDER_COLOR}
          />
          <Label text="Break duration between topics (minutes)" />
          <TextInput
            style={styles.input}
            value={breakDuration}
            onChangeText={setBreakDuration}
            keyboardType="number-pad"
            placeholderTextColor={PLACEHOLDER_COLOR}
          />
        </Section>

        <Section title="🗑️ Data" initiallyExpanded={false}>
          <TouchableOpacity
            style={styles.dangerBtn}
            onPress={() => {
              const stats = getCacheStats();
              Alert.alert('Clear AI Cache?', `You have ${stats.totalCached} cached items. All content will be regenerated fresh on next use.`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: () => { clearAiCache(); Alert.alert('Done', 'AI cache cleared.'); } },
              ]);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.dangerBtnText}>🧹  Clear AI Content Cache</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>Forces fresh generation of all key points, quizzes, stories, etc.</Text>
          <TouchableOpacity
            style={[styles.dangerBtn, { borderColor: '#F4433666', marginTop: 10 }]}
            onPress={() => Alert.alert(
              'Reset all progress?',
              'This clears all topic progress, XP, streaks, and daily logs. This cannot be undone. Export a backup first.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reset', style: 'destructive', onPress: () => { resetStudyProgress(); refreshProfile(); Alert.alert('Reset', 'Progress has been wiped. Start fresh!'); } },
              ],
            )}
            activeOpacity={0.8}
          >
            <Text style={[styles.dangerBtnText, { color: '#F44336' }]}>💀  Reset All Progress</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>Wipes XP, streaks, topic statuses, and daily logs. API keys are kept.</Text>
        </Section>

        <Section title="💾 Backup & Restore" initiallyExpanded={false}>
          <Text style={styles.hint}>Export your study progress to a JSON file, or restore from a previous backup.</Text>
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
              <Text style={[styles.backupBtnText, { color: '#4CAF50' }]}>⬇️  Import JSON</Text>
            </TouchableOpacity>
          </View>
          
          <Text style={[styles.hint, { marginTop: 16 }]}>Full SQLite Database Backup (Advanced)</Text>
          <View style={styles.backupRow}>
            <TouchableOpacity style={styles.backupBtn} activeOpacity={0.8} onPress={() => exportDatabase()}>
              <Text style={styles.backupBtnText}>⬆️ Export .db</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.backupBtn, { borderColor: '#4CAF5066' }]} activeOpacity={0.8} onPress={() => importDatabase()}>
              <Text style={[styles.backupBtnText, { color: '#4CAF50' }]}>⬇️ Import .db</Text>
            </TouchableOpacity>
          </View>
        </Section>

        <Text style={styles.footer}>
          NEET Study — Powered by Guru AI{'\n'}
          v1.0.0 · Local Qwen + Groq routing
        </Text>
        </ResponsiveContainer>
      </ScrollView>

    </SafeAreaView>
  );
}

function Section({ title, children, initiallyExpanded = true }: { title: string; children: React.ReactNode; initiallyExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  return (
    <View style={styles.section}>
      <TouchableOpacity style={styles.sectionHeader} onPress={() => setExpanded(!expanded)} activeOpacity={0.8}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionToggle}>{expanded ? '▼' : '▶'}</Text>
      </TouchableOpacity>
      {expanded && <View style={styles.sectionContent}>{children}</View>}
    </View>
  );
}

function PermissionRow({ label, status, onFix }: { label: string; status: string; onFix: () => void }) {
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
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  content: { padding: 16, paddingBottom: 60 },
  title: { color: '#fff', fontSize: 26, fontWeight: '900', marginBottom: 8, marginTop: 8 },
  saveStatusRow: { minHeight: 22, marginBottom: 12, justifyContent: 'center' },
  saveStatusText: { fontSize: 12, fontWeight: '600' },
  saveStatusPending: { color: '#A6ADBE' },
  saveStatusSaved: { color: '#4CAF50' },
  saveStatusError: { color: '#FF7B7B', flex: 1 },
  saveErrorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  retrySaveText: { color: '#6C63FF', fontSize: 12, fontWeight: '800' },
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  sectionTitle: { color: '#BEC4D1', fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  sectionToggle: { color: '#6C63FF', fontSize: 12, fontWeight: '700' },
  sectionContent: { backgroundColor: '#1A1A24', borderRadius: 16, padding: 16 },
  label: { color: '#C8CDDA', fontSize: 13, marginBottom: 6, marginTop: 8 },
  input: { backgroundColor: '#0F0F14', borderRadius: 10, padding: 12, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: '#2A2A38', marginBottom: 4 },
  inputError: { borderColor: '#FF6B6B' },
  dateBtn: { backgroundColor: '#0F0F14', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 14, borderWidth: 1, borderColor: '#2A2A38', marginBottom: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  dateBtnIcon: { fontSize: 16 },
  fieldError: { color: '#FF9D9D', fontSize: 11, marginBottom: 2 },
  hint: { color: '#A4ABBB', fontSize: 12, marginBottom: 4 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  switchLabel: { color: '#fff', fontWeight: '600', fontSize: 15, marginBottom: 2 },
  testBtn: { marginTop: 12, backgroundColor: '#1A1A2E', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#6C63FF44' },
  testBtnText: { color: '#6C63FF', fontWeight: '600', fontSize: 14 },
  syncMetaText: { color: '#97A0B4', fontSize: 11, marginTop: 8 },
  syncErrorText: { color: '#FF9D9D', fontSize: 11, marginTop: 6 },
  advancedToggle: { marginTop: 10, marginBottom: 6, alignSelf: 'flex-start' },
  advancedToggleText: { color: '#6C63FF', fontSize: 13, fontWeight: '700' },
  saveBtnDisabled: { backgroundColor: '#333' },
  backupRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  backupBtn: { flex: 1, backgroundColor: '#0F0F14', borderRadius: 10, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#6C63FF66' },
  backupBtnText: { color: '#6C63FF', fontWeight: '700', fontSize: 14 },
  backupDate: { color: '#9EA6B8', fontSize: 11, textAlign: 'center', fontStyle: 'italic', marginBottom: 8 },
  frequencyRow: { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 4 },
  freqBtn: { flex: 1, backgroundColor: '#0F0F14', borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#2A2A38' },
  freqBtnActive: { backgroundColor: '#6C63FF33', borderColor: '#6C63FF' },
  freqText: { color: '#C8CDD8', fontSize: 13, fontWeight: '600' },
  freqTextActive: { color: '#6C63FF', fontWeight: '700' },
  footer: { color: '#7B8191', fontSize: 11, textAlign: 'center', marginTop: 24, lineHeight: 18 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  subjectLoadList: { gap: 10, marginTop: 8 },
  subjectLoadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: '#0F0F14',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A38',
    padding: 12,
  },
  subjectLoadMeta: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  subjectDot: { width: 10, height: 10, borderRadius: 999 },
  subjectLoadCode: { color: '#F1F4FA', fontSize: 13, fontWeight: '700' },
  subjectLoadHint: { color: '#97A0B4', fontSize: 11, marginTop: 2 },
  subjectLoadInput: {
    width: 72,
    backgroundColor: '#151826',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2A38',
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  typeChip: { backgroundColor: '#0F0F14', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#2A2A38', flexDirection: 'row', alignItems: 'center' },
  typeChipBlocked: { backgroundColor: '#2A0A0A', borderColor: '#F4433666' },
  typeChipLocked: { borderColor: '#6C63FF44', opacity: 0.5 },
  typeChipText: { color: '#E0E0E0', fontSize: 13, fontWeight: '600' },
  typeChipTextBlocked: { color: '#F44336' },
  typeChipX: { color: '#F44336', fontSize: 11 },
  clearBtn: { marginTop: 10, padding: 10, alignItems: 'center' },
  clearBtnText: { color: '#B4BBCB', fontSize: 13 },
  dangerBtn: { backgroundColor: '#0F0F14', borderRadius: 10, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#6C63FF44' },
  dangerBtnText: { color: '#6C63FF', fontWeight: '700', fontSize: 14 },
  modelSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0F0F14', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#2A2A38', marginBottom: 8 },
  modelSelectorText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  modelSelectorArrow: { color: '#B9BFCE', fontSize: 12 },
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
  // Diagnostics
  permRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2A2A38' },
  permLabel: { color: '#E0E0E0', fontSize: 14, fontWeight: '600' },
  permStatus: { fontSize: 12, marginTop: 2 },
  permOk: { color: '#4CAF50' },
  permError: { color: '#F44336' },
  fixBtn: { backgroundColor: '#6C63FF22', borderWidth: 1, borderColor: '#6C63FF', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  fixBtnText: { color: '#6C63FF', fontSize: 12, fontWeight: '800' },
  diagBtn: { marginTop: 12, alignItems: 'center', padding: 10 },
  diagBtnText: { color: '#B6BDCD', fontSize: 13, textDecorationLine: 'underline' },
});
