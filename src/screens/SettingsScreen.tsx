import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';
import { useAppStore } from '../store/useAppStore';
import { profileRepository } from '../db/repositories';
import { exportDatabase, importDatabase } from '../services/backupService';
import { exportJsonBackup, importJsonBackup } from '../services/jsonBackupService';
import { ResponsiveContainer } from '../hooks/useResponsive';
import {
  requestNotificationPermissions,
  refreshAccountabilityNotifications,
} from '../services/notificationService';
import ApiKeySection from '../components/settings/ApiKeySection';
import StudyGoalsSection from '../components/settings/StudyGoalsSection';
import AdvancedToolsSection from '../components/settings/AdvancedToolsSection';
import PermissionRow from '../components/settings/PermissionRow';
import ProfileSection from '../components/settings/ProfileSection';
import NotificationSection from '../components/settings/NotificationSection';
import StudyPreferencesSection from '../components/settings/StudyPreferencesSection';
import ContentPreferencesSection from '../components/settings/ContentPreferencesSection';
import { isSyncAvailable } from '../services/deviceSyncService';
import { getExamDateSyncMeta, syncExamDatesFromInternet } from '../services/examDateSyncService';
import { getAllSubjects } from '../db/queries/topics';
import type { ContentType, Subject } from '../types';
import { DEFAULT_INICET_DATE, DEFAULT_NEET_DATE } from '../config/appConfig';
import { theme } from '../constants/theme';

const ALL_CONTENT_TYPES: { type: ContentType; label: string }[] = [
  { type: 'keypoints', label: 'Key Points' },
  { type: 'quiz', label: 'Quiz' },
  { type: 'story', label: 'Story' },
  { type: 'mnemonic', label: 'Mnemonic' },
  { type: 'teach_back', label: 'Teach Back' },
  { type: 'error_hunt', label: 'Error Hunt' },
  { type: 'detective', label: 'Detective' },
];

type ValidationErrors = Partial<
  Record<'inicetDate' | 'neetDate' | 'sessionLength' | 'dailyGoal' | 'notifHour', string>
