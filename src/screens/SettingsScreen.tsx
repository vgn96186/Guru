import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  PermissionsAndroid,
  Modal,
  Pressable,
  KeyboardAvoidingView,
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
  testGeminiConnection,
  testCloudflareConnection,
  testBraveSearchConnection,
  testFalConnection,
  testGitHubModelsConnection,
  testKiloConnection,
  testDeepgramConnection,
} from '../services/ai/providerHealth';
import type { ContentType, ProviderId, Subject, UserProfile } from '../types';
import { DEFAULT_PROVIDER_ORDER, PROVIDER_DISPLAY_NAMES } from '../types';
import {
  requestDeviceCode,
  pollForAuthorization,
  exchangeForTokens,
  saveTokens,
  clearTokens,
  VERIFICATION_URL,
  type DeviceCodeResponse,
} from '../services/ai/chatgpt';
import { theme } from '../constants/theme';
import {
  DEFAULT_HF_TRANSCRIPTION_MODEL,
  DEFAULT_INICET_DATE,
  DEFAULT_IMAGE_GENERATION_MODEL,
  DEFAULT_NEET_DATE,
  FAL_IMAGE_GENERATION_MODEL_OPTIONS,
  IMAGE_GENERATION_MODEL_OPTIONS,
  normalizeImageGenerationModel,
} from '../config/appConfig';
import { formatGuruChatModelChipLabel } from '../services/ai/guruChatModelPreference';
import { useLiveGuruChatModels } from '../hooks/useLiveGuruChatModels';
import { getLocalLlmRamWarning, isLocalLlmAllowedOnThisDevice } from '../services/deviceMemory';
import ScreenHeader from '../components/ScreenHeader';
import TranscriptionSettingsPanel from '../components/TranscriptionSettingsPanel';

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
const LOCAL_FILE_ACCESS_PERMISSION =
  PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO ??
  PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;

type BackupRow = Record<string, unknown>;

interface AppBackup {
  version: number;
  exportedAt: string;
  user_profile: BackupRow | null;
  topic_progress: BackupRow[];
  daily_log: BackupRow[];
  lecture_notes: BackupRow[];
}

type ValidationProviderId = ProviderId | 'deepgram' | 'fal' | 'brave';
type ApiValidationEntry = { verified: boolean; verifiedAt: number; fingerprint: string };
type ApiValidationState = Partial<Record<ValidationProviderId, ApiValidationEntry>>;