>;

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
    } else return null;
  }
  if (y < 2020 || y > 2035 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) {
    return `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
  }
  return null;
}

export default function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isFocused = useIsFocused();
  const { profile, refreshProfile } = useAppStore();

  const [permStatus, setPermStatus] = useState({
    notifs: 'undetermined',
    overlay: 'undetermined',
    mic: 'undetermined',
  });
  const [apiKey, setApiKey] = useState('');
  const [orKey, setOrKey] = useState('');
  const [groqKey, setGroqKey] = useState('');
  const [name, setName] = useState('');
  const [inicetDate, setInicetDate] = useState(DEFAULT_INICET_DATE);
  const [neetDate, setNeetDate] = useState(DEFAULT_NEET_DATE);
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
  const [guruFrequency, setGuruFrequency] = useState<'rare' | 'normal' | 'frequent' | 'off'>(
    'normal',
  );
  const [focusSubjectIds, setFocusSubjectIds] = useState<number[]>([]);
  const [subjectLoadOverrides, setSubjectLoadOverrides] = useState<Record<string, string>>({});
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef<() => void>(() => {});

  const markDirty = useCallback(() => {
    setIsDirty(true);
    if (saveState !== 'saving') setSaveState('idle');
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      saveRef.current();
    }, 2000);
  }, [saveState]);

  const clearFieldError = useCallback((field: keyof ValidationErrors) => {
    setValidationErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const clampInt = useCallback(
    (raw: string, fallback: number, min: number, max: number): number => {
      const parsed = Number.parseInt(raw, 10);
      if (Number.isNaN(parsed)) return fallback;
      return Math.max(min, Math.min(max, parsed));
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
      if (saveStateTimeoutRef.current) clearTimeout(saveStateTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isFocused && isDirty) saveRef.current();
  }, [isFocused, isDirty]);

  useEffect(() => {
    if (isFocused) {
      checkPermissions();
      getExamDateSyncMeta()
        .then(() => {}) // We don't use the meta in UI yet, but we check if it works
        .catch((err) => {
          console.warn('[Settings] Failed to load exam sync meta:', err);
        });
    }
  }, [isFocused]);

  async function checkPermissions() {
    try {
      const n = await Notifications.getPermissionsAsync();
      const m = await Audio.getPermissionsAsync();
      let o = 'undetermined';
      if (Platform.OS === 'android') {
        const { canDrawOverlays } = require('../../modules/app-launcher');
        const hasOverlay = await canDrawOverlays();
        o = hasOverlay ? 'granted' : 'denied';
      }
      setPermStatus({ notifs: n.status, mic: m.status, overlay: o });
    } catch (err) {
      console.error('[Settings] Permission check failed:', err);
    }
  }

  useEffect(() => {
    void getAllSubjects()
      .then(setSubjects)
      .catch((err) => {
        console.error('[Settings] Failed to load subjects:', err);
      });
    if (profile) {
      setApiKey(profile.openrouterApiKey?.split('|')[0] ?? '');
      setOrKey(profile.openrouterKey ?? '');
      setGroqKey(profile.groqApiKey ?? '');
      setName(profile.displayName);
      setInicetDate(profile.inicetDate || DEFAULT_INICET_DATE);
      setNeetDate(profile.neetDate || DEFAULT_NEET_DATE);
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
          Object.entries(profile.customSubjectLoadMultipliers ?? {}).map(([c, v]) => [
            c,
            String(v),
          ]),
        ),
      );
    }
  }, [profile]);

  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (!initialLoadDone.current) {
      if (profile) initialLoadDone.current = true;
      return;
    }
    markDirty();
  }, [
    apiKey,
    orKey,
    groqKey,
    name,
    inicetDate,
    neetDate,
    sessionLength,
    dailyGoal,
    notifs,
    strictMode,
    bodyDoubling,
    blockedTypes,
    idleTimeout,
    breakDuration,
    visualTimersEnabled,
    notifHour,
    guruFrequency,
    focusSubjectIds,
    subjectLoadOverrides,
    markDirty,
    profile,
  ]);

  async function save() {
    if (saving) return;
    if (autoSaveRef.current) {
      clearTimeout(autoSaveRef.current);
      autoSaveRef.current = null;
    }
    setSaving(true);
    setSaveState('saving');

    const nextErrors: ValidationErrors = {};
    const normalizedInicet = normalizeUserDateInput(inicetDate);
    const normalizedNeet = normalizeUserDateInput(neetDate);

    const finalInicet = normalizedInicet ?? profile?.inicetDate;
    const finalNeet = normalizedNeet ?? profile?.neetDate;

    if (!normalizedInicet && inicetDate.trim() !== profile?.inicetDate) {
      nextErrors.inicetDate = 'Invalid date format (Use YYYY-MM-DD)';
    } else if (!finalInicet) {
      nextErrors.inicetDate = 'Invalid INICET date';
    }

    if (!normalizedNeet && neetDate.trim() !== profile?.neetDate) {
      nextErrors.neetDate = 'Invalid date format (Use YYYY-MM-DD)';
    } else if (!finalNeet) {
      nextErrors.neetDate = 'Invalid NEET date';
    }

    if (Object.keys(nextErrors).length > 0) {
      setValidationErrors(nextErrors);
      setSaveState('error');
      setSaving(false);
      return;
    }

    try {
      await profileRepository.updateProfile({
        openrouterApiKey: apiKey.trim(),
        openrouterKey: orKey.trim(),
        groqApiKey: groqKey.trim(),
        displayName: name.trim() || 'Doctor',
        inicetDate: finalInicet!,
        neetDate: finalNeet!,
        preferredSessionLength: clampInt(sessionLength, 45, 10, 240),
        dailyGoalMinutes: clampInt(dailyGoal, 120, 30, 720),
        notificationsEnabled: notifs,
        strictModeEnabled: strictMode,
        bodyDoublingEnabled: bodyDoubling,
        blockedContentTypes: blockedTypes,
        idleTimeoutMinutes: clampInt(idleTimeout, 2, 1, 60),
        breakDurationMinutes: clampInt(breakDuration, 5, 1, 30),
        visualTimersEnabled,
        notificationHour: clampInt(notifHour, 7, 0, 23),
        guruFrequency,
        focusSubjectIds,
        customSubjectLoadMultipliers: Object.fromEntries(
          Object.entries(subjectLoadOverrides).map(([c, v]) => [c, parseFloat(v) || 1.0]),
        ),
      });
      if (notifs) {
        const g = await requestNotificationPermissions();
        if (g) await refreshAccountabilityNotifications();
      }
      await refreshProfile();
      setIsDirty(false);
      setSaveState('saved');
      saveStateTimeoutRef.current = setTimeout(() => setSaveState('idle'), 2200);
    } catch (err: unknown) {
      setSaveState('error');
      console.error('[Settings] Save failed:', err);
    } finally {
      setSaving(false);
    }
  }
  saveRef.current = save;

  async function syncExamDatesNow() {
    if (examSyncBusy) return;
    setExamSyncBusy(true);
    try {
      const res = await syncExamDatesFromInternet();
      if (res.inicetDate) setInicetDate(res.inicetDate);
      if (res.neetDate) setNeetDate(res.neetDate);
      await refreshProfile();
      Alert.alert(res.updated ? 'Updated' : 'Checked', res.message);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Sync Failed', message);
    } finally {
      setExamSyncBusy(false);
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
        await profileRepository.updateProfile({ backupDirectoryUri: permissions.directoryUri });
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

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <ScrollView contentContainerStyle={styles.content}>
        <ResponsiveContainer>
          <View style={styles.header}>
            <Text style={styles.title}>Settings</Text>
            <Text style={styles.saveStatus}>
              {saveState === 'saving'
                ? 'Saving...'
                : saveState === 'saved'
                  ? 'Saved'
                  : isDirty
                    ? 'Unsaved changes'
                    : ''}
            </Text>
          </View>

          <Section title="👤 Profile">
            <ProfileSection
              name={name}
              onNameChange={setName}
              isSyncAvailable={isSyncAvailable()}
              onLinkDevice={() => navigation.navigate('DeviceLink')}
            />
          </Section>

          <Section title="🤖 AI Configuration">
            <ApiKeySection
              groqKey={groqKey}
              onGroqKeyChange={setGroqKey}
              openRouterKey={orKey}
              onOpenRouterKeyChange={setOrKey}
            />
          </Section>

          <Section title="✅ Permissions">
            <PermissionRow
              label="Notifications"
              status={permStatus.notifs}
              onFix={() =>
                Notifications.requestPermissionsAsync()
                  .then(checkPermissions)
                  .catch((err) => console.error('[Settings] Notif permission request failed:', err))
              }
            />
            <PermissionRow
              label="Microphone"
              status={permStatus.mic}
              onFix={() =>
                Audio.requestPermissionsAsync()
                  .then(checkPermissions)
                  .catch((err) => console.error('[Settings] Mic permission request failed:', err))
              }
            />
            {Platform.OS === 'android' && (
              <PermissionRow
                label="Draw Over Apps"
                status={permStatus.overlay}
                onFix={async () => {
                  const { requestOverlayPermission } = require('../../modules/app-launcher');
                  await requestOverlayPermission();
                  Alert.alert('Overlay', 'Enable Guru in settings and return.');
                }}
              />
            )}
            {Platform.OS === 'android' && (
              <PermissionRow
                label="Persistent Backup Folder"
                status={profile?.backupDirectoryUri ? 'granted' : 'undetermined'}
                onFix={handleSelectBackupDir}
              />
            )}
          </Section>

          <Section title="📅 Study Goals">
            <StudyGoalsSection
              inicetDate={inicetDate}
              neetDate={neetDate}
              sessionLength={sessionLength}
              dailyGoal={dailyGoal}
              onInicetDateChange={(t) => {
                setInicetDate(t);
                clearFieldError('inicetDate');
              }}
              onNeetDateChange={(t) => {
                setNeetDate(t);
                clearFieldError('neetDate');
              }}
              onSessionLengthChange={setSessionLength}
              onDailyGoalChange={setDailyGoal}
              errorInicet={validationErrors.inicetDate}
              errorNeet={validationErrors.neetDate}
            />
            <TouchableOpacity
              style={styles.testBtn}
              onPress={syncExamDatesNow}
              disabled={examSyncBusy}
            >
              <Text style={styles.testBtnText}>
                {examSyncBusy ? 'Checking...' : 'Verify Dates from Internet'}
              </Text>
            </TouchableOpacity>
          </Section>

          <Section title="⚙️ Study Preferences">
            <StudyPreferencesSection
              strictMode={strictMode}
              onStrictModeChange={setStrictMode}
              visualTimers={visualTimersEnabled}
              onVisualTimersChange={setVisualTimersEnabled}
              bodyDoubling={bodyDoubling}
              onBodyDoublingChange={setBodyDoubling}
            />
          </Section>

          <Section title="🔔 Notifications">
            <NotificationSection
              enabled={notifs}
              onEnabledChange={setNotifs}
              hour={notifHour}
              onHourChange={(t) => {
                setNotifHour(t);
                clearFieldError('notifHour');
              }}
              frequency={guruFrequency}
              onFrequencyChange={setGuruFrequency}
              onTest={() => refreshAccountabilityNotifications().then(() => Alert.alert('Done'))}
              error={validationErrors.notifHour}
            />
          </Section>

          <Section title="🃏 Content & Subjects">
            <ContentPreferencesSection
              subjects={subjects}
              focusSubjectIds={focusSubjectIds}
              onFocusSubjectToggle={(id) =>
                setFocusSubjectIds((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                )
              }
              onClearFocus={() => setFocusSubjectIds([])}
              allContentTypes={ALL_CONTENT_TYPES}
              blockedTypes={blockedTypes}
              onContentTypeToggle={(type) =>
                setBlockedTypes((prev) =>
                  prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
                )
              }
            />
          </Section>

          <AdvancedToolsSection
            onExportBackup={exportDatabase}
            onImportBackup={importDatabase}
            onExportJsonBackup={async () => {
              setBackupBusy(true);
              await exportJsonBackup();
              setBackupBusy(false);
            }}
            onImportJsonBackup={async () => {
              setBackupBusy(true);
              const res = await importJsonBackup();
              setBackupBusy(false);
              if (res.ok) {
                Alert.alert('Restored', res.message);
                await refreshProfile();
              } else Alert.alert('Error', res.message);
            }}
            onClearCache={async () => {
              await profileRepository.clearAiCache();
              Alert.alert('Cleared');
            }}
            onResetProgress={async () => {
              Alert.alert('Reset All?', 'Sure?', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Reset',
                  style: 'destructive',
                  onPress: async () => {
                    await profileRepository.resetStudyProgress();
                    await refreshProfile();
                  },
                },
              ]);
            }}
            isExporting={backupBusy}
            isImporting={backupBusy}
          />
        </ResponsiveContainer>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, paddingBottom: 60 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: { color: theme.colors.textPrimary, fontSize: 28, fontWeight: '900' },
  saveStatus: { color: theme.colors.textSecondary, fontSize: 12 },
  section: { marginBottom: 24 },
  sectionTitle: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  sectionContent: {
    backgroundColor: theme.colors.panel,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  label: { color: theme.colors.textPrimary, fontSize: 14, fontWeight: '600' },
  testBtn: {
    marginTop: 12,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  testBtnText: { color: theme.colors.primary, fontWeight: '700', fontSize: 14 },
});