function fingerprintSecret(secret: string): string {
  // Lightweight stable fingerprint so we never persist raw secret copies.
  let hash = 5381;
  for (let i = 0; i < secret.length; i += 1) {
    hash = (hash * 33) ^ secret.charCodeAt(i);
  }
  return `fp_${(hash >>> 0).toString(16)}`;
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

function sanitizeProviderOrder(value: unknown): ProviderId[] {
  if (!Array.isArray(value)) return [...DEFAULT_PROVIDER_ORDER];
  const allowed = new Set<ProviderId>(DEFAULT_PROVIDER_ORDER);
  const next = value.filter(
    (item): item is ProviderId => typeof item === 'string' && allowed.has(item as ProviderId),
  );
  for (const provider of DEFAULT_PROVIDER_ORDER) {
    if (!next.includes(provider)) next.push(provider);
  }
  return next;
}

function sanitizeApiValidationState(value: unknown): ApiValidationState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as ApiValidationState;
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
  const profile = useAppStore((state) => state.profile);
  const refreshProfile = useAppStore((state) => state.refreshProfile);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  function SectionToggle({
    id,
    title,
    icon,
    tint,
    children,
  }: {
    id: string;
    title: string;
    icon: keyof typeof Ionicons.glyphMap;
    tint: string;
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
          <View style={styles.sectionHeaderLeft}>
            <View
              style={[
                styles.sectionIconWrap,
                { backgroundColor: `${tint}18`, borderColor: `${tint}55` },
              ]}
            >
              <Ionicons name={icon} size={18} color={tint} />
            </View>
            <Text style={styles.sectionTitle}>{title}</Text>
          </View>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={theme.colors.textMuted}
          />
        </TouchableOpacity>
        {isExpanded && <View style={styles.sectionContent}>{children}</View>}
      </View>
    );
  }

  function SubSectionToggle({
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
      <View>
        <TouchableOpacity
          style={styles.subSectionHeader}
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
          <Text style={styles.subSectionLabel}>{title}</Text>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={theme.colors.primary}
          />
        </TouchableOpacity>
        {isExpanded && children}
      </View>
    );
  }

  // Permissions State
  const [permStatus, setPermStatus] = useState({
    notifs: 'undetermined',
    overlay: 'undetermined',
    mic: 'undetermined',
    localFiles: 'undetermined',
  });

  const [groqKey, setGroqKey] = useState('');
  const [orKey, setOrKey] = useState('');
  const [huggingFaceToken, setHuggingFaceToken] = useState('');
  const [huggingFaceModel, setHuggingFaceModel] = useState(DEFAULT_HF_TRANSCRIPTION_MODEL);
  const [transcriptionProvider, setTranscriptionProvider] = useState<
    'auto' | 'groq' | 'huggingface' | 'cloudflare' | 'deepgram' | 'local'
  >('auto');
  const [name, setName] = useState('');
  const [inicetDate, setInicetDate] = useState(DEFAULT_INICET_DATE);
  const [neetDate, setNeetDate] = useState(DEFAULT_NEET_DATE);
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
  const [githubModelsPat, setGithubModelsPat] = useState('');
  const [testingGithubPat, setTestingGithubPat] = useState(false);
  const [githubPatTestResult, setGithubPatTestResult] = useState<'ok' | 'fail' | null>(null);
  const [testingOpenRouterKey, setTestingOpenRouterKey] = useState(false);
  const [openRouterKeyTestResult, setOpenRouterKeyTestResult] = useState<'ok' | 'fail' | null>(
    null,
  );
  const [testingHuggingFaceToken, setTestingHuggingFaceToken] = useState(false);
  const [huggingFaceTokenTestResult, setHuggingFaceTokenTestResult] = useState<
    'ok' | 'fail' | null
  >(null);
  const [geminiKey, setGeminiKey] = useState('');
  const [cfAccountId, setCfAccountId] = useState('');
  const [cfApiToken, setCfApiToken] = useState('');
  const [falApiKey, setFalApiKey] = useState('');
  const [braveSearchApiKey, setBraveSearchApiKey] = useState('');
  const [testingGeminiKey, setTestingGeminiKey] = useState(false);
  const [geminiKeyTestResult, setGeminiKeyTestResult] = useState<'ok' | 'fail' | null>(null);
  const [testingCloudflare, setTestingCloudflare] = useState(false);
  const [cloudflareTestResult, setCloudflareTestResult] = useState<'ok' | 'fail' | null>(null);
  const [testingFalKey, setTestingFalKey] = useState(false);
  const [falKeyTestResult, setFalKeyTestResult] = useState<'ok' | 'fail' | null>(null);
  const [testingBraveSearchKey, setTestingBraveSearchKey] = useState(false);
  const [braveSearchKeyTestResult, setBraveSearchKeyTestResult] = useState<'ok' | 'fail' | null>(
    null,
  );
  const [kiloApiKey, setKiloApiKey] = useState('');
  const [testingKiloKey, setTestingKiloKey] = useState(false);
  const [kiloKeyTestResult, setKiloKeyTestResult] = useState<'ok' | 'fail' | null>(null);
  const [deepseekKey, setDeepseekKey] = useState('');
  const [testingDeepseekKey, setTestingDeepseekKey] = useState(false);
  const [deepseekKeyTestResult, setDeepseekKeyTestResult] = useState<'ok' | 'fail' | null>(null);
  const [agentRouterKey, setAgentRouterKey] = useState('');
  const [testingAgentRouterKey, setTestingAgentRouterKey] = useState(false);
  const [agentRouterKeyTestResult, setAgentRouterKeyTestResult] = useState<'ok' | 'fail' | null>(
    null,
  );
  const [deepgramApiKey, setDeepgramApiKey] = useState('');
  const [testingDeepgramKey, setTestingDeepgramKey] = useState(false);
  const [deepgramKeyTestResult, setDeepgramKeyTestResult] = useState<'ok' | 'fail' | null>(null);
  const [apiValidation, setApiValidation] = useState<ApiValidationState>({});
  const [chatgptConnected, setChatgptConnected] = useState(false);
  const [chatgptConnecting, setChatgptConnecting] = useState(false);
  const [chatgptDeviceCode, setChatgptDeviceCode] = useState<DeviceCodeResponse | null>(null);
  const [guruChatDefaultModel, setGuruChatDefaultModel] = useState('auto');
  const [imageGenerationModel, setImageGenerationModel] = useState<string>(
    DEFAULT_IMAGE_GENERATION_MODEL,
  );
  const [guruMemoryNotes, setGuruMemoryNotes] = useState('');
  const [preferGeminiStructuredJson, setPreferGeminiStructuredJson] = useState(true);
  const [providerOrder, setProviderOrder] = useState<import('../types').ProviderId[]>([]);
  const profileHydrationSignatureRef = useRef<string | null>(null);

  const markProviderValidated = useCallback((provider: ValidationProviderId, secret: string) => {
    const normalized = secret.trim();
    if (!normalized) return;
    setApiValidation((prev) => ({
      ...sanitizeApiValidationState(prev),
      [provider]: {
        verified: true,
        verifiedAt: Date.now(),
        fingerprint: fingerprintSecret(normalized),
      },
    }));
  }, []);

  const clearProviderValidated = useCallback((provider: ValidationProviderId) => {
    setApiValidation((prev) => {
      const safePrev = sanitizeApiValidationState(prev);
      if (!safePrev[provider]) return safePrev;
      const next = { ...safePrev };
      delete next[provider];
      return next;
    });
  }, []);

  const resolveValidationStatus = useCallback(
    (
      provider: ValidationProviderId,
      liveResult: 'ok' | 'fail' | null,
      secret: string,
    ): 'ok' | 'fail' | null => {
      if (liveResult) return liveResult;
      const normalized = secret.trim();
      if (!normalized) return null;
      const persisted = sanitizeApiValidationState(apiValidation)[provider];
      if (!persisted?.verified || !persisted.fingerprint) return null;
      return persisted.fingerprint === fingerprintSecret(normalized) ? 'ok' : null;
    },
    [apiValidation],
  );

  const liveGuruChatModels = useLiveGuruChatModels(profile ?? null, {
    groqApiKey: groqKey,
    openrouterKey: orKey,
    geminiKey: geminiKey,
    cloudflareAccountId: cfAccountId,
    cloudflareApiToken: cfApiToken,
    githubModelsPat,
    kiloApiKey,
    deepseekKey,
    agentRouterKey,
    chatgptConnected,
  });

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
    if (res.ok) markProviderValidated('groq', key);
    else clearProviderValidated('groq');
    setTestingGroqKey(false);
  }

  async function testGithubModelsPat() {
    const pat = githubModelsPat.trim() || profile?.githubModelsPat || '';
    if (!pat) {
      Alert.alert('No token', 'Enter a GitHub personal access token with Models access first.');
      return;
    }
    setTestingGithubPat(true);
    setGithubPatTestResult(null);
    const res = await testGitHubModelsConnection(pat);
    setGithubPatTestResult(res.ok ? 'ok' : 'fail');
    if (res.ok) markProviderValidated('github', pat);
    else clearProviderValidated('github');
    setTestingGithubPat(false);
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
    if (res.ok) markProviderValidated('openrouter', key);
    else clearProviderValidated('openrouter');
    setTestingOpenRouterKey(false);
  }

  async function testKiloKey() {
    const key = kiloApiKey.trim() || profile?.kiloApiKey || '';
    if (!key) {
      Alert.alert('No key', 'Enter a Kilo API key first.');
      return;
    }
    setTestingKiloKey(true);
    setKiloKeyTestResult(null);
    const res = await testKiloConnection(key);
    setKiloKeyTestResult(res.ok ? 'ok' : 'fail');
    if (res.ok) markProviderValidated('kilo', key);
    else clearProviderValidated('kilo');
    setTestingKiloKey(false);
  }

  async function testDeepseekKey() {
    const key = deepseekKey.trim() || profile?.deepseekKey || '';
    if (!key) {
      Alert.alert('No key', 'Enter a DeepSeek API key first.');
      return;
    }
    setTestingDeepseekKey(true);
    setDeepseekKeyTestResult(null);
    try {
      const res = await fetch('https://api.deepseek.com/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
      setDeepseekKeyTestResult(res.ok ? 'ok' : 'fail');
      if (res.ok) markProviderValidated('deepseek', key);
      else clearProviderValidated('deepseek');
    } catch {
      setDeepseekKeyTestResult('fail');
      clearProviderValidated('deepseek');
    }
    setTestingDeepseekKey(false);
  }

  async function testAgentRouterKey() {
    const key = agentRouterKey.trim() || profile?.agentRouterKey || '';
    if (!key) {
      Alert.alert('No key', 'Enter an AgentRouter key first.');
      return;
    }
    setTestingAgentRouterKey(true);
    setAgentRouterKeyTestResult(null);
    try {
      const res = await fetch('https://agentrouter.org/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          'User-Agent': 'Kilo-Code/5.11.0',
          'HTTP-Referer': 'https://kilocode.ai',
          'X-Title': 'Kilo Code',
          'X-KiloCode-Version': '5.11.0',
          'x-stainless-arch': 'x64',
          'x-stainless-lang': 'js',
          'x-stainless-os': 'Android',
          'x-stainless-package-version': '6.32.0',
          'x-stainless-retry-count': '0',
          'x-stainless-runtime': 'node',
          'x-stainless-runtime-version': 'v20.20.0',
        },
        body: JSON.stringify({
          model: 'deepseek-v3.2',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 5,
        }),
      });
      setAgentRouterKeyTestResult(res.ok ? 'ok' : 'fail');
      if (res.ok) markProviderValidated('agentrouter', key);
      else clearProviderValidated('agentrouter');
    } catch {
      setAgentRouterKeyTestResult('fail');
      clearProviderValidated('agentrouter');
    }
    setTestingAgentRouterKey(false);
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

  async function testDeepgramKey() {
    const key = deepgramApiKey.trim() || (profile as any)?.deepgramApiKey || '';
    if (!key) {
      Alert.alert('No key', 'Enter a Deepgram API key first.');
      return;
    }
    setTestingDeepgramKey(true);
    setDeepgramKeyTestResult(null);
    const res = await testDeepgramConnection(key);
    setDeepgramKeyTestResult(res.ok ? 'ok' : 'fail');
    if (res.ok) markProviderValidated('deepgram', key);
    else clearProviderValidated('deepgram');
    setTestingDeepgramKey(false);
  }

  async function connectChatGpt() {
    setChatgptConnecting(true);
    try {
      const dc = await requestDeviceCode();
      setChatgptDeviceCode(dc);
      // Open verification page in browser
      Linking.openURL(VERIFICATION_URL);

      // Poll for authorization (step 2), then exchange for tokens (step 3)
      const pollInterval = (dc.interval || 5) * 1000;
      const deadline = Date.now() + dc.expires_in * 1000;

      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, pollInterval));
        const authResult = await pollForAuthorization(dc.device_auth_id, dc.user_code);
        if (!authResult) continue; // still pending

        // Step 3: exchange authorization_code for tokens
        const tokens = await exchangeForTokens(
          authResult.authorization_code,
          authResult.code_verifier,
        );
        await saveTokens(tokens);
        await updateUserProfile({ chatgptConnected: true });
        setChatgptConnected(true);
        setChatgptDeviceCode(null);
        setChatgptConnecting(false);
        refreshProfile();
        Alert.alert('Connected', 'ChatGPT is now linked to Guru.');
        return;
      }
      throw new Error('Device code expired. Please try again.');
    } catch (err: any) {
      Alert.alert('Connection failed', err.message ?? 'Unknown error');
      setChatgptDeviceCode(null);
      setChatgptConnecting(false);
    }
  }

  async function disconnectChatGpt() {
    Alert.alert('Disconnect ChatGPT?', 'This will remove stored tokens.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          await clearTokens();
          await updateUserProfile({ chatgptConnected: false });
          setChatgptConnected(false);
          refreshProfile();
        },
      },
    ]);
  }

  async function testGeminiKey() {
    const key = geminiKey.trim() || profile?.geminiKey || '';
    if (!key) {
      Alert.alert('No key', 'Enter a Google AI (Gemini) API key first.');
      return;
    }
    setTestingGeminiKey(true);
    setGeminiKeyTestResult(null);
    const res = await testGeminiConnection(key);
    setGeminiKeyTestResult(res.ok ? 'ok' : 'fail');
    if (res.ok) markProviderValidated('gemini', key);
    else clearProviderValidated('gemini');
    setTestingGeminiKey(false);
  }

  async function testCloudflareKeys() {
    const aid = cfAccountId.trim() || profile?.cloudflareAccountId || '';
    const tok = cfApiToken.trim() || profile?.cloudflareApiToken || '';
    if (!aid || !tok) {
      Alert.alert(
        'Missing credentials',
        'Enter your Cloudflare Account ID and API token (Workers AI permissions).',
      );
      return;
    }
    setTestingCloudflare(true);
    setCloudflareTestResult(null);
    const res = await testCloudflareConnection(aid, tok);
    setCloudflareTestResult(res.ok ? 'ok' : 'fail');
    if (res.ok) markProviderValidated('cloudflare', `${aid}:${tok}`);
    else clearProviderValidated('cloudflare');
    setTestingCloudflare(false);
  }

  async function testFalKey() {
    const key = falApiKey.trim() || profile?.falApiKey || '';
    if (!key) {
      Alert.alert('No key', 'Enter a fal API key first.');
      return;
    }
    setTestingFalKey(true);
    setFalKeyTestResult(null);
    const res = await testFalConnection(key);
    setFalKeyTestResult(res.ok ? 'ok' : 'fail');
    if (res.ok) markProviderValidated('fal', key);
    else clearProviderValidated('fal');
    setTestingFalKey(false);
  }

  async function testBraveSearchKey() {
    const key = braveSearchApiKey.trim() || profile?.braveSearchApiKey || '';
    if (!key) {
      Alert.alert('No key', 'Enter a Brave Search API key first.');
      return;
    }
    setTestingBraveSearchKey(true);
    setBraveSearchKeyTestResult(null);
    const res = await testBraveSearchConnection(key);
    setBraveSearchKeyTestResult(res.ok ? 'ok' : 'fail');
    if (res.ok) markProviderValidated('brave', key);
    else clearProviderValidated('brave');
    setTestingBraveSearchKey(false);
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
    let localFiles = 'undetermined';
    if (Platform.OS === 'android') {
      const hasOverlay = await canDrawOverlays();
      o = hasOverlay ? 'granted' : 'denied';
      const hasLocalFileAccess = await PermissionsAndroid.check(LOCAL_FILE_ACCESS_PERMISSION);
      localFiles = hasLocalFileAccess ? 'granted' : 'denied';
    }

    setPermStatus({
      notifs: n.status,
      mic: m.status,
      overlay: o,
      localFiles,
    });
  }

  // ── Profile → local state hydration ────────────────────────────────────────
  const profileLoaded = useRef(false);

  const buildProfileHydrationSignature = useCallback(
    (currentProfile: typeof profile): string | null => {
      if (!currentProfile) return null;
      return JSON.stringify({
        groqApiKey: currentProfile.groqApiKey ?? '',
        githubModelsPat: currentProfile.githubModelsPat ?? '',
        kiloApiKey: currentProfile.kiloApiKey ?? '',
        deepseekKey: currentProfile.deepseekKey ?? '',
        agentRouterKey: currentProfile.agentRouterKey ?? '',
        providerOrder: sanitizeProviderOrder(currentProfile.providerOrder),
        openrouterKey: currentProfile.openrouterKey ?? '',
        geminiKey: currentProfile.geminiKey ?? '',
        deepgramApiKey: (currentProfile as any).deepgramApiKey ?? '',
        cloudflareAccountId: currentProfile.cloudflareAccountId ?? '',
        cloudflareApiToken: currentProfile.cloudflareApiToken ?? '',
        falApiKey: currentProfile.falApiKey ?? '',
        braveSearchApiKey: currentProfile.braveSearchApiKey ?? '',
        apiValidation: sanitizeApiValidationState(currentProfile.apiValidation),
        guruChatDefaultModel: currentProfile.guruChatDefaultModel ?? 'auto',
        imageGenerationModel: currentProfile.imageGenerationModel ?? DEFAULT_IMAGE_GENERATION_MODEL,
        guruMemoryNotes: currentProfile.guruMemoryNotes ?? '',
        preferGeminiStructuredJson: currentProfile.preferGeminiStructuredJson !== false,
        huggingFaceToken: currentProfile.huggingFaceToken ?? '',
        huggingFaceTranscriptionModel:
          currentProfile.huggingFaceTranscriptionModel ?? DEFAULT_HF_TRANSCRIPTION_MODEL,
        transcriptionProvider: currentProfile.transcriptionProvider ?? 'auto',
        displayName: currentProfile.displayName,
        inicetDate: currentProfile.inicetDate,
        neetDate: currentProfile.neetDate,
        preferredSessionLength: currentProfile.preferredSessionLength,
        dailyGoalMinutes: currentProfile.dailyGoalMinutes,
        notificationsEnabled: currentProfile.notificationsEnabled,
        strictModeEnabled: currentProfile.strictModeEnabled,
        bodyDoublingEnabled: currentProfile.bodyDoublingEnabled ?? true,
        blockedContentTypes: currentProfile.blockedContentTypes ?? [],
        idleTimeoutMinutes: currentProfile.idleTimeoutMinutes ?? 2,
        breakDurationMinutes: currentProfile.breakDurationMinutes ?? 5,
        pomodoroEnabled: currentProfile.pomodoroEnabled ?? true,
        pomodoroIntervalMinutes: currentProfile.pomodoroIntervalMinutes ?? 20,
        notificationHour: currentProfile.notificationHour ?? 7,
        guruFrequency: currentProfile.guruFrequency ?? 'normal',
        focusSubjectIds: currentProfile.focusSubjectIds ?? [],
      });
    },
    [],
  );

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
      const nextSignature = buildProfileHydrationSignature(profile);
      if (nextSignature && profileHydrationSignatureRef.current === nextSignature) {
        if (!profileLoaded.current) profileLoaded.current = true;
        return;
      }

      setGroqKey(profile.groqApiKey ?? '');
      setGithubModelsPat(profile.githubModelsPat ?? '');
      setKiloApiKey(profile.kiloApiKey ?? '');
      setDeepseekKey(profile.deepseekKey ?? '');
      setAgentRouterKey(profile.agentRouterKey ?? '');
      setProviderOrder(sanitizeProviderOrder(profile.providerOrder));
      setOrKey(profile.openrouterKey ?? '');
      setGeminiKey(profile.geminiKey ?? '');
      setCfAccountId(profile.cloudflareAccountId ?? '');
      setCfApiToken(profile.cloudflareApiToken ?? '');
      setFalApiKey(profile.falApiKey ?? '');
      setBraveSearchApiKey(profile.braveSearchApiKey ?? '');
      setApiValidation(sanitizeApiValidationState((profile as UserProfile).apiValidation));
      setGuruChatDefaultModel(profile.guruChatDefaultModel ?? 'auto');
      setImageGenerationModel(profile.imageGenerationModel ?? DEFAULT_IMAGE_GENERATION_MODEL);
      setGuruMemoryNotes(profile.guruMemoryNotes ?? '');
      setPreferGeminiStructuredJson(profile.preferGeminiStructuredJson !== false);
      setHuggingFaceToken(profile.huggingFaceToken ?? '');
      setHuggingFaceModel(profile.huggingFaceTranscriptionModel ?? DEFAULT_HF_TRANSCRIPTION_MODEL);
      setDeepgramApiKey((profile as any).deepgramApiKey ?? '');
      setChatgptConnected(!!profile.chatgptConnected);
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
      profileHydrationSignatureRef.current = nextSignature;
      profileLoaded.current = true;
    }
  }, [buildProfileHydrationSignature, profile]);

  // ── Debounced auto-save ──────────────────────────────────────────────────────
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doAutoSave = useCallback(async () => {
    if (!profileLoaded.current) return;
    setSaving(true);
    try {
      await updateUserProfile({
        groqApiKey: groqKey.trim(),
        githubModelsPat: githubModelsPat.trim(),
        kiloApiKey: kiloApiKey.trim(),
        deepseekKey: deepseekKey.trim(),
        agentRouterKey: agentRouterKey.trim(),
        providerOrder: sanitizeProviderOrder(providerOrder),
        openrouterKey: orKey.trim(),
        geminiKey: geminiKey.trim(),
        cloudflareAccountId: cfAccountId.trim(),
        cloudflareApiToken: cfApiToken.trim(),
        falApiKey: falApiKey.trim(),
        braveSearchApiKey: braveSearchApiKey.trim(),
        apiValidation: sanitizeApiValidationState(apiValidation),
        guruChatDefaultModel: guruChatDefaultModel.trim() || 'auto',
        imageGenerationModel: normalizeImageGenerationModel(imageGenerationModel),
        guruMemoryNotes: guruMemoryNotes.trim(),
        preferGeminiStructuredJson,
        huggingFaceToken: huggingFaceToken.trim(),
        huggingFaceTranscriptionModel: huggingFaceModel.trim() || DEFAULT_HF_TRANSCRIPTION_MODEL,
        deepgramApiKey: deepgramApiKey.trim(),
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
        try {
          await requestNotificationPermissions();
          await refreshAccountabilityNotifications();
        } catch {
          /* non-critical */
        }
      }
    } catch (err) {
      // updateUserProfile already shows a toast on error
      if (__DEV__) console.warn('[Settings] Auto-save failed:', err);
    } finally {
      setSaving(false);
    }
  }, [
    groqKey,
    githubModelsPat,
    kiloApiKey,
    deepseekKey,
    agentRouterKey,
    providerOrder,
    orKey,
    geminiKey,
    cfAccountId,
    cfApiToken,
    falApiKey,
    braveSearchApiKey,
    guruChatDefaultModel,
    imageGenerationModel,
    guruMemoryNotes,
    preferGeminiStructuredJson,
    huggingFaceToken,
    huggingFaceModel,
    deepgramApiKey,
    apiValidation,
    transcriptionProvider,
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
    pomodoroEnabled,
    pomodoroInterval,
    notifHour,
    guruFrequency,
    focusSubjectIds,
  ]);

  // Fire auto-save 600ms after any setting changes (skip initial profile load)
  useEffect(() => {
    if (!profileLoaded.current) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(doAutoSave, 600);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [doAutoSave]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      refreshProfile().catch((err) => {
        if (__DEV__) console.warn('[Settings] refresh on blur failed:', err);
      });
    });
    return unsubscribe;
  }, [navigation, refreshProfile]);

  const moveProvider = useCallback((fromIndex: number, toIndex: number) => {
    setProviderOrder((currentOrder) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= currentOrder.length ||
        toIndex >= currentOrder.length ||
        fromIndex === toIndex
      ) {
        return currentOrder;
      }

      const next = [...currentOrder];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

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

  const groqValidationStatus = resolveValidationStatus(
    'groq',
    groqKeyTestResult,
    groqKey.trim() || profile?.groqApiKey || '',
  );
  const githubValidationStatus = resolveValidationStatus(
    'github',
    githubPatTestResult,
    githubModelsPat.trim() || profile?.githubModelsPat || '',
  );
  const openRouterValidationStatus = resolveValidationStatus(
    'openrouter',
    openRouterKeyTestResult,
    orKey.trim() || profile?.openrouterKey || '',
  );
  const kiloValidationStatus = resolveValidationStatus(
    'kilo',
    kiloKeyTestResult,
    kiloApiKey.trim() || profile?.kiloApiKey || '',
  );
  const deepseekValidationStatus = resolveValidationStatus(
    'deepseek',
    deepseekKeyTestResult,
    deepseekKey.trim() || profile?.deepseekKey || '',
  );
  const agentRouterValidationStatus = resolveValidationStatus(
    'agentrouter',
    agentRouterKeyTestResult,
    agentRouterKey.trim() || profile?.agentRouterKey || '',
  );
  const geminiValidationStatus = resolveValidationStatus(
    'gemini',
    geminiKeyTestResult,
    geminiKey.trim() || profile?.geminiKey || '',
  );
  const deepgramValidationStatus = resolveValidationStatus(
    'deepgram',
    deepgramKeyTestResult,
    deepgramApiKey.trim() || (profile as any)?.deepgramApiKey || '',
  );
  const hasPomodoroOverlayPermission = permStatus.overlay === 'granted';
  const hasPomodoroGroqKey = !!(groqKey.trim() || profile?.groqApiKey || '');
  const hasPomodoroDeepgramKey = !!(
    deepgramApiKey.trim() ||
    (profile as any)?.deepgramApiKey ||
    ''
  );
  const pomodoroLectureQuizReady =
    hasPomodoroOverlayPermission && hasPomodoroGroqKey && hasPomodoroDeepgramKey;
  const cloudflareValidationStatus = resolveValidationStatus(
    'cloudflare',
    cloudflareTestResult,
    `${cfAccountId.trim() || profile?.cloudflareAccountId || ''}:${cfApiToken.trim() || profile?.cloudflareApiToken || ''}`,
  );
  const falValidationStatus = resolveValidationStatus(
    'fal',
    falKeyTestResult,
    falApiKey.trim() || profile?.falApiKey || '',
  );
  const braveValidationStatus = resolveValidationStatus(
    'brave',
    braveSearchKeyTestResult,
    braveSearchApiKey.trim() || profile?.braveSearchApiKey || '',
  );
  const localLlmPath = profile?.localModelPath ?? '';
  const localLlmReady = Boolean(localLlmPath);
  const localWhisperPath = profile?.localWhisperPath ?? '';
  const localWhisperReady = Boolean(localWhisperPath);
  const localAiEnabled = Boolean(profile?.useLocalModel || profile?.useLocalWhisper);
  const localLlmAllowed = isLocalLlmAllowedOnThisDevice();
  const localLlmWarning = getLocalLlmRamWarning();
  const localLlmFileName = localLlmPath
    ? decodeURIComponent(localLlmPath.split('/').pop() || localLlmPath)
    : '';
  const imageGenerationOptions = [
    ...(Array.isArray(FAL_IMAGE_GENERATION_MODEL_OPTIONS)
      ? FAL_IMAGE_GENERATION_MODEL_OPTIONS
      : []),
    ...(Array.isArray(IMAGE_GENERATION_MODEL_OPTIONS) ? IMAGE_GENERATION_MODEL_OPTIONS : []),
  ];
  const localWhisperFileName = localWhisperPath
    ? decodeURIComponent(localWhisperPath.split('/').pop() || localWhisperPath)
    : '';

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
          overScrollMode="never"
        >
          <ScreenHeader
            title="Settings"
            subtitle="Control sync, backups, AI, and study behavior."
            onBackPress={() => navigation.navigate('MenuHome')}
          />

          <Text style={styles.categoryLabel}>AI & PROVIDERS</Text>
          <SectionToggle
            id="ai_config"
            title="AI Configuration"
            icon="hardware-chip-outline"
            tint="#6C63FF"
          >
            {/* ── Chat Model ─────────────────────────────── */}
            <SubSectionToggle id="ai_chat_model" title="CHAT MODEL">
              <Text style={styles.hint}>Default model for Guru Chat (changeable per session).</Text>
              <View style={styles.liveModelsRefreshRow}>
                <TouchableOpacity
                  style={[styles.testBtn, { marginBottom: 0, flexShrink: 1 }]}
                  onPress={liveGuruChatModels.refresh}
                  disabled={liveGuruChatModels.loading}
                  activeOpacity={0.8}
                >
                  <Text style={styles.testBtnText}>
                    {liveGuruChatModels.loading
                      ? 'Loading live models…'
                      : 'Refresh live model lists'}
                  </Text>
                </TouchableOpacity>
                {liveGuruChatModels.loading && (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                )}
              </View>
              <ModelDropdown
                label="Guru Chat — default model"
                value={guruChatDefaultModel}
                onSelect={setGuruChatDefaultModel}
                options={[
                  { id: 'auto', label: formatGuruChatModelChipLabel('auto'), group: 'General' },
                  ...(profile?.useLocalModel &&
                  profile?.localModelPath &&
                  isLocalLlmAllowedOnThisDevice()
                    ? [
                        {
                          id: 'local',
                          label: formatGuruChatModelChipLabel('local'),
                          group: 'General',
                        },
                      ]
                    : []),
                  ...liveGuruChatModels.chatgpt.map((m) => ({
                    id: `chatgpt/${m}`,
                    label: formatGuruChatModelChipLabel(`chatgpt/${m}`),
                    group: 'ChatGPT Codex',
                  })),
                  ...liveGuruChatModels.groq.map((m) => ({
                    id: `groq/${m}`,
                    label: formatGuruChatModelChipLabel(`groq/${m}`),
                    group: 'Groq',
                  })),
                  ...liveGuruChatModels.github.map((m) => ({
                    id: `github/${m}`,
                    label: formatGuruChatModelChipLabel(`github/${m}`),
                    group: 'GitHub Models',
                  })),
                  ...liveGuruChatModels.kilo.map((m) => ({
                    id: `kilo/${m}`,
                    label: formatGuruChatModelChipLabel(`kilo/${m}`),
                    group: 'Kilo',
                  })),
                  ...liveGuruChatModels.deepseek.map((m: string) => ({
                    id: `deepseek/${m}`,
                    label: formatGuruChatModelChipLabel(`deepseek/${m}`),
                    group: 'DeepSeek',
                  })),
                  ...liveGuruChatModels.agentrouter.map((m: string) => ({
                    id: `ar/${m}`,
                    label: formatGuruChatModelChipLabel(`ar/${m}`),
                    group: 'AgentRouter',
                  })),
                  ...liveGuruChatModels.openrouter.map((m) => ({
                    id: m,
                    label: formatGuruChatModelChipLabel(m),
                    group: 'OpenRouter (free)',
                  })),
                  ...liveGuruChatModels.gemini.map((m) => ({
                    id: `gemini/${m}`,
                    label: formatGuruChatModelChipLabel(`gemini/${m}`),
                    group: 'Gemini',
                  })),
                  ...liveGuruChatModels.cloudflare.map((m) => ({
                    id: `cf/${m}`,
                    label: formatGuruChatModelChipLabel(`cf/${m}`),
                    group: 'Cloudflare',
                  })),
                ]}
              />
            </SubSectionToggle>

            {/* ── Memory ─────────────────────────────── */}
            <View style={styles.subSectionDivider} />
            <SubSectionToggle id="ai_memory" title="GURU MEMORY">
              <Text style={styles.hint}>
                Persistent notes Guru uses in every chat. Session memory is built automatically.
              </Text>
              <TextInput
                style={[styles.input, styles.guruMemoryInput]}
                placeholder="e.g. INICET May 2026 · weak in renal · prefers concise answers"
                placeholderTextColor={theme.colors.textMuted}
                value={guruMemoryNotes}
                onChangeText={setGuruMemoryNotes}
                multiline
                textAlignVertical="top"
                autoCapitalize="sentences"
              />
            </SubSectionToggle>

            {/* ── ChatGPT OAuth ─────────────────────────────── */}
            <View style={styles.subSectionDivider} />
            <SubSectionToggle id="chatgpt_oauth" title="CHATGPT (SUBSCRIPTION)">
              <Text style={styles.hint}>
                Connect your ChatGPT Plus/Pro subscription through the Codex flow. Guru follows the
                Codex models page and currently starts with GPT-5.4, then GPT-5.4-mini, before older
                Codex alternatives.
              </Text>
              {chatgptConnected ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 }}>
                  <Ionicons name="checkmark-circle" size={22} color={theme.colors.success} />
                  <Text style={[styles.label, { color: theme.colors.success, flex: 1 }]}>
                    Connected
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.validateBtn,
                      { backgroundColor: theme.colors.error + '22', paddingHorizontal: 16 },
                    ]}
                    onPress={disconnectChatGpt}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: theme.colors.error, fontWeight: '600', fontSize: 13 }}>
                      Disconnect
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : chatgptConnecting && chatgptDeviceCode ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={[styles.label, { textAlign: 'center', marginBottom: 4 }]}>
                    Enter this code at openai.com:
                  </Text>
                  <Text
                    style={{
                      fontSize: 28,
                      fontWeight: '700',
                      textAlign: 'center',
                      color: theme.colors.primary,
                      letterSpacing: 4,
                      marginVertical: 8,
                      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                    }}
                    selectable
                  >
                    {chatgptDeviceCode.user_code}
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: 8,
                      marginTop: 4,
                    }}
                  >
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                    <Text style={[styles.hint, { marginTop: 0 }]}>
                      Waiting for authorization...
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={{ marginTop: 12, alignSelf: 'center' }}
                    onPress={() => Linking.openURL(VERIFICATION_URL)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={{
                        color: theme.colors.primary,
                        textDecorationLine: 'underline',
                        fontSize: 13,
                      }}
                    >
                      Open login page again
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.validateBtn,
                    {
                      marginTop: 8,
                      paddingHorizontal: 24,
                      paddingVertical: 10,
                      alignSelf: 'flex-start',
                      backgroundColor: theme.colors.primary + '22',
                    },
                  ]}
                  onPress={connectChatGpt}
                  disabled={chatgptConnecting}
                  activeOpacity={0.8}
                >
                  {chatgptConnecting ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <Text style={{ color: theme.colors.primary, fontWeight: '600', fontSize: 14 }}>
                      Connect ChatGPT
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </SubSectionToggle>

            {/* ── API Keys ─────────────────────────────── */}
            <View style={styles.subSectionDivider} />
            <SubSectionToggle id="ai_api_keys" title="API KEYS">
              <Label text="Groq" />
              <View style={styles.apiKeyRow}>
                <TextInput
                  style={[styles.input, styles.apiKeyInput]}
                  placeholder="gsk_..."
                  placeholderTextColor={theme.colors.textMuted}
                  value={groqKey}
                  onChangeText={(value) => {
                    setGroqKey(value);
                    setGroqKeyTestResult(null);
                    clearProviderValidated('groq');
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  importantForAutofill="no"
                  textContentType="none"
                />
                <TouchableOpacity
                  style={[
                    styles.validateBtn,
                    groqValidationStatus === 'ok' && styles.validateBtnOk,
                    groqValidationStatus === 'fail' && styles.validateBtnFail,
                  ]}
                  onPress={testGroqKey}
                  disabled={testingGroqKey}
                  activeOpacity={0.8}
                >
                  {testingGroqKey ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <Ionicons
                      name={
                        groqValidationStatus === 'ok'
                          ? 'checkmark-circle'
                          : groqValidationStatus === 'fail'
                            ? 'close-circle'
                            : 'flash-outline'
                      }
                      size={20}
                      color={
                        groqValidationStatus === 'ok'
                          ? theme.colors.success
                          : groqValidationStatus === 'fail'
                            ? theme.colors.error
                            : theme.colors.primary
                      }
                    />
                  )}
                </TouchableOpacity>
              </View>
              <Text style={styles.hint}>
                Transcription + AI generation. Free key at console.groq.com
              </Text>
              <Label text="GitHub Models" />
              <View style={styles.apiKeyRow}>
                <TextInput
                  style={[styles.input, styles.apiKeyInput]}
                  placeholder="GitHub PAT (Models read)"
                  placeholderTextColor={theme.colors.textMuted}
                  value={githubModelsPat}
                  onChangeText={(value) => {
                    setGithubModelsPat(value);
                    setGithubPatTestResult(null);
                    clearProviderValidated('github');
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  importantForAutofill="no"
                  textContentType="none"
                />
                <TouchableOpacity
                  style={[
                    styles.validateBtn,
                    githubValidationStatus === 'ok' && styles.validateBtnOk,
                    githubValidationStatus === 'fail' && styles.validateBtnFail,
                  ]}
                  onPress={testGithubModelsPat}
                  disabled={testingGithubPat}
                  activeOpacity={0.8}
                >
                  {testingGithubPat ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <Ionicons
                      name={
                        githubValidationStatus === 'ok'
                          ? 'checkmark-circle'
                          : githubValidationStatus === 'fail'
                            ? 'close-circle'
                            : 'flash-outline'
                      }
                      size={20}
                      color={
                        githubValidationStatus === 'ok'
                          ? theme.colors.success
                          : githubValidationStatus === 'fail'
                            ? theme.colors.error
                            : theme.colors.primary
                      }
                    />
                  )}
                </TouchableOpacity>
              </View>
              <Text style={styles.hint}>
                Fine-grained PAT with Models (read) scope at models.github.ai
              </Text>
              <Label text="OpenRouter" />
              <View style={styles.apiKeyRow}>
                <TextInput
                  style={[styles.input, styles.apiKeyInput]}
                  placeholder="sk-or-v1-..."
                  placeholderTextColor={theme.colors.textMuted}
                  value={orKey}
                  onChangeText={(value) => {
                    setOrKey(value);
                    setOpenRouterKeyTestResult(null);
                    clearProviderValidated('openrouter');
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  importantForAutofill="no"
                  textContentType="none"
                />
                <TouchableOpacity
                  style={[
                    styles.validateBtn,
                    openRouterValidationStatus === 'ok' && styles.validateBtnOk,
                    openRouterValidationStatus === 'fail' && styles.validateBtnFail,
                  ]}
                  onPress={testOpenRouterKey}
                  disabled={testingOpenRouterKey}
                  activeOpacity={0.8}
                >
                  {testingOpenRouterKey ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <Ionicons
                      name={
                        openRouterValidationStatus === 'ok'
                          ? 'checkmark-circle'
                          : openRouterValidationStatus === 'fail'
                            ? 'close-circle'
                            : 'flash-outline'
                      }
                      size={20}
                      color={
                        openRouterValidationStatus === 'ok'
                          ? theme.colors.success
                          : openRouterValidationStatus === 'fail'
                            ? theme.colors.error
                            : theme.colors.primary
                      }
                    />
                  )}
                </TouchableOpacity>
              </View>
              <Text style={styles.hint}>Free model fallback. Key at openrouter.ai</Text>
              <Label text="Kilo" />
              <View style={styles.apiKeyRow}>
                <TextInput
                  style={[styles.input, styles.apiKeyInput]}
                  placeholder="kilo_..."
                  placeholderTextColor={theme.colors.textMuted}
                  value={kiloApiKey}
                  onChangeText={(value) => {
                    setKiloApiKey(value);
                    setKiloKeyTestResult(null);
                    clearProviderValidated('kilo');
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  importantForAutofill="no"
                  textContentType="none"
                />
                <TouchableOpacity
                  style={[
                    styles.validateBtn,
                    kiloValidationStatus === 'ok' && styles.validateBtnOk,
                    kiloValidationStatus === 'fail' && styles.validateBtnFail,
                  ]}
                  onPress={testKiloKey}
                  disabled={testingKiloKey}
                  activeOpacity={0.8}
                >
                  {testingKiloKey ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <Ionicons
                      name={
                        kiloValidationStatus === 'ok'
                          ? 'checkmark-circle'
                          : kiloValidationStatus === 'fail'
                            ? 'close-circle'
                            : 'flash-outline'
                      }
                      size={20}
                      color={
                        kiloValidationStatus === 'ok'
                          ? theme.colors.success
                          : kiloValidationStatus === 'fail'
                            ? theme.colors.error
                            : theme.colors.primary
                      }
                    />
                  )}
                </TouchableOpacity>
              </View>
              <Text style={styles.hint}>
                Gateway at api.kilo.ai (e.g. anthropic/claude-sonnet-4.5)
              </Text>
              <Label text="DeepSeek" />
              <View style={styles.apiKeyRow}>
                <TextInput
                  style={[styles.input, styles.apiKeyInput]}
                  placeholder="sk-..."
                  placeholderTextColor={theme.colors.textMuted}
                  value={deepseekKey}
                  onChangeText={(value) => {
                    setDeepseekKey(value);
                    setDeepseekKeyTestResult(null);
                    clearProviderValidated('deepseek');
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  importantForAutofill="no"
                  textContentType="none"
                />
                <TouchableOpacity
                  style={[
                    styles.validateBtn,
                    deepseekValidationStatus === 'ok' && styles.validateBtnOk,
                    deepseekValidationStatus === 'fail' && styles.validateBtnFail,
                  ]}
                  onPress={testDeepseekKey}
                  disabled={testingDeepseekKey}
                  activeOpacity={0.8}
                >
                  {testingDeepseekKey ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <Ionicons
                      name={
                        deepseekValidationStatus === 'ok'
                          ? 'checkmark-circle'
                          : deepseekValidationStatus === 'fail'
                            ? 'close-circle'
                            : 'flash-outline'
                      }
                      size={20}
                      color={
                        deepseekValidationStatus === 'ok'
                          ? theme.colors.success
                          : deepseekValidationStatus === 'fail'
                            ? theme.colors.error
                            : theme.colors.primary
                      }
                    />
                  )}
                </TouchableOpacity>
              </View>
              <Text style={styles.hint}>Key at platform.deepseek.com</Text>
              <Label text="AgentRouter" />
              <View style={styles.apiKeyRow}>
                <TextInput
                  style={[styles.input, styles.apiKeyInput]}
                  placeholder="sk-..."
                  placeholderTextColor={theme.colors.textMuted}
                  value={agentRouterKey}
                  onChangeText={(value) => {
                    setAgentRouterKey(value);
                    setAgentRouterKeyTestResult(null);
                    clearProviderValidated('agentrouter');
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  importantForAutofill="no"
                  textContentType="none"
                />
                <TouchableOpacity
                  style={[
                    styles.validateBtn,
                    agentRouterValidationStatus === 'ok' && styles.validateBtnOk,
                    agentRouterValidationStatus === 'fail' && styles.validateBtnFail,
                  ]}
                  onPress={testAgentRouterKey}
                  disabled={testingAgentRouterKey}
                  activeOpacity={0.8}
                >
                  {testingAgentRouterKey ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <Ionicons
                      name={
                        agentRouterValidationStatus === 'ok'
                          ? 'checkmark-circle'
                          : agentRouterValidationStatus === 'fail'
                            ? 'close-circle'
                            : 'flash-outline'
                      }
                      size={20}
                      color={
                        agentRouterValidationStatus === 'ok'
                          ? theme.colors.success
                          : agentRouterValidationStatus === 'fail'
                            ? theme.colors.error
                            : theme.colors.primary
                      }
                    />
                  )}
                </TouchableOpacity>
              </View>
              <Text style={styles.hint}>Free proxy. Key at agentrouter.org/console/token</Text>
              <Label text="Google Gemini" />
              <View style={styles.apiKeyRow}>
                <TextInput
                  style={[styles.input, styles.apiKeyInput]}
                  placeholder="AIza..."
                  placeholderTextColor={theme.colors.textMuted}
                  value={geminiKey}
                  onChangeText={(value) => {
                    setGeminiKey(value);
                    setGeminiKeyTestResult(null);
                    clearProviderValidated('gemini');
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  importantForAutofill="no"
                  textContentType="none"
                />
                <TouchableOpacity
                  style={[
                    styles.validateBtn,
                    geminiValidationStatus === 'ok' && styles.validateBtnOk,
                    geminiValidationStatus === 'fail' && styles.validateBtnFail,
                  ]}
                  onPress={testGeminiKey}
                  disabled={testingGeminiKey}
                  activeOpacity={0.8}
                >
                  {testingGeminiKey ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <Ionicons
                      name={
                        geminiValidationStatus === 'ok'
                          ? 'checkmark-circle'
                          : geminiValidationStatus === 'fail'
                            ? 'close-circle'
                            : 'flash-outline'
                      }
                      size={20}
                      color={
                        geminiValidationStatus === 'ok'
                          ? theme.colors.success
                          : geminiValidationStatus === 'fail'
                            ? theme.colors.error
                            : theme.colors.primary
                      }
                    />
                  )}
                </TouchableOpacity>
              </View>
              <Text style={styles.hint}>
                Chat + image models. Key at aistudio.google.com/apikey
              </Text>
              <View style={styles.switchRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.switchLabel}>Structured JSON (Gemini)</Text>
                  <Text style={styles.hint}>
                    When on, structured AI outputs (quizzes, daily plan, lecture analysis) use
                    Gemini native JSON + schema first if your Gemini key is set. Turn off to force
                    text-only parsing (for debugging).
                  </Text>
                </View>
                <Switch
                  value={preferGeminiStructuredJson}
                  onValueChange={setPreferGeminiStructuredJson}
                  trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                  thumbColor={theme.colors.textPrimary}
                />
              </View>
              <Label text="Deepgram" />
              <View style={styles.apiKeyRow}>
                <TextInput
                  style={[styles.input, styles.apiKeyInput]}
                  placeholder="dg_..."
                  placeholderTextColor={theme.colors.textMuted}
                  value={deepgramApiKey}
                  onChangeText={(value) => {
                    setDeepgramApiKey(value);
                    setDeepgramKeyTestResult(null);
                    clearProviderValidated('deepgram');
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  importantForAutofill="no"
                  textContentType="none"
                />
                <TouchableOpacity
                  style={[
                    styles.validateBtn,
                    deepgramValidationStatus === 'ok' && styles.validateBtnOk,
                    deepgramValidationStatus === 'fail' && styles.validateBtnFail,
                  ]}
                  onPress={testDeepgramKey}
                  disabled={testingDeepgramKey}
                  activeOpacity={0.8}
                >
                  {testingDeepgramKey ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <Ionicons
                      name={
                        deepgramValidationStatus === 'ok'
                          ? 'checkmark-circle'
                          : deepgramValidationStatus === 'fail'
                            ? 'close-circle'
                            : 'flash-outline'
                      }
                      size={20}
                      color={
                        deepgramValidationStatus === 'ok'
                          ? theme.colors.success
                          : deepgramValidationStatus === 'fail'
                            ? theme.colors.error
                            : theme.colors.primary
                      }
                    />
                  )}
                </TouchableOpacity>
              </View>
              <Text style={styles.hint}>
                Live lecture quiz sidecar. Key at console.deepgram.com
              </Text>
              <Label text="Cloudflare Workers AI" />
              <View style={styles.apiKeyRow}>
                <TextInput
                  style={[styles.input, styles.apiKeyInput]}
                  placeholder="Account ID (32-char hex)"
                  placeholderTextColor={theme.colors.textMuted}
                  value={cfAccountId}
                  onChangeText={(value) => {
                    setCfAccountId(value);
                    setCloudflareTestResult(null);
                    clearProviderValidated('cloudflare');
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  textContentType="none"
                />
                <TouchableOpacity
                  style={[
                    styles.validateBtn,
                    cloudflareValidationStatus === 'ok' && styles.validateBtnOk,
                    cloudflareValidationStatus === 'fail' && styles.validateBtnFail,
                  ]}
                  onPress={testCloudflareKeys}
                  disabled={testingCloudflare}
                  activeOpacity={0.8}
                >
                  {testingCloudflare ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <Ionicons
                      name={
                        cloudflareValidationStatus === 'ok'
                          ? 'checkmark-circle'
                          : cloudflareValidationStatus === 'fail'
                            ? 'close-circle'
                            : 'flash-outline'
                      }
                      size={20}
                      color={
                        cloudflareValidationStatus === 'ok'
                          ? theme.colors.success
                          : cloudflareValidationStatus === 'fail'
                            ? theme.colors.error
                            : theme.colors.primary
                      }
                    />
                  )}
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.input}
                placeholder="API Token (Workers AI read)"
                placeholderTextColor={theme.colors.textMuted}
                value={cfApiToken}
                onChangeText={(value) => {
                  setCfApiToken(value);
                  setCloudflareTestResult(null);
                  clearProviderValidated('cloudflare');
                }}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                importantForAutofill="no"
                textContentType="none"
              />
              <Text style={styles.hint}>
                Chat, images, and Whisper transcription via Cloudflare
              </Text>
            </SubSectionToggle>

            {/* ── Routing ─────────────────────────────── */}
            <View style={styles.subSectionDivider} />
            <SubSectionToggle id="ai_routing" title="PROVIDER ROUTING">
              <Text style={styles.hint}>
                Reorder fallback priority. First available provider is used.
              </Text>
              {providerOrder.map((id, index) => {
                const hasKey = (() => {
                  switch (id) {
                    case 'chatgpt':
                      return chatgptConnected || !!profile?.chatgptConnected;
                    case 'groq':
                      return !!(groqKey.trim() || profile?.groqApiKey);
                    case 'github':
                      return !!(githubModelsPat.trim() || profile?.githubModelsPat);
                    case 'kilo':
                      return !!(kiloApiKey.trim() || profile?.kiloApiKey);
                    case 'deepseek':
                      return !!(deepseekKey.trim() || profile?.deepseekKey);
                    case 'agentrouter':
                      return !!(agentRouterKey.trim() || profile?.agentRouterKey);
                    case 'gemini':
                      return !!(geminiKey.trim() || profile?.geminiKey);
                    case 'gemini_fallback':
                      return true; // bundled key
                    case 'openrouter':
                      return !!(orKey.trim() || profile?.openrouterKey);
                    case 'cloudflare':
                      return !!(
                        (cfAccountId.trim() || profile?.cloudflareAccountId) &&
                        (cfApiToken.trim() || profile?.cloudflareApiToken)
                      );
                    default:
                      return false;
                  }
                })();
                return (
                  <View key={id} style={[styles.providerRow, !hasKey && { opacity: 0.45 }]}>
                    <Text style={styles.providerIndex}>{index + 1}</Text>
                    <View
                      style={[
                        styles.providerDot,
                        { backgroundColor: hasKey ? theme.colors.success : theme.colors.textMuted },
                      ]}
                    />
                    <Text
                      style={[styles.providerName, { color: theme.colors.textPrimary }]}
                      numberOfLines={2}
                    >
                      {PROVIDER_DISPLAY_NAMES[id]}
                    </Text>
                    <View style={styles.providerActions}>
                      <Pressable
                        disabled={index === 0}
                        onPress={() => moveProvider(index, 0)}
                        style={({ pressed }) => [
                          styles.providerActionBtn,
                          index === 0 && styles.providerActionBtnDisabled,
                          pressed && index !== 0 && styles.providerActionBtnPressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Move ${PROVIDER_DISPLAY_NAMES[id]} to top`}
                      >
                        <Ionicons
                          name="play-skip-back"
                          size={16}
                          color={theme.colors.textPrimary}
                        />
                      </Pressable>
                      <TouchableOpacity
                        disabled={index === 0}
                        onPress={() => moveProvider(index, index - 1)}
                        style={[
                          styles.providerActionBtn,
                          index === 0 && styles.providerActionBtnDisabled,
                        ]}
                        activeOpacity={0.6}
                      >
                        <Ionicons name="chevron-up" size={18} color={theme.colors.textPrimary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        disabled={index === providerOrder.length - 1}
                        onPress={() => moveProvider(index, index + 1)}
                        style={[
                          styles.providerActionBtn,
                          index === providerOrder.length - 1 && styles.providerActionBtnDisabled,
                        ]}
                        activeOpacity={0.6}
                      >
                        <Ionicons name="chevron-down" size={18} color={theme.colors.textPrimary} />
                      </TouchableOpacity>
                      <Pressable
                        disabled={index === providerOrder.length - 1}
                        onPress={() => moveProvider(index, providerOrder.length - 1)}
                        style={({ pressed }) => [
                          styles.providerActionBtn,
                          index === providerOrder.length - 1 && styles.providerActionBtnDisabled,
                          pressed &&
                            index !== providerOrder.length - 1 &&
                            styles.providerActionBtnPressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Move ${PROVIDER_DISPLAY_NAMES[id]} to bottom`}
                      >
                        <Ionicons
                          name="play-skip-forward"
                          size={16}
                          color={theme.colors.textPrimary}
                        />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
              <TouchableOpacity
                style={[styles.testBtn, { marginTop: 4, marginBottom: 12 }]}
                onPress={() => setProviderOrder([...DEFAULT_PROVIDER_ORDER])}
                activeOpacity={0.8}
              >
                <Text style={styles.testBtnText}>Reset to Default Order</Text>
              </TouchableOpacity>
            </SubSectionToggle>

            {/* ── Image Generation ────────────────────── */}
            <View style={styles.subSectionDivider} />
            <SubSectionToggle id="ai_image_gen" title="IMAGE GENERATION">
              <Text style={styles.hint}>
                Diagrams and study images. fal uses a separate API key and does not reuse ChatGPT
                Plus login.
              </Text>
              <Text style={styles.label}>fal API Key</Text>
              <View style={styles.apiKeyRow}>
                <TextInput
                  style={[
                    styles.input,
                    styles.apiKeyInput,
                    falValidationStatus === 'ok' && styles.inputSuccess,
                    falValidationStatus === 'fail' && styles.inputError,
                  ]}
                  placeholder="fal key"
                  placeholderTextColor={theme.colors.textMuted}
                  value={falApiKey}
                  onChangeText={(value) => {
                    setFalApiKey(value);
                    setFalKeyTestResult(null);
                    clearProviderValidated('fal');
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={[
                    styles.validateBtn,
                    falValidationStatus === 'ok' && styles.validateBtnOk,
                    falValidationStatus === 'fail' && styles.validateBtnFail,
                  ]}
                  onPress={testFalKey}
                  disabled={testingFalKey}
                  activeOpacity={0.8}
                >
                  {testingFalKey ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <Ionicons
                      name={
                        falValidationStatus === 'ok'
                          ? 'checkmark-circle'
                          : falValidationStatus === 'fail'
                            ? 'close-circle'
                            : 'flash-outline'
                      }
                      size={20}
                      color={
                        falValidationStatus === 'ok'
                          ? theme.colors.success
                          : falValidationStatus === 'fail'
                            ? theme.colors.error
                            : theme.colors.primary
                      }
                    />
                  )}
                </TouchableOpacity>
              </View>
              <Text style={styles.hint}>
                Validate your fal API key with fal's model catalog endpoint.
              </Text>
              <Text style={styles.label}>Brave Search API Key</Text>
              <View style={styles.apiKeyRow}>
                <TextInput
                  style={[
                    styles.input,
                    styles.apiKeyInput,
                    braveValidationStatus === 'ok' && styles.inputSuccess,
                    braveValidationStatus === 'fail' && styles.inputError,
                  ]}
                  placeholder="brave key"
                  placeholderTextColor={theme.colors.textMuted}
                  value={braveSearchApiKey}
                  onChangeText={(value) => {
                    setBraveSearchApiKey(value);
                    setBraveSearchKeyTestResult(null);
                    clearProviderValidated('brave');
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={[
                    styles.validateBtn,
                    braveValidationStatus === 'ok' && styles.validateBtnOk,
                    braveValidationStatus === 'fail' && styles.validateBtnFail,
                  ]}
                  onPress={testBraveSearchKey}
                  disabled={testingBraveSearchKey}
                  activeOpacity={0.8}
                >
                  {testingBraveSearchKey ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <Ionicons
                      name={
                        braveValidationStatus === 'ok'
                          ? 'checkmark-circle'
                          : braveValidationStatus === 'fail'
                            ? 'close-circle'
                            : 'images-outline'
                      }
                      size={20}
                      color={
                        braveValidationStatus === 'ok'
                          ? theme.colors.success
                          : braveValidationStatus === 'fail'
                            ? theme.colors.error
                            : theme.colors.primary
                      }
                    />
                  )}
                </TouchableOpacity>
              </View>
              <Text style={styles.hint}>
                Optional fallback for image search when MedPix, Open-i, and Wikimedia return
                nothing.
              </Text>
              <View style={styles.modelChipRow}>
                {imageGenerationOptions.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.freqBtn,
                      imageGenerationModel === opt.value && styles.freqBtnActive,
                    ]}
                    onPress={() => setImageGenerationModel(opt.value)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.freqText,
                        imageGenerationModel === opt.value && styles.freqTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </SubSectionToggle>

            <View style={styles.subSectionDivider} />
            <SubSectionToggle id="ai_transcription" title="TRANSCRIPTION">
              <Text style={styles.hint}>
                Configure transcription providers and keys used by Recording Vault and external
                lecture processing.
              </Text>
              <TranscriptionSettingsPanel embedded />
            </SubSectionToggle>

            {/* ── Local AI ────────────────────────────── */}
            <View style={styles.subSectionDivider} />
            <SubSectionToggle id="ai_local_ai" title="LOCAL AI">
              <Text style={styles.hint}>
                Run AI on-device for offline chat and local transcription.
              </Text>
              {localAiEnabled && (
                <Text style={[styles.hint, styles.localAiEnabledHint]}>
                  Local AI is currently enabled.
                </Text>
              )}
              <View style={styles.localAiStatusRow}>
                <Text style={[styles.localAiStatusText, styles.localAiStatusTextWrap]}>
                  LLM model:{' '}
                  <Text
                    numberOfLines={2}
                    style={localLlmReady ? styles.localAiModelName : styles.localAiModelMissing}
                  >
                    {localLlmReady ? localLlmFileName : 'Not installed'}
                  </Text>
                </Text>
                {profile?.useLocalModel && localLlmReady ? (
                  <View style={styles.localAiActiveDot} />
                ) : null}
              </View>
              <View style={styles.localAiStatusRow}>
                <Text style={[styles.localAiStatusText, styles.localAiStatusTextWrap]}>
                  Whisper model:{' '}
                  <Text
                    numberOfLines={2}
                    style={localWhisperReady ? styles.localAiModelName : styles.localAiModelMissing}
                  >
                    {localWhisperReady ? localWhisperFileName : 'Not installed'}
                  </Text>
                </Text>
                {profile?.useLocalWhisper && localWhisperReady ? (
                  <View style={styles.localAiActiveDot} />
                ) : null}
              </View>
              {!localLlmAllowed && (
                <Text style={[styles.hint, styles.localAiWarningHint]}>{localLlmWarning}</Text>
              )}
              <TouchableOpacity
                style={styles.localModelBtn}
                activeOpacity={0.8}
                onPress={() => navigation.navigate('LocalModel' as any)}
              >
                <Ionicons
                  name="download-outline"
                  size={18}
                  color={theme.colors.textPrimary}
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.localModelBtnText}>Manage Local AI Models</Text>
              </TouchableOpacity>
            </SubSectionToggle>
          </SectionToggle>

          <Text style={styles.categoryLabel}>ACCOUNT</Text>
          <SectionToggle
            id="permissions"
            title="Permissions & Diagnostics"
            icon="shield-checkmark-outline"
            tint="#4CAF50"
          >
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
                label="Local File Access (Audio Imports)"
                status={permStatus.localFiles}
                onFix={async () => {
                  await PermissionsAndroid.request(LOCAL_FILE_ACCESS_PERMISSION);
                  checkPermissions();
                }}
              />
            )}
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
            <TouchableOpacity
              style={[styles.diagBtn, { marginTop: 8 }]}
              onPress={() => {
                const { devConsole } = require('../components/DevConsole');
                devConsole.show();
              }}
            >
              <Text style={styles.diagBtnText}>Open Dev Console</Text>
            </TouchableOpacity>
          </SectionToggle>

          <SectionToggle id="profile" title="Profile" icon="person-outline" tint="#8EC5FF">
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

          <SectionToggle id="exam_dates" title="Exam Dates" icon="calendar-outline" tint="#FF9800">
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

          <Text style={styles.categoryLabel}>STUDY</Text>
          <SectionToggle
            id="study_prefs"
            title="Study Preferences"
            icon="school-outline"
            tint="#E040FB"
          >
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

          <SectionToggle
            id="notifications"
            title="Notifications"
            icon="notifications-outline"
            tint="#FFD700"
          >
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
              How often Guru sends ambient messages during sessions. Rare: every 30min, Normal:
              every 20min, Frequent: every 10min.
            </Text>
            <TouchableOpacity style={styles.testBtn} onPress={testNotification} activeOpacity={0.8}>
              <Text style={styles.testBtnText}>Schedule Notifications Now</Text>
            </TouchableOpacity>
          </SectionToggle>

          <SectionToggle
            id="body_doubling"
            title="Body Doubling"
            icon="people-outline"
            tint="#7ED6A7"
          >
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

          <SectionToggle
            id="content"
            title="Content Type Preferences"
            icon="layers-outline"
            tint="#FF6B9D"
          >
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

          <SectionToggle
            id="focus_subjects"
            title="Focus Subjects"
            icon="flask-outline"
            tint="#2196F3"
          >
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

          <SectionToggle id="session" title="Session Timing" icon="timer-outline" tint="#FF9800">
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

          <SectionToggle
            id="pomodoro"
            title="Pomodoro (Lecture Overlay)"
            icon="alarm-outline"
            tint="#F44336"
          >
            <View style={styles.switchRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.switchLabel}>Enable Pomodoro Suggestion</Text>
                <Text style={styles.hint}>
                  Auto-expand the external lecture overlay every interval to suggest a break.
                </Text>
              </View>
              <Switch
                value={pomodoroEnabled}
                onValueChange={setPomodoroEnabled}
                trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                thumbColor={theme.colors.textPrimary}
              />
            </View>
            <Text
              style={[
                styles.hint,
                {
                  color: pomodoroLectureQuizReady
                    ? theme.colors.success
                    : pomodoroEnabled
                      ? theme.colors.error
                      : theme.colors.textMuted,
                },
              ]}
            >
              {pomodoroLectureQuizReady
                ? 'Lecture-aware break quizzes are ready.'
                : pomodoroEnabled
                  ? 'Currently this will only suggest a break until overlay permission, Groq, and Deepgram are configured.'
                  : 'Pomodoro break suggestions are off.'}
            </Text>
            {!hasPomodoroOverlayPermission && (
              <TouchableOpacity
                style={[
                  styles.validateBtn,
                  { alignSelf: 'flex-start', paddingHorizontal: 14, marginTop: 6 },
                ]}
                onPress={async () => {
                  await requestOverlayPermission();
                  await checkPermissions();
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.testBtnText}>Grant Overlay Permission</Text>
              </TouchableOpacity>
            )}
            <View style={[styles.chipGrid, { marginTop: 10 }]}>
              {[
                { label: 'Overlay', ready: hasPomodoroOverlayPermission },
                { label: 'Groq', ready: hasPomodoroGroqKey },
                { label: 'Deepgram', ready: hasPomodoroDeepgramKey },
              ].map((item) => (
                <View
                  key={item.label}
                  style={[
                    styles.typeChip,
                    {
                      backgroundColor: item.ready
                        ? theme.colors.success + '18'
                        : theme.colors.error + '12',
                      borderColor: item.ready ? theme.colors.success : theme.colors.error,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.typeChipText,
                      { color: item.ready ? theme.colors.success : theme.colors.error },
                    ]}
                  >
                    {item.label}
                  </Text>
                </View>
              ))}
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
            <View style={styles.modelChipRow}>
              {['20', '25', '30', '40'].map((value) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.freqBtn, pomodoroInterval === value && styles.freqBtnActive]}
                  onPress={() => setPomodoroInterval(value)}
                  disabled={!pomodoroEnabled}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.freqText,
                      pomodoroInterval === value && styles.freqTextActive,
                      !pomodoroEnabled && { opacity: 0.45 },
                    ]}
                  >
                    {value}m
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.hint}>
              Suggested: 20-30 minutes. The overlay can suggest a break without quiz data, but
              lecture-aware quiz breaks need both Groq and Deepgram.
            </Text>
          </SectionToggle>

          <Text style={styles.categoryLabel}>STORAGE</Text>
          <SectionToggle id="data" title="Data" icon="trash-outline" tint="#F44336">
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
              <Text style={styles.dangerBtnText}>Clear AI Content Cache</Text>
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
                Reset All Progress
              </Text>
            </TouchableOpacity>
            <Text style={styles.hint}>
              Wipes XP, streaks, topic statuses, and daily logs. API keys are kept.
            </Text>
          </SectionToggle>

          <SectionToggle
            id="backup"
            title="Backup & Restore"
            icon="cloud-upload-outline"
            tint="#4CAF50"
          >
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
                  <Text style={styles.backupBtnText}>Export Backup</Text>
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
                <Text style={[styles.backupBtnText, { color: theme.colors.success }]}>
                  Import Backup
                </Text>
              </TouchableOpacity>
            </View>
          </SectionToggle>

          <SectionToggle
            id="advanced"
            title="Library Maintenance"
            icon="construct-outline"
            tint="#8080A0"
          >
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
                    const { retryFailedTasks } =
                      await import('../services/lecture/lectureSessionMonitor');
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
                      await import('../services/lecture/lectureSessionMonitor');
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
                      await import('../services/lecture/lectureSessionMonitor');
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
                      await import('../services/lecture/lectureSessionMonitor');
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

          {saving && (
            <View style={[styles.saveBtn, styles.saveBtnDisabled]}>
              <ActivityIndicator size="small" color={theme.colors.textPrimary} />
              <Text style={[styles.saveBtnText, { marginLeft: 8 }]}>Auto-saving…</Text>
            </View>
          )}

          <Text style={styles.footer}>Guru AI · v1.0.0</Text>
        </ScrollView>
      </KeyboardAvoidingView>
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

/** Dropdown picker for model selection — replaces congested chip rows. */
function ModelDropdown({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: string;
  options: Array<{ id: string; label: string; group?: string }>;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const selectedLabel = options.find((o) => o.id === value)?.label ?? (value || 'Select...');

  return (
    <>
      <Label text={label} />
      <TouchableOpacity
        style={styles.dropdownTrigger}
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.dropdownValue} numberOfLines={2}>
          {selectedLabel}
        </Text>
        <Text style={styles.dropdownArrow}>▾</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.dropdownBackdrop} onPress={() => setOpen(false)}>
          <View style={styles.dropdownSheet}>
            <Text style={styles.dropdownSheetTitle}>{label}</Text>
            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator>
              {options.map((opt, idx) => {
                const showGroup = opt.group && (idx === 0 || options[idx - 1]?.group !== opt.group);
                return (
                  <React.Fragment key={opt.id}>
                    {showGroup && <Text style={styles.dropdownGroupLabel}>{opt.group}</Text>}
                    <TouchableOpacity
                      style={[styles.dropdownItem, value === opt.id && styles.dropdownItemActive]}
                      onPress={() => {
                        onSelect(opt.id);
                        setOpen(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.dropdownItemText,
                          value === opt.id && styles.dropdownItemTextActive,
                        ]}
                        numberOfLines={2}
                      >
                        {opt.label}
                      </Text>
                      {value === opt.id && <Text style={styles.dropdownCheck}>✓</Text>}
                    </TouchableOpacity>
                  </React.Fragment>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, paddingBottom: 60 },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 20,
    marginTop: 8,
  },
  section: { marginBottom: theme.spacing.md },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    flex: 1,
  },
  sectionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  sectionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  categoryLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xs,
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
  validateBtnOk: {
    backgroundColor: theme.colors.successSurface,
    borderColor: theme.colors.success,
  },
  validateBtnFail: {
    backgroundColor: theme.colors.errorSurface,
    borderColor: theme.colors.error,
  },
  validateBtnTesting: { backgroundColor: theme.colors.card, borderColor: theme.colors.primary },
  validateBtnText: { color: theme.colors.textPrimary, fontWeight: '700', fontSize: 14 },
  validationMsg: { fontSize: 12, marginTop: 6, marginBottom: 2 },
  validationSuccess: { color: theme.colors.success },
  validationError: { color: theme.colors.error },
  hint: { color: theme.colors.textMuted, fontSize: 12, marginBottom: 4 },
  subSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  subSectionLabel: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  subSectionDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 14,
  },
  localModelBtn: {
    marginTop: 12,
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  localModelBtnText: { color: theme.colors.textPrimary, fontWeight: '700', fontSize: 14 },
  localAiStatusText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  localAiStatusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  localAiStatusTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  localAiEnabledHint: {
    color: theme.colors.success,
    marginBottom: 8,
  },
  localAiWarningHint: {
    color: theme.colors.warning,
    marginTop: 4,
  },
  localAiModelName: {
    color: theme.colors.warning,
    fontWeight: '700',
  },
  localAiModelMissing: {
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  localAiActiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.success,
    marginLeft: 12,
    flexShrink: 0,
  },
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
  providerRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  providerIndex: {
    color: theme.colors.textMuted,
    fontSize: 13,
    width: 20,
    lineHeight: 20,
    fontWeight: '600' as const,
  },
  providerDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  providerName: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '500' as const },
  providerActions: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
    marginLeft: 8,
    justifyContent: 'flex-end' as const,
  },
  providerActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  providerActionBtnDisabled: { opacity: 0.25 },
  providerActionBtnPressed: { backgroundColor: theme.colors.card },
  saveBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row' as const,
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
  frequencyRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  guruMemoryInput: {
    minHeight: 88,
    paddingTop: 12,
  },
  liveModelsRefreshRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  modelChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  freqBtn: {
    backgroundColor: theme.colors.background,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  freqBtnActive: {
    backgroundColor: theme.colors.primaryTintSoft,
    borderColor: theme.colors.primary,
  },
  freqText: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: '600' },
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
  // Dropdown styles
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 6,
    marginBottom: 8,
  },
  dropdownValue: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    flex: 1,
  },
  dropdownArrow: { color: theme.colors.textMuted, fontSize: 16, marginLeft: 8 },
  dropdownBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  dropdownSheet: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    paddingVertical: 12,
    maxHeight: '80%',
  },
  dropdownSheetTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  dropdownGroupLabel: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dropdownItemActive: { backgroundColor: theme.colors.primaryTintSoft },
  dropdownItemText: { color: theme.colors.textPrimary, fontSize: 14, lineHeight: 20, flex: 1 },
  dropdownItemTextActive: { color: theme.colors.primary, fontWeight: '700' },
  dropdownCheck: { color: theme.colors.primary, fontSize: 16, fontWeight: '700', marginLeft: 8 },
});
