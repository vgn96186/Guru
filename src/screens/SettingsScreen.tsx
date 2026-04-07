import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
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
import LinearSurface from '../components/primitives/LinearSurface';
import LinearText from '../components/primitives/LinearText';
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
import { showDialog } from '../components/dialogService';
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
import { showToast } from '../components/Toast';
import {
  testGroqConnection,
  testHuggingFaceConnection,
  testOpenRouterConnection,
  testGeminiConnection,
  testCloudflareConnection,
  testBraveSearchConnection,
  testFalConnection,
  testGitHubModelsConnection,
  testGitHubCopilotConnection,
  testGitLabDuoConnection,
  testKiloConnection,
  testDeepgramConnection,
  testQwenConnection,
} from '../services/ai/providerHealth';
import { getQwenAccessToken } from '../services/ai/qwen';
import type { ChatGptAccountSlot, ContentType, ProviderId, Subject, UserProfile } from '../types';
import { DEFAULT_PROVIDER_ORDER, PROVIDER_DISPLAY_NAMES } from '../types';
import { sanitizeProviderOrder } from '../utils/providerOrder';
import {
  requestDeviceCode,
  pollForAuthorization,
  exchangeForTokens,
  saveTokens,
  clearTokens,
  VERIFICATION_URL,
  type DeviceCodeResponse,
} from '../services/ai/chatgpt';
import {
  requestDeviceCode as requestGitHubDeviceCode,
  pollForToken as pollGitHubToken,
  saveTokens as saveGitHubTokens,
  clearTokens as clearGitHubTokens,
  getValidAccessToken as getGitHubCopilotAccessToken,
  VERIFICATION_URL as GITHUB_VERIFICATION_URL,
  isGitHubCopilotConnected,
  invalidateCopilotSessionToken,
} from '../services/ai/github';
import {
  buildAuthUrl,
  clearTokens as clearGitLabTokens,
  savePendingOAuthSession,
  getStoredGitLabClientSecret,
  tryCompleteGitLabDuoOAuth,
  getRedirectUri,
  getGitLabInstanceUrl,
  getValidAccessToken as getGitLabDuoAccessToken,
  usesDefaultGitLabClientId,
} from '../services/ai/gitlab';
import {
  requestDeviceCode as requestPoeDeviceCode,
  pollForToken as pollPoeToken,
  saveTokens as savePoeTokens,
  clearTokens as clearPoeTokens,
  VERIFICATION_URL as POE_VERIFICATION_URL,
  isPoeConnected,
} from '../services/ai/poe';
import {
  requestDeviceCode as requestQwenDeviceCode,
  pollForToken as pollQwenToken,
  saveQwenTokens,
  clearQwenTokens,
  loadQwenTokens,
  isQwenAuthenticated,
} from '../services/ai/qwen';
import { linearTheme as n } from '../theme/linearTheme';
import {
  DEFAULT_HF_TRANSCRIPTION_MODEL,
  DEFAULT_INICET_DATE,
  DEFAULT_IMAGE_GENERATION_MODEL,
  DEFAULT_NEET_DATE,
  FAL_IMAGE_GENERATION_MODEL_OPTIONS,
  GITHUB_COPILOT_MODELS,
  GOOGLE_WEB_CLIENT_ID,
  GITLAB_DUO_MODELS,
  IMAGE_GENERATION_MODEL_OPTIONS,
  normalizeImageGenerationModel,
} from '../config/appConfig';
import { formatGuruChatModelChipLabel } from '../services/ai/guruChatModelPreference';
import { useLiveGuruChatModels } from '../hooks/useLiveGuruChatModels';
import { getLocalLlmRamWarning, isLocalLlmAllowedOnThisDevice } from '../services/deviceMemory';
import ScreenHeader from '../components/ScreenHeader';
import TranscriptionSettingsPanel from '../components/TranscriptionSettingsPanel';
import {
  exportUnifiedBackup,
  importUnifiedBackup,
  runAutoBackup,
  shouldRunAutoBackup,
  cleanupOldBackups,
  type AutoBackupFrequency,
  type RestoreOptions,
} from '../services/unifiedBackupService';
import { profileRepository } from '../db/repositories';

function sanitizeGithubCopilotPreferredModel(value: string): string {
  const t = value.trim();
  if (!t) return '';
  return (GITHUB_COPILOT_MODELS as readonly string[]).includes(t) ? t : '';
}

function sanitizeGitlabDuoPreferredModel(value: string): string {
  const t = value.trim();
  if (!t) return '';
  return (GITLAB_DUO_MODELS as readonly string[]).includes(t) ? t : '';
}

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

type ValidationProviderId = ProviderId | 'deepgram' | 'fal' | 'brave' | 'google';
type ApiValidationEntry = { verified: boolean; verifiedAt: number; fingerprint: string };
type ApiValidationState = Partial<Record<ValidationProviderId, ApiValidationEntry>>;
type ChatGptAccountSettings = {
  primary: { enabled: boolean; connected: boolean };
  secondary: { enabled: boolean; connected: boolean };
};

function defaultChatGptAccountSettings(): ChatGptAccountSettings {
  return {
    primary: { enabled: true, connected: false },
    secondary: { enabled: false, connected: false },
  };
}

function sanitizeChatGptAccountSettings(value: unknown): ChatGptAccountSettings {
  const fallback = defaultChatGptAccountSettings();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const root = value as Record<string, unknown>;
  const readSlot = (slot: ChatGptAccountSlot) => {
    const raw = root[slot];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback[slot];
    const record = raw as Record<string, unknown>;
    return {
      enabled: typeof record.enabled === 'boolean' ? record.enabled : fallback[slot].enabled,
      connected:
        typeof record.connected === 'boolean' ? record.connected : fallback[slot].connected,
    };
  };
  return {
    primary: readSlot('primary'),
    secondary: readSlot('secondary'),
  };
}

function isChatGptEnabled(settings: ChatGptAccountSettings): boolean {
  return (
    (settings.primary.enabled && settings.primary.connected) ||
    (settings.secondary.enabled && settings.secondary.connected)
  );
}

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
            <LinearText style={styles.sectionTitle}>{title}</LinearText>
          </View>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={n.colors.textMuted}
          />
        </TouchableOpacity>
        {isExpanded && (
          <LinearSurface padded={false} style={styles.sectionContent}>
            {children}
          </LinearSurface>
        )}
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
          <LinearText style={styles.subSectionLabel}>{title}</LinearText>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={n.colors.accent}
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
  const [dbmciClassStartDate, setDbmciClassStartDate] = useState('');
  const [btrStartDate, setBtrStartDate] = useState('');
  const [homeNoveltyCooldownHours, setHomeNoveltyCooldownHours] = useState('6');
  const [sessionLength, setSessionLength] = useState('45');
  const [dailyGoal, setDailyGoal] = useState('120');
  const [notifs, setNotifs] = useState(true);
  const [strictMode, setStrictMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [autoBackupFrequency, setAutoBackupFrequency] = useState<AutoBackupFrequency>('off');
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
  const [testingQwenKey, setTestingQwenKey] = useState(false);
  const [qwenKeyTestResult, setQwenKeyTestResult] = useState<'ok' | 'fail' | null>(null);
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
  const [googleCustomSearchApiKey, setGoogleCustomSearchApiKey] = useState('');
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
  const [testingGoogleCustomSearchKey, setTestingGoogleCustomSearchKey] = useState(false);
  const [googleCustomSearchKeyTestResult, setGoogleCustomSearchKeyTestResult] = useState<
    'ok' | 'fail' | null
  >(null);
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
  const [chatgptAccounts, setChatgptAccounts] = useState<ChatGptAccountSettings>(
    defaultChatGptAccountSettings(),
  );
  const [chatgptConnectingSlot, setChatgptConnectingSlot] = useState<ChatGptAccountSlot | null>(
    null,
  );
  const [chatgptDeviceCode, setChatgptDeviceCode] = useState<DeviceCodeResponse | null>(null);
  const [githubCopilotConnecting, setGithubCopilotConnecting] = useState(false);
  const [githubCopilotDeviceCode, setGithubCopilotDeviceCode] = useState<any>(null);
  const [githubCopilotConnected, setGithubCopilotConnected] = useState(false);
  const [githubCopilotPreferredModel, setGithubCopilotPreferredModel] = useState('');
  const [gitlabDuoPreferredModel, setGitlabDuoPreferredModel] = useState('');
  const [gitlabDuoConnecting, setGitlabDuoConnecting] = useState(false);
  const [gitlabDuoConnected, setGitlabDuoConnected] = useState(false);
  const [gitlabPasteModalVisible, setGitlabPasteModalVisible] = useState(false);
  const [gitlabPasteUrl, setGitlabPasteUrl] = useState('');
  const [gitlabPasteSubmitting, setGitlabPasteSubmitting] = useState(false);
  const [gitlabOauthClientId, setGitlabOauthClientId] = useState('');
  /** Only in memory / SecureStore — never loaded from backup (confidential OAuth secret). */
  const [gitlabOauthClientSecret, setGitlabOauthClientSecret] = useState('');
  const [testingGitHubCopilotOAuth, setTestingGitHubCopilotOAuth] = useState(false);
  const [githubCopilotOAuthTestResult, setGithubCopilotOAuthTestResult] = useState<
    'ok' | 'fail' | null
  >(null);
  const [testingGitLabDuoOAuth, setTestingGitLabDuoOAuth] = useState(false);
  const [gitlabDuoOAuthTestResult, setGitlabDuoOAuthTestResult] = useState<'ok' | 'fail' | null>(
    null,
  );
  const [poeConnecting, setPoeConnecting] = useState(false);
  const [poeDeviceCode, setPoeDeviceCode] = useState<any>(null);
  const [poeConnected, setPoeConnected] = useState(false);
  const [qwenConnecting, setQwenConnecting] = useState(false);
  const [qwenDeviceCode, setQwenDeviceCode] = useState<any>(null);
  const [qwenConnected, setQwenConnected] = useState(false);
  const [gdriveWebClientId, setGdriveWebClientId] = useState('');
  const [guruChatDefaultModel, setGuruChatDefaultModel] = useState('auto');
  const [imageGenerationModel, setImageGenerationModel] = useState<string>(
    DEFAULT_IMAGE_GENERATION_MODEL,
  );
  const [guruMemoryNotes, setGuruMemoryNotes] = useState('');
  const [preferGeminiStructuredJson, setPreferGeminiStructuredJson] = useState(true);
  const [providerOrder, setProviderOrder] = useState<import('../types').ProviderId[]>([]);
  const [disabledProviders, setDisabledProviders] = useState<Set<import('../types').ProviderId>>(
    new Set(),
  );
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
    chatgptConnected: isChatGptEnabled(chatgptAccounts),
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

  async function testQwenKey() {
    if (!profile?.qwenConnected && !qwenConnected) {
      Alert.alert('Not connected', 'Connect Qwen OAuth first to validate the connection.');
      return;
    }
    setTestingQwenKey(true);
    setQwenKeyTestResult(null);
    try {
      const tokenResult = await getQwenAccessToken();
      if (!tokenResult || !tokenResult.accessToken) {
        setQwenKeyTestResult('fail');
        Alert.alert('Validation failed', 'No OAuth token available. Try reconnecting Qwen.');
        setTestingQwenKey(false);
        return;
      }
      const res = await testQwenConnection(
        tokenResult.accessToken,
        tokenResult.apiKey,
        tokenResult.resourceUrl,
      );
      setQwenKeyTestResult(res.ok ? 'ok' : 'fail');
      if (res.ok) markProviderValidated('qwen', tokenResult.accessToken);
      else clearProviderValidated('qwen');
      if (!res.ok) {
        Alert.alert('Validation failed', res.message || 'Qwen API returned an error.');
      }
    } catch (err: any) {
      setQwenKeyTestResult('fail');
      Alert.alert('Validation failed', err.message || 'Unknown error');
    }
    setTestingQwenKey(false);
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

  async function connectChatGpt(slot: ChatGptAccountSlot) {
    setChatgptConnectingSlot(slot);
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
        await saveTokens(tokens, slot);
        const nextAccounts = sanitizeChatGptAccountSettings(chatgptAccounts);
        nextAccounts[slot] = { enabled: true, connected: true };
        await updateUserProfile({
          chatgptAccounts: nextAccounts,
          chatgptConnected: isChatGptEnabled(nextAccounts),
        });
        setChatgptAccounts(nextAccounts);
        setChatgptDeviceCode(null);
        setChatgptConnectingSlot(null);
        refreshProfile();
        Alert.alert(
          'Connected',
          `ChatGPT ${slot === 'primary' ? 'primary' : 'secondary'} account is now linked to Guru.`,
        );
        return;
      }
      throw new Error('Device code expired. Please try again.');
    } catch (err: any) {
      Alert.alert('Connection failed', err.message ?? 'Unknown error');
      setChatgptDeviceCode(null);
      setChatgptConnectingSlot(null);
    }
  }

  async function disconnectChatGpt(slot: ChatGptAccountSlot) {
    Alert.alert('Disconnect ChatGPT?', 'This will remove stored tokens for this account slot.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          await clearTokens(slot);
          const nextAccounts = sanitizeChatGptAccountSettings(chatgptAccounts);
          nextAccounts[slot] = { ...nextAccounts[slot], connected: false };
          await updateUserProfile({
            chatgptAccounts: nextAccounts,
            chatgptConnected: isChatGptEnabled(nextAccounts),
          });
          setChatgptAccounts(nextAccounts);
          refreshProfile();
        },
      },
    ]);
  }

  // ── GitHub Copilot OAuth ───────────────────────────────────────────────
  async function connectGitHubCopilot() {
    setGithubCopilotConnecting(true);
    try {
      const dc = await requestGitHubDeviceCode();
      setGithubCopilotDeviceCode(dc);
      Linking.openURL(GITHUB_VERIFICATION_URL);

      const pollInterval = (dc.interval || 5) * 1000;
      const deadline = Date.now() + dc.expires_in * 1000;

      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, pollInterval));
        const tokenResult = await pollGitHubToken(dc.device_code);
        if (!tokenResult) continue;

        await saveGitHubTokens(tokenResult);
        await updateUserProfile({ githubCopilotConnected: true });
        setGithubCopilotConnected(true);
        setGithubCopilotDeviceCode(null);
        setGithubCopilotConnecting(false);
        refreshProfile();
        Alert.alert('Connected', 'GitHub Copilot is now linked to Guru.');
        return;
      }
      throw new Error('Device code expired. Please try again.');
    } catch (err: any) {
      Alert.alert('Connection failed', err.message ?? 'Unknown error');
      setGithubCopilotDeviceCode(null);
      setGithubCopilotConnecting(false);
    }
  }

  async function disconnectGitHubCopilot() {
    Alert.alert('Disconnect GitHub Copilot?', 'This will remove stored tokens.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          invalidateCopilotSessionToken();
          await clearGitHubTokens();
          await updateUserProfile({ githubCopilotConnected: false });
          setGithubCopilotConnected(false);
          setGithubCopilotOAuthTestResult(null);
          refreshProfile();
        },
      },
    ]);
  }

  async function validateGitHubCopilotConnection() {
    const log = '[SETTINGS_VALIDATE][github_copilot]';
    console.info(`${log} Starting OAuth + api.githubcopilot.com probe…`);
    setTestingGitHubCopilotOAuth(true);
    setGithubCopilotOAuthTestResult(null);
    try {
      let token: string;
      try {
        token = await getGitHubCopilotAccessToken();
        console.info(`${log} Access token OK (chars=${token.length})`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`${log} Token failed:`, msg);
        setGithubCopilotOAuthTestResult('fail');
        Alert.alert(
          'GitHub Copilot validate',
          `${msg}\n\nMetro: search ${log} for full details.\nIf the app shows Connected but this fails, Disconnect and sign in again.`,
        );
        return;
      }
      const res = await testGitHubCopilotConnection(token);
      console.info(`${log} HTTP ${res.status} ok=${res.ok}`, res.message?.slice(0, 400) ?? '');
      setGithubCopilotOAuthTestResult(res.ok ? 'ok' : 'fail');
      if (res.ok) {
        Alert.alert(
          'GitHub Copilot validate',
          `OK — HTTP ${res.status}. Copilot API accepted a minimal chat request.\n\nMetro logs: ${log}`,
        );
      } else {
        Alert.alert(
          'GitHub Copilot validate',
          `HTTP ${res.status}\n${(res.message ?? '').slice(0, 480)}\n\nMetro: ${log}`,
        );
      }
    } finally {
      setTestingGitHubCopilotOAuth(false);
    }
  }

  // ── GitLab Duo OAuth ──────────────────────────────────────────────────
  async function connectGitLabDuo() {
    if (usesDefaultGitLabClientId(gitlabOauthClientId)) {
      Alert.alert(
        'GitLab Application ID required',
        `Paste your OAuth Application ID in the field above (GitLab → Preferences → Applications), or set EXPO_PUBLIC_GITLAB_CLIENT_ID for your build.\n\nScopes: read_user, api (same as OpenCode GitLab Duo — enables AI Gateway).\nReconnect if you previously used ai_features only.\nRedirect URI must match exactly:\n${getRedirectUri()}`,
        [{ text: 'OK' }],
      );
      return;
    }
    const oauthSecret =
      gitlabOauthClientSecret.trim() || (await getStoredGitLabClientSecret())?.trim() || undefined;
    setGitlabDuoConnecting(true);
    try {
      const { url, codeVerifier, state, oauthClientId } = await buildAuthUrl(gitlabOauthClientId);
      await savePendingOAuthSession(codeVerifier, state, oauthClientId, oauthSecret);
      await Linking.openURL(url);
      Alert.alert(
        'Sign in with GitLab',
        'Finish in the browser. The app should reopen automatically when authorization completes. If it does not, use "Paste callback URL" below with the full guru-study:// link.',
      );
    } catch (err: any) {
      Alert.alert('Connection failed', err.message ?? 'Unknown error');
    } finally {
      setGitlabDuoConnecting(false);
    }
  }

  async function submitGitLabPasteUrl() {
    const raw = gitlabPasteUrl.trim();
    if (!raw) {
      Alert.alert('Empty', 'Paste the full callback URL (guru-study://oauth/gitlab?...).');
      return;
    }
    setGitlabPasteSubmitting(true);
    try {
      const handled = await tryCompleteGitLabDuoOAuth(raw);
      if (handled) {
        await refreshProfile();
        const p = useAppStore.getState().profile;
        setGitlabDuoConnected(!!p?.gitlabDuoConnected);
        if (p?.gitlabDuoConnected) {
          setGitlabPasteModalVisible(false);
          setGitlabPasteUrl('');
          setGitlabOauthClientSecret('');
        }
      }
    } finally {
      setGitlabPasteSubmitting(false);
    }
  }

  async function disconnectGitLabDuo() {
    Alert.alert('Disconnect GitLab Duo?', 'This will remove stored tokens.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          await clearGitLabTokens();
          await updateUserProfile({ gitlabDuoConnected: false });
          setGitlabDuoConnected(false);
          setGitlabDuoOAuthTestResult(null);
          refreshProfile();
        },
      },
    ]);
  }

  async function validateGitLabDuoConnection() {
    const log = '[SETTINGS_VALIDATE][gitlab_duo]';
    const instance = getGitLabInstanceUrl();
    console.info(
      `${log} Starting OAuth + ${instance}/api/v4/ai/third_party_agents/direct_access probe…`,
    );
    setTestingGitLabDuoOAuth(true);
    setGitlabDuoOAuthTestResult(null);
    try {
      let token: string;
      try {
        token = await getGitLabDuoAccessToken();
        console.info(`${log} Access token OK (chars=${token.length})`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`${log} Token failed:`, msg);
        setGitlabDuoOAuthTestResult('fail');
        Alert.alert('GitLab Duo validate', `${msg}\n\nMetro: search ${log} for details.`);
        return;
      }
      const res = await testGitLabDuoConnection(token);
      console.info(`${log} HTTP ${res.status} ok=${res.ok}`, res.message?.slice(0, 400) ?? '');
      setGitlabDuoOAuthTestResult(res.ok ? 'ok' : 'fail');
      if (res.ok) {
        Alert.alert(
          'GitLab Duo validate',
          `OK — HTTP ${res.status}. OpenCode-style direct_access (AI Gateway) accepted the token.\n\nMetro: ${log}`,
        );
      } else {
        Alert.alert(
          'GitLab Duo validate',
          `HTTP ${res.status}\n${(res.message ?? '').slice(0, 480)}\n\n403/404: need Premium/Ultimate Duo, OAuth scopes read_user+api (reconnect), or self-managed Duo + Agent Platform. Metro: ${log}`,
        );
      }
    } finally {
      setTestingGitLabDuoOAuth(false);
    }
  }

  // ── Poe OAuth ─────────────────────────────────────────────────────────
  async function connectPoe() {
    setPoeConnecting(true);
    try {
      const dc = await requestPoeDeviceCode();
      setPoeDeviceCode(dc);
      Linking.openURL(POE_VERIFICATION_URL);

      const pollInterval = (dc.interval || 5) * 1000;
      const deadline = Date.now() + dc.expires_in * 1000;

      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, pollInterval));
        const tokenResult = await pollPoeToken(dc.device_code);
        if (!tokenResult) continue;

        await savePoeTokens(tokenResult);
        await updateUserProfile({ poeConnected: true });
        setPoeConnected(true);
        setPoeDeviceCode(null);
        setPoeConnecting(false);
        refreshProfile();
        Alert.alert('Connected', 'Poe is now linked to Guru.');
        return;
      }
      throw new Error('Device code expired. Please try again.');
    } catch (err: any) {
      Alert.alert('Connection failed', err.message ?? 'Unknown error');
      setPoeDeviceCode(null);
      setPoeConnecting(false);
    }
  }

  async function disconnectPoe() {
    Alert.alert('Disconnect Poe?', 'This will remove stored tokens.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          await clearPoeTokens();
          await updateUserProfile({ poeConnected: false });
          setPoeConnected(false);
          refreshProfile();
        },
      },
    ]);
  }

  async function connectQwen() {
    setQwenConnecting(true);
    setQwenDeviceCode(null);
    try {
      const dc = await requestQwenDeviceCode();
      setQwenDeviceCode(dc);
      // Open browser automatically
      await Linking.openURL(dc.verification_uri_complete || dc.verification_uri);
      // Poll for token
      const result = await pollQwenToken(
        dc.device_code,
        dc.code_verifier,
        dc.interval,
        dc.expires_in,
        () => {},
      );
      if (result.access_token) {
        const expiresAt = Date.now() + (result.expires_in || 3600) * 1000;
        await saveQwenTokens({
          accessToken: result.access_token,
          refreshToken: result.refresh_token,
          expiresAt,
          apiKey: result.api_key,
          resourceUrl: result.resource_url,
        });
        await updateUserProfile({ qwenConnected: true });
        setQwenConnected(true);
        setQwenDeviceCode(null);
        refreshProfile();
        Alert.alert('Connected', 'Qwen OAuth is now active. Free tier: 1,000 requests/day.');
      }
    } catch (err: any) {
      Alert.alert('Connection failed', err.message ?? 'Unknown error');
      setQwenDeviceCode(null);
      setQwenConnecting(false);
    }
  }

  async function disconnectQwen() {
    Alert.alert('Disconnect Qwen?', 'This will remove stored tokens.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          await clearQwenTokens();
          await updateUserProfile({ qwenConnected: false });
          setQwenConnected(false);
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

  async function testGoogleCustomSearchKey() {
    const key = googleCustomSearchApiKey.trim() || profile?.googleCustomSearchApiKey || '';
    if (!key) {
      Alert.alert('No key', 'Enter a Google Custom Search API key first.');
      return;
    }
    setTestingGoogleCustomSearchKey(true);
    setGoogleCustomSearchKeyTestResult(null);
    // Test by making a simple image search request
    try {
      const cx = '5085c21a1fd974c13';
      const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(key)}&cx=${cx}&q=test&searchType=image&num=1`;
      const res = await fetch(url);
      if (res.ok) {
        setGoogleCustomSearchKeyTestResult('ok');
        markProviderValidated('google', key);
      } else {
        setGoogleCustomSearchKeyTestResult('fail');
        clearProviderValidated('google');
      }
    } catch {
      setGoogleCustomSearchKeyTestResult('fail');
      clearProviderValidated('google');
    }
    setTestingGoogleCustomSearchKey(false);
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
        disabledProviders: currentProfile.disabledProviders ?? [],
        openrouterKey: currentProfile.openrouterKey ?? '',
        geminiKey: currentProfile.geminiKey ?? '',
        deepgramApiKey: (currentProfile as any).deepgramApiKey ?? '',
        cloudflareAccountId: currentProfile.cloudflareAccountId ?? '',
        cloudflareApiToken: currentProfile.cloudflareApiToken ?? '',
        falApiKey: currentProfile.falApiKey ?? '',
        braveSearchApiKey: currentProfile.braveSearchApiKey ?? '',
        apiValidation: sanitizeApiValidationState(currentProfile.apiValidation),
        chatgptAccounts: sanitizeChatGptAccountSettings(currentProfile.chatgptAccounts),
        guruChatDefaultModel: currentProfile.guruChatDefaultModel ?? 'auto',
        githubCopilotConnected: !!currentProfile.githubCopilotConnected,
        githubCopilotPreferredModel: currentProfile.githubCopilotPreferredModel ?? '',
        gitlabDuoConnected: !!currentProfile.gitlabDuoConnected,
        gitlabDuoPreferredModel: currentProfile.gitlabDuoPreferredModel ?? '',
        gitlabOauthClientId: currentProfile.gitlabOauthClientId ?? '',
        poeConnected: !!currentProfile.poeConnected,
        gdriveWebClientId: currentProfile.gdriveWebClientId ?? '',
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
        homeNoveltyCooldownHours: currentProfile.homeNoveltyCooldownHours ?? 6,
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
      setDisabledProviders(new Set(profile.disabledProviders ?? []));
      // Auto-inject 'qwen' into provider order if missing (new provider)
      setProviderOrder((prev) => {
        if (prev.includes('qwen')) return prev;
        const next = [...prev];
        const groqIdx = next.indexOf('groq');
        const insertIdx = groqIdx >= 0 ? groqIdx + 1 : Math.max(0, next.indexOf('agentrouter'));
        next.splice(insertIdx, 0, 'qwen');
        return sanitizeProviderOrder(next);
      });
      setOrKey(profile.openrouterKey ?? '');
      setGeminiKey(profile.geminiKey ?? '');
      setCfAccountId(profile.cloudflareAccountId ?? '');
      setCfApiToken(profile.cloudflareApiToken ?? '');
      setFalApiKey(profile.falApiKey ?? '');
      setBraveSearchApiKey(profile.braveSearchApiKey ?? '');
      setGoogleCustomSearchApiKey(profile.googleCustomSearchApiKey ?? '');
      setApiValidation(sanitizeApiValidationState((profile as UserProfile).apiValidation));
      setGuruChatDefaultModel(profile.guruChatDefaultModel ?? 'auto');
      setImageGenerationModel(profile.imageGenerationModel ?? DEFAULT_IMAGE_GENERATION_MODEL);
      setGuruMemoryNotes(profile.guruMemoryNotes ?? '');
      setPreferGeminiStructuredJson(profile.preferGeminiStructuredJson !== false);
      setHuggingFaceToken(profile.huggingFaceToken ?? '');
      setHuggingFaceModel(profile.huggingFaceTranscriptionModel ?? DEFAULT_HF_TRANSCRIPTION_MODEL);
      setDeepgramApiKey((profile as any).deepgramApiKey ?? '');
      setChatgptAccounts(
        sanitizeChatGptAccountSettings(
          profile.chatgptAccounts ??
            (profile.chatgptConnected
              ? {
                  primary: { enabled: true, connected: true },
                  secondary: { enabled: false, connected: false },
                }
              : undefined),
        ),
      );
      setGithubCopilotConnected(!!profile.githubCopilotConnected);
      setGithubCopilotPreferredModel(
        sanitizeGithubCopilotPreferredModel(profile.githubCopilotPreferredModel ?? ''),
      );
      setGitlabDuoPreferredModel(
        sanitizeGitlabDuoPreferredModel(profile.gitlabDuoPreferredModel ?? ''),
      );
      setGitlabDuoConnected(!!profile.gitlabDuoConnected);
      setGitlabOauthClientId(profile.gitlabOauthClientId ?? '');
      setPoeConnected(!!profile.poeConnected);
      setQwenConnected(!!profile.qwenConnected);
      setGdriveWebClientId(profile.gdriveWebClientId ?? '');
      setTranscriptionProvider(profile.transcriptionProvider ?? 'auto');
      setName(profile.displayName);
      setInicetDate(profile.inicetDate);
      setNeetDate(profile.neetDate);
      setDbmciClassStartDate(profile.dbmciClassStartDate ?? '');
      setBtrStartDate(profile.btrStartDate ?? '');
      setHomeNoveltyCooldownHours((profile.homeNoveltyCooldownHours ?? 6).toString());
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
      setAutoBackupFrequency((profile as any).autoBackupFrequency ?? 'off');
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
        disabledProviders: [...disabledProviders],
        openrouterKey: orKey.trim(),
        geminiKey: geminiKey.trim(),
        cloudflareAccountId: cfAccountId.trim(),
        cloudflareApiToken: cfApiToken.trim(),
        falApiKey: falApiKey.trim(),
        braveSearchApiKey: braveSearchApiKey.trim(),
        googleCustomSearchApiKey: googleCustomSearchApiKey.trim(),
        apiValidation: sanitizeApiValidationState(apiValidation),
        chatgptAccounts: sanitizeChatGptAccountSettings(chatgptAccounts),
        chatgptConnected: isChatGptEnabled(chatgptAccounts),
        githubCopilotPreferredModel: sanitizeGithubCopilotPreferredModel(
          githubCopilotPreferredModel,
        ),
        gitlabDuoPreferredModel: sanitizeGitlabDuoPreferredModel(gitlabDuoPreferredModel),
        gitlabOauthClientId: gitlabOauthClientId.trim(),
        gdriveWebClientId: gdriveWebClientId.trim(),
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
        dbmciClassStartDate: dbmciClassStartDate.trim() || null,
        btrStartDate: btrStartDate.trim() || null,
        homeNoveltyCooldownHours: Math.min(
          24,
          Math.max(1, parseInt(homeNoveltyCooldownHours, 10) || 6),
        ),
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
        autoBackupFrequency,
      } as any);
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
    disabledProviders,
    orKey,
    geminiKey,
    cfAccountId,
    cfApiToken,
    falApiKey,
    braveSearchApiKey,
    googleCustomSearchApiKey,
    guruChatDefaultModel,
    imageGenerationModel,
    guruMemoryNotes,
    preferGeminiStructuredJson,
    chatgptAccounts,
    githubCopilotPreferredModel,
    gitlabDuoPreferredModel,
    gitlabOauthClientId,
    gdriveWebClientId,
    huggingFaceToken,
    huggingFaceModel,
    deepgramApiKey,
    apiValidation,
    transcriptionProvider,
    name,
    inicetDate,
    neetDate,
    dbmciClassStartDate,
    btrStartDate,
    homeNoveltyCooldownHours,
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
    autoBackupFrequency,
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

  const moveProvider = useCallback(
    (fromIndex: number, toIndex: number) => {
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
        const sanitized = sanitizeProviderOrder(next);
        void updateUserProfile({ providerOrder: sanitized })
          .then(() => refreshProfile())
          .catch((err) => {
            if (__DEV__) console.warn('[Settings] Failed to save provider order:', err);
          });
        return sanitized;
      });
    },
    [refreshProfile],
  );

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
    `${cfAccountId.trim() || profile?.cloudflareAccountId || ''}:${
      cfApiToken.trim() || profile?.cloudflareApiToken || ''
    }`,
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
  const googleValidationStatus = resolveValidationStatus(
    'google',
    googleCustomSearchKeyTestResult,
    googleCustomSearchApiKey.trim() || profile?.googleCustomSearchApiKey || '',
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
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
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

          <LinearText style={styles.categoryLabel}>AI & PROVIDERS</LinearText>
          <SectionToggle
            id="ai_config"
            title="AI Configuration"
            icon="hardware-chip-outline"
            tint="#6C63FF"
          >
            {/* ── Chat Model ─────────────────────────────── */}
            <SubSectionToggle id="ai_chat_model" title="CHAT MODEL">
              <LinearText style={styles.hint}>
                Default model for Guru Chat (changeable per session).
              </LinearText>
              <View style={styles.liveModelsRefreshRow}>
                <TouchableOpacity
                  style={[styles.testBtn, { marginBottom: 0, flexShrink: 1 }]}
                  onPress={liveGuruChatModels.refresh}
                  disabled={liveGuruChatModels.loading}
                  activeOpacity={0.8}
                >
                  <LinearText style={styles.testBtnText}>
                    {liveGuruChatModels.loading
                      ? 'Loading live models…'
                      : 'Refresh live model lists'}
                  </LinearText>
                </TouchableOpacity>
                {liveGuruChatModels.loading && (
                  <ActivityIndicator size="small" color={n.colors.accent} />
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
                  ...liveGuruChatModels.githubCopilot.map((m) => ({
                    id: `github_copilot/${m}`,
                    label: formatGuruChatModelChipLabel(`github_copilot/${m}`),
                    group: 'GitHub Copilot',
                  })),
                  ...liveGuruChatModels.gitlabDuo.map((m) => ({
                    id: `gitlab_duo/${m}`,
                    label: formatGuruChatModelChipLabel(`gitlab_duo/${m}`),
                    group: 'GitLab Duo',
                  })),
                  ...liveGuruChatModels.poe.map((m) => ({
                    id: `poe/${m}`,
                    label: formatGuruChatModelChipLabel(`poe/${m}`),
                    group: 'Poe',
                  })),
                  ...(qwenConnected
                    ? [
                        {
                          id: 'qwen/qwen3-coder-plus',
                          label: 'Qwen Coder Plus',
                          group: 'Qwen (Free)',
                        },
                      ]
                    : []),
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
              <LinearText style={styles.hint}>
                Persistent notes Guru uses in every chat. Session memory is built automatically.
              </LinearText>
              <TextInput
                style={[styles.input, styles.guruMemoryInput]}
                placeholder="e.g. INICET May 2026 · weak in renal · prefers concise answers"
                placeholderTextColor={n.colors.textMuted}
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
              <LinearText style={styles.hint}>
                Connect your ChatGPT Plus/Pro subscription through the Codex flow. Guru follows the
                Codex models page and currently starts with GPT-5.4, then GPT-5.4-mini, before older
                Codex alternatives.
              </LinearText>
              <LinearText style={styles.hint}>
                Primary is tried first. Secondary is only tried if primary fails before producing a
                response. Disable either slot here to skip it entirely.
              </LinearText>
              {chatgptConnectingSlot && chatgptDeviceCode ? (
                <View style={{ marginTop: 8 }}>
                  <LinearText style={[styles.label, { textAlign: 'center', marginBottom: 4 }]}>
                    Enter this code at openai.com:
                  </LinearText>
                  <LinearText
                    style={{
                      fontSize: 28,
                      fontWeight: '700',
                      textAlign: 'center',
                      color: n.colors.accent,
                      letterSpacing: 4,
                      marginVertical: 8,
                      fontFamily: 'Inter_400Regular',
                    }}
                    selectable
                  >
                    {chatgptDeviceCode.user_code}
                  </LinearText>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: 8,
                      marginTop: 4,
                    }}
                  >
                    <ActivityIndicator size="small" color={n.colors.accent} />
                    <LinearText style={[styles.hint, { marginTop: 0 }]}>
                      Waiting for authorization for the{' '}
                      {chatgptConnectingSlot === 'primary' ? 'primary' : 'secondary'} account...
                    </LinearText>
                  </View>
                  <TouchableOpacity
                    style={{ marginTop: 12, alignSelf: 'center' }}
                    onPress={() => Linking.openURL(VERIFICATION_URL)}
                    activeOpacity={0.7}
                  >
                    <LinearText
                      style={{
                        color: n.colors.accent,
                        textDecorationLine: 'underline',
                        fontSize: 13,
                      }}
                    >
                      Open login page again
                    </LinearText>
                  </TouchableOpacity>
                </View>
              ) : null}
              {(['primary', 'secondary'] as ChatGptAccountSlot[]).map((slot) => {
                const slotState = chatgptAccounts[slot];
                const isPrimary = slot === 'primary';
                const isConnecting = chatgptConnectingSlot === slot;
                return (
                  <View
                    key={slot}
                    style={{
                      marginTop: 12,
                      padding: 12,
                      borderWidth: 1,
                      borderColor: n.colors.border,
                      borderRadius: 12,
                      backgroundColor: n.colors.background,
                    }}
                  >
                    <View style={styles.switchRow}>
                      <View style={{ flex: 1, paddingRight: 12 }}>
                        <LinearText style={styles.switchLabel}>
                          {isPrimary ? 'Primary account' : 'Secondary account'}
                        </LinearText>
                        <LinearText style={styles.hint}>
                          {isPrimary
                            ? 'Tried first whenever ChatGPT is selected in routing.'
                            : 'Backup account used only if primary fails early.'}
                        </LinearText>
                      </View>
                      <Switch
                        value={slotState.enabled}
                        onValueChange={(value) =>
                          setChatgptAccounts((prev) => ({
                            ...prev,
                            [slot]: { ...prev[slot], enabled: value },
                          }))
                        }
                        trackColor={{
                          false: n.colors.border,
                          true: n.colors.borderHighlight,
                        }}
                        thumbColor={slotState.enabled ? n.colors.accent : n.colors.textMuted}
                      />
                    </View>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        marginTop: 8,
                      }}
                    >
                      <Ionicons
                        name={slotState.connected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={20}
                        color={slotState.connected ? n.colors.success : n.colors.textMuted}
                      />
                      <LinearText
                        style={[
                          styles.label,
                          {
                            flex: 1,
                            color: slotState.connected ? n.colors.success : n.colors.textMuted,
                          },
                        ]}
                      >
                        {slotState.connected ? 'Connected' : 'Not connected'}
                      </LinearText>
                      {slotState.connected ? (
                        <TouchableOpacity
                          style={[
                            styles.validateBtn,
                            { backgroundColor: n.colors.error + '22', paddingHorizontal: 16 },
                          ]}
                          onPress={() => disconnectChatGpt(slot)}
                          activeOpacity={0.8}
                        >
                          <LinearText
                            style={{ color: n.colors.error, fontWeight: '600', fontSize: 13 }}
                          >
                            Disconnect
                          </LinearText>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={[
                            styles.validateBtn,
                            {
                              paddingHorizontal: 16,
                              backgroundColor: n.colors.accent + '22',
                            },
                          ]}
                          onPress={() => connectChatGpt(slot)}
                          disabled={chatgptConnectingSlot !== null}
                          activeOpacity={0.8}
                        >
                          {isConnecting ? (
                            <ActivityIndicator size="small" color={n.colors.accent} />
                          ) : (
                            <LinearText
                              style={{
                                color: n.colors.accent,
                                fontWeight: '600',
                                fontSize: 13,
                              }}
                            >
                              Connect
                            </LinearText>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                    {!slotState.enabled && slotState.connected ? (
                      <LinearText style={[styles.hint, { marginTop: 8 }]}>
                        Disabled. This connected account will be skipped by routing until
                        re-enabled.
                      </LinearText>
                    ) : null}
                  </View>
                );
              })}
              {!isChatGptEnabled(chatgptAccounts) ? (
                <LinearText style={[styles.hint, { marginTop: 10 }]}>
                  ChatGPT is currently excluded from provider routing.
                </LinearText>
              ) : null}
            </SubSectionToggle>

            {/* ── GitHub Copilot OAuth ─────────────────────────────── */}
            <View style={styles.subSectionDivider} />
            <SubSectionToggle id="github_copilot_oauth" title="GITHUB COPILOT (OAUTH)">
              <LinearText style={styles.hint}>
                Connect your GitHub Copilot subscription through device code flow. Supports Copilot
                Pro, Pro+, Business, and Enterprise.
              </LinearText>
              {githubCopilotConnecting && githubCopilotDeviceCode ? (
                <View style={{ marginTop: 8 }}>
                  <LinearText style={[styles.label, { textAlign: 'center', marginBottom: 4 }]}>
                    Enter this code at github.com:
                  </LinearText>
                  <LinearText
                    style={{
                      fontSize: 28,
                      fontWeight: '700',
                      textAlign: 'center',
                      color: n.colors.accent,
                      letterSpacing: 4,
                      marginVertical: 8,
                      fontFamily: 'Inter_400Regular',
                    }}
                    selectable
                  >
                    {githubCopilotDeviceCode.user_code}
                  </LinearText>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: 8,
                      marginTop: 4,
                    }}
                  >
                    <ActivityIndicator size="small" color={n.colors.accent} />
                    <LinearText style={[styles.hint, { marginTop: 0 }]}>
                      Waiting for authorization...
                    </LinearText>
                  </View>
                  <TouchableOpacity
                    style={{ marginTop: 12, alignSelf: 'center' }}
                    onPress={() => Linking.openURL(GITHUB_VERIFICATION_URL)}
                    activeOpacity={0.7}
                  >
                    <LinearText
                      style={{
                        color: n.colors.accent,
                        textDecorationLine: 'underline',
                        fontSize: 13,
                      }}
                    >
                      Open login page again
                    </LinearText>
                  </TouchableOpacity>
                </View>
              ) : null}
              <View
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: n.colors.border,
                  borderRadius: 12,
                  backgroundColor: n.colors.background,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <Ionicons
                    name={githubCopilotConnected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={githubCopilotConnected ? n.colors.success : n.colors.textMuted}
                  />
                  <LinearText
                    style={[
                      styles.label,
                      {
                        flex: 1,
                        color: githubCopilotConnected ? n.colors.success : n.colors.textMuted,
                      },
                    ]}
                  >
                    {githubCopilotConnected ? 'Connected' : 'Not connected'}
                  </LinearText>
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: 8,
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <TouchableOpacity
                      style={[
                        styles.validateBtn,
                        githubCopilotOAuthTestResult === 'ok' && styles.validateBtnOk,
                        githubCopilotOAuthTestResult === 'fail' && styles.validateBtnFail,
                        { paddingHorizontal: 10 },
                      ]}
                      onPress={() => void validateGitHubCopilotConnection()}
                      disabled={testingGitHubCopilotOAuth || githubCopilotConnecting}
                      activeOpacity={0.8}
                      accessibilityLabel="Validate GitHub Copilot connection"
                    >
                      {testingGitHubCopilotOAuth ? (
                        <ActivityIndicator size="small" color={n.colors.accent} />
                      ) : (
                        <Ionicons
                          name={
                            githubCopilotOAuthTestResult === 'ok'
                              ? 'checkmark-circle'
                              : githubCopilotOAuthTestResult === 'fail'
                                ? 'close-circle'
                                : 'pulse-outline'
                          }
                          size={20}
                          color={
                            githubCopilotOAuthTestResult === 'ok'
                              ? n.colors.success
                              : githubCopilotOAuthTestResult === 'fail'
                                ? n.colors.error
                                : n.colors.accent
                          }
                        />
                      )}
                    </TouchableOpacity>
                    {githubCopilotConnected ? (
                      <TouchableOpacity
                        style={[
                          styles.validateBtn,
                          { backgroundColor: n.colors.error + '22', paddingHorizontal: 16 },
                        ]}
                        onPress={disconnectGitHubCopilot}
                        activeOpacity={0.8}
                      >
                        <LinearText
                          style={{ color: n.colors.error, fontWeight: '600', fontSize: 13 }}
                        >
                          Disconnect
                        </LinearText>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[
                          styles.validateBtn,
                          { paddingHorizontal: 16, backgroundColor: n.colors.accent + '22' },
                        ]}
                        onPress={connectGitHubCopilot}
                        disabled={githubCopilotConnecting}
                        activeOpacity={0.8}
                      >
                        {githubCopilotConnecting ? (
                          <ActivityIndicator size="small" color={n.colors.accent} />
                        ) : (
                          <LinearText
                            style={{ color: n.colors.accent, fontWeight: '600', fontSize: 13 }}
                          >
                            Connect
                          </LinearText>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
              <LinearText style={[styles.hint, { marginTop: 8 }]}>
                Validate (pulse icon): checks SecureStore token + a minimal Copilot API call. Full
                trace in Metro:{' '}
                <LinearText style={{ fontFamily: 'Inter_400Regular' }}>
                  [SETTINGS_VALIDATE][github_copilot]
                </LinearText>
              </LinearText>
              {githubCopilotConnected ? (
                <>
                  <LinearText style={[styles.hint, { marginTop: 12 }]}>
                    When Auto routing reaches GitHub Copilot, Guru tries this model first. If it
                    fails, other catalog models are tried in order.
                  </LinearText>
                  <ModelDropdown
                    label="Preferred Copilot model"
                    value={githubCopilotPreferredModel}
                    onSelect={setGithubCopilotPreferredModel}
                    options={[
                      {
                        id: '',
                        label: 'Default (catalog order)',
                        group: 'GitHub Copilot',
                      },
                      ...GITHUB_COPILOT_MODELS.map((m) => ({
                        id: m,
                        label: m,
                        group: 'GitHub Copilot',
                      })),
                    ]}
                  />
                </>
              ) : null}
            </SubSectionToggle>

            {/* ── GitLab Duo OAuth ─────────────────────────────── */}
            <View style={styles.subSectionDivider} />
            <SubSectionToggle id="gitlab_duo_oauth" title="GITLAB DUO (OAUTH)">
              <LinearText style={styles.hint}>
                OAuth2 + PKCE against your GitLab instance. Add this redirect URI to your GitLab
                OAuth application: {getRedirectUri()}
              </LinearText>
              <LinearText style={[styles.label, { marginTop: 12 }]}>Application ID</LinearText>
              <LinearText style={styles.hint}>
                Paste from GitLab → Preferences → Applications. Overrides
                EXPO_PUBLIC_GITLAB_CLIENT_ID when set. Scopes: read_user, ai_features.
              </LinearText>
              <TextInput
                value={gitlabOauthClientId}
                onChangeText={setGitlabOauthClientId}
                placeholder="Your GitLab OAuth Application ID"
                placeholderTextColor={n.colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!gitlabDuoConnecting}
                style={{
                  marginTop: 8,
                  borderWidth: 1,
                  borderColor: n.colors.border,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: n.colors.textPrimary,
                  fontSize: 15,
                }}
              />
              <LinearText style={[styles.label, { marginTop: 12 }]}>Application secret</LinearText>
              <LinearText style={styles.hint}>
                Confidential apps (default on GitLab.com) require this on token exchange — paste
                from the same Applications page. Stored only in on-device secure storage, not in
                backups. Leave empty only if you created a non-confidential (public) OAuth app.
              </LinearText>
              <TextInput
                value={gitlabOauthClientSecret}
                onChangeText={setGitlabOauthClientSecret}
                placeholder="OAuth application secret"
                placeholderTextColor={n.colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                editable={!gitlabDuoConnecting}
                style={{
                  marginTop: 8,
                  borderWidth: 1,
                  borderColor: n.colors.border,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: n.colors.textPrimary,
                  fontSize: 15,
                }}
              />
              <View
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: n.colors.border,
                  borderRadius: 12,
                  backgroundColor: n.colors.background,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <Ionicons
                    name={gitlabDuoConnected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={gitlabDuoConnected ? n.colors.success : n.colors.textMuted}
                  />
                  <LinearText
                    style={[
                      styles.label,
                      {
                        flex: 1,
                        color: gitlabDuoConnected ? n.colors.success : n.colors.textMuted,
                      },
                    ]}
                  >
                    {gitlabDuoConnected ? 'Connected' : 'Not connected'}
                  </LinearText>
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: 8,
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <TouchableOpacity
                      style={[
                        styles.validateBtn,
                        gitlabDuoOAuthTestResult === 'ok' && styles.validateBtnOk,
                        gitlabDuoOAuthTestResult === 'fail' && styles.validateBtnFail,
                        { paddingHorizontal: 10 },
                      ]}
                      onPress={() => void validateGitLabDuoConnection()}
                      disabled={testingGitLabDuoOAuth || gitlabDuoConnecting}
                      activeOpacity={0.8}
                      accessibilityLabel="Validate GitLab Duo connection"
                    >
                      {testingGitLabDuoOAuth ? (
                        <ActivityIndicator size="small" color={n.colors.accent} />
                      ) : (
                        <Ionicons
                          name={
                            gitlabDuoOAuthTestResult === 'ok'
                              ? 'checkmark-circle'
                              : gitlabDuoOAuthTestResult === 'fail'
                                ? 'close-circle'
                                : 'pulse-outline'
                          }
                          size={20}
                          color={
                            gitlabDuoOAuthTestResult === 'ok'
                              ? n.colors.success
                              : gitlabDuoOAuthTestResult === 'fail'
                                ? n.colors.error
                                : n.colors.accent
                          }
                        />
                      )}
                    </TouchableOpacity>
                    {gitlabDuoConnected ? (
                      <TouchableOpacity
                        style={[
                          styles.validateBtn,
                          { backgroundColor: n.colors.error + '22', paddingHorizontal: 16 },
                        ]}
                        onPress={disconnectGitLabDuo}
                        activeOpacity={0.8}
                      >
                        <LinearText
                          style={{ color: n.colors.error, fontWeight: '600', fontSize: 13 }}
                        >
                          Disconnect
                        </LinearText>
                      </TouchableOpacity>
                    ) : (
                      <>
                        <TouchableOpacity
                          style={[
                            styles.validateBtn,
                            { paddingHorizontal: 12, backgroundColor: n.colors.accent + '22' },
                          ]}
                          onPress={connectGitLabDuo}
                          disabled={gitlabDuoConnecting}
                          activeOpacity={0.8}
                        >
                          {gitlabDuoConnecting ? (
                            <ActivityIndicator size="small" color={n.colors.accent} />
                          ) : (
                            <LinearText
                              style={{
                                color: n.colors.accent,
                                fontWeight: '600',
                                fontSize: 13,
                              }}
                            >
                              Connect
                            </LinearText>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.validateBtn,
                            { paddingHorizontal: 12, backgroundColor: n.colors.border + '44' },
                          ]}
                          onPress={() => setGitlabPasteModalVisible(true)}
                          disabled={gitlabDuoConnecting}
                          activeOpacity={0.8}
                        >
                          <LinearText
                            style={{
                              color: n.colors.textPrimary,
                              fontWeight: '600',
                              fontSize: 13,
                            }}
                          >
                            Paste URL
                          </LinearText>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              </View>
              <LinearText style={[styles.hint, { marginTop: 8 }]}>
                Validate (pulse icon): checks OAuth token +{' '}
                <LinearText style={{ fontFamily: 'Inter_400Regular' }}>
                  POST {getGitLabInstanceUrl()}/api/v4/chat/completions
                </LinearText>
                . Metro:{' '}
                <LinearText style={{ fontFamily: 'Inter_400Regular' }}>
                  [SETTINGS_VALIDATE][gitlab_duo]
                </LinearText>
              </LinearText>
              <LinearText style={[styles.hint, { marginTop: 12 }]}>
                Default GitLab Duo model for Auto routing. If unavailable, Guru automatically tries
                the next best model in catalog order.
              </LinearText>
              <ModelDropdown
                label="Default GitLab Duo model"
                value={gitlabDuoPreferredModel}
                onSelect={setGitlabDuoPreferredModel}
                options={[
                  {
                    id: '',
                    label: 'Default (catalog order)',
                    group: 'GitLab Duo',
                  },
                  ...GITLAB_DUO_MODELS.map((m) => ({
                    id: m,
                    label: m,
                    group: 'GitLab Duo',
                  })),
                ]}
              />
              <Modal
                visible={gitlabPasteModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setGitlabPasteModalVisible(false)}
              >
                <KeyboardAvoidingView
                  behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                  style={{ flex: 1 }}
                >
                  <Pressable
                    style={styles.dropdownBackdrop}
                    onPress={() => setGitlabPasteModalVisible(false)}
                  >
                    <LinearSurface
                      padded={false}
                      style={[styles.dropdownSheet, { minWidth: '88%' }]}
                    >
                      <Pressable onPress={(e) => e.stopPropagation()}>
                        <LinearText style={styles.dropdownSheetTitle}>
                          Paste GitLab callback URL
                        </LinearText>
                        <LinearText style={[styles.hint, { marginBottom: 8 }]}>
                          After authorizing, paste the full guru-study://oauth/gitlab?... link (same
                          device after tapping Connect).
                        </LinearText>
                        <TextInput
                          value={gitlabPasteUrl}
                          onChangeText={setGitlabPasteUrl}
                          placeholder="guru-study://oauth/gitlab?code=..."
                          placeholderTextColor={n.colors.textMuted}
                          autoCapitalize="none"
                          autoCorrect={false}
                          multiline
                          style={{
                            borderWidth: 1,
                            borderColor: n.colors.border,
                            borderRadius: 10,
                            padding: 12,
                            color: n.colors.textPrimary,
                            minHeight: 88,
                            textAlignVertical: 'top',
                          }}
                        />
                        <View
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'flex-end',
                            gap: 12,
                            marginTop: 16,
                          }}
                        >
                          <TouchableOpacity
                            onPress={() => setGitlabPasteModalVisible(false)}
                            style={{ paddingVertical: 10, paddingHorizontal: 14 }}
                          >
                            <LinearText style={{ color: n.colors.textMuted, fontWeight: '600' }}>
                              Cancel
                            </LinearText>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => void submitGitLabPasteUrl()}
                            disabled={gitlabPasteSubmitting}
                            style={{
                              paddingVertical: 10,
                              paddingHorizontal: 16,
                              backgroundColor: n.colors.accent + '33',
                              borderRadius: 10,
                            }}
                          >
                            {gitlabPasteSubmitting ? (
                              <ActivityIndicator size="small" color={n.colors.accent} />
                            ) : (
                              <LinearText style={{ color: n.colors.accent, fontWeight: '700' }}>
                                Apply
                              </LinearText>
                            )}
                          </TouchableOpacity>
                        </View>
                      </Pressable>
                    </LinearSurface>
                  </Pressable>
                </KeyboardAvoidingView>
              </Modal>
            </SubSectionToggle>

            {/* ── Poe OAuth ─────────────────────────────── */}
            <View style={styles.subSectionDivider} />
            <SubSectionToggle id="poe_oauth" title="POE (OAUTH)">
              <LinearText style={styles.hint}>
                Connect your Poe subscription through device code flow. Access Claude, GPT-4o,
                Gemini and more through Poe's API.
              </LinearText>
              {poeConnecting && poeDeviceCode ? (
                <View style={{ marginTop: 8 }}>
                  <LinearText style={[styles.label, { textAlign: 'center', marginBottom: 4 }]}>
                    Enter this code at poe.com:
                  </LinearText>
                  <LinearText
                    style={{
                      fontSize: 28,
                      fontWeight: '700',
                      textAlign: 'center',
                      color: n.colors.accent,
                      letterSpacing: 4,
                      marginVertical: 8,
                      fontFamily: 'Inter_400Regular',
                    }}
                    selectable
                  >
                    {poeDeviceCode.user_code}
                  </LinearText>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: 8,
                      marginTop: 4,
                    }}
                  >
                    <ActivityIndicator size="small" color={n.colors.accent} />
                    <LinearText style={[styles.hint, { marginTop: 0 }]}>
                      Waiting for authorization...
                    </LinearText>
                  </View>
                  <TouchableOpacity
                    style={{ marginTop: 12, alignSelf: 'center' }}
                    onPress={() => Linking.openURL(POE_VERIFICATION_URL)}
                    activeOpacity={0.7}
                  >
                    <LinearText
                      style={{
                        color: n.colors.accent,
                        textDecorationLine: 'underline',
                        fontSize: 13,
                      }}
                    >
                      Open login page again
                    </LinearText>
                  </TouchableOpacity>
                </View>
              ) : null}
              <View
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: n.colors.border,
                  borderRadius: 12,
                  backgroundColor: n.colors.background,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <Ionicons
                    name={poeConnected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={poeConnected ? n.colors.success : n.colors.textMuted}
                  />
                  <LinearText
                    style={[
                      styles.label,
                      {
                        flex: 1,
                        color: poeConnected ? n.colors.success : n.colors.textMuted,
                      },
                    ]}
                  >
                    {poeConnected ? 'Connected' : 'Not connected'}
                  </LinearText>
                  {poeConnected ? (
                    <TouchableOpacity
                      style={[
                        styles.validateBtn,
                        { backgroundColor: n.colors.error + '22', paddingHorizontal: 16 },
                      ]}
                      onPress={disconnectPoe}
                      activeOpacity={0.8}
                    >
                      <LinearText
                        style={{ color: n.colors.error, fontWeight: '600', fontSize: 13 }}
                      >
                        Disconnect
                      </LinearText>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.validateBtn,
                        { paddingHorizontal: 16, backgroundColor: n.colors.accent + '22' },
                      ]}
                      onPress={connectPoe}
                      disabled={poeConnecting}
                      activeOpacity={0.8}
                    >
                      {poeConnecting ? (
                        <ActivityIndicator size="small" color={n.colors.accent} />
                      ) : (
                        <LinearText
                          style={{ color: n.colors.accent, fontWeight: '600', fontSize: 13 }}
                        >
                          Connect
                        </LinearText>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </SubSectionToggle>

            {/* ── Qwen OAuth ─────────────────────────────── */}
            <View style={styles.subSectionDivider} />
            <SubSectionToggle id="qwen_oauth" title="QWEN (FREE OAUTH)">
              <LinearText style={styles.hint}>
                Connect your Qwen.ai account for free access to qwen-coder-plus, qwen-coder-flash,
                and qwen-vl-plus. 1,000 requests/day, 60 req/min. No API key needed.
              </LinearText>
              {qwenConnecting && qwenDeviceCode ? (
                <View style={{ marginTop: 8 }}>
                  <LinearText style={[styles.label, { textAlign: 'center', marginBottom: 4 }]}>
                    Enter this code at chat.qwen.ai:
                  </LinearText>
                  <LinearText
                    style={{
                      fontSize: 28,
                      fontWeight: '700',
                      textAlign: 'center',
                      color: n.colors.accent,
                      letterSpacing: 4,
                      marginVertical: 8,
                      fontFamily: 'Inter_400Regular',
                    }}
                    selectable
                  >
                    {qwenDeviceCode.user_code}
                  </LinearText>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: 8,
                      marginTop: 4,
                    }}
                  >
                    <ActivityIndicator size="small" color={n.colors.accent} />
                    <LinearText style={[styles.hint, { marginTop: 0 }]}>
                      Waiting for authorization...
                    </LinearText>
                  </View>
                  <TouchableOpacity
                    style={{ marginTop: 12, alignSelf: 'center' }}
                    onPress={() =>
                      Linking.openURL(
                        qwenDeviceCode.verification_uri_complete || qwenDeviceCode.verification_uri,
                      )
                    }
                    activeOpacity={0.7}
                  >
                    <LinearText
                      style={{
                        color: n.colors.accent,
                        textDecorationLine: 'underline',
                        fontSize: 13,
                      }}
                    >
                      Open login page again
                    </LinearText>
                  </TouchableOpacity>
                </View>
              ) : null}
              <View
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: n.colors.border,
                  borderRadius: 12,
                  backgroundColor: n.colors.background,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <Ionicons
                    name={qwenConnected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={qwenConnected ? n.colors.success : n.colors.textMuted}
                  />
                  <LinearText
                    style={[
                      styles.label,
                      {
                        flex: 1,
                        color: qwenConnected ? n.colors.success : n.colors.textMuted,
                      },
                    ]}
                  >
                    {qwenConnected ? 'Connected' : 'Not connected'}
                  </LinearText>
                  {qwenConnected ? (
                    <TouchableOpacity
                      style={[
                        styles.validateBtn,
                        { backgroundColor: n.colors.error + '22', paddingHorizontal: 16 },
                      ]}
                      onPress={disconnectQwen}
                      activeOpacity={0.8}
                    >
                      <LinearText
                        style={{ color: n.colors.error, fontWeight: '600', fontSize: 13 }}
                      >
                        Disconnect
                      </LinearText>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.validateBtn,
                        { paddingHorizontal: 16, backgroundColor: n.colors.accent + '22' },
                      ]}
                      onPress={connectQwen}
                      disabled={qwenConnecting}
                      activeOpacity={0.8}
                    >
                      {qwenConnecting ? (
                        <ActivityIndicator size="small" color={n.colors.accent} />
                      ) : (
                        <LinearText
                          style={{ color: n.colors.accent, fontWeight: '600', fontSize: 13 }}
                        >
                          Connect
                        </LinearText>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
                {qwenConnected && (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      marginTop: 10,
                      paddingTop: 10,
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: n.colors.border,
                    }}
                  >
                    <TouchableOpacity
                      style={[
                        styles.validateBtn,
                        qwenKeyTestResult === 'ok' && styles.validateBtnOk,
                        qwenKeyTestResult === 'fail' && styles.validateBtnFail,
                        testingQwenKey && { opacity: 0.6 },
                      ]}
                      onPress={testQwenKey}
                      disabled={testingQwenKey}
                      activeOpacity={0.8}
                    >
                      {testingQwenKey ? (
                        <ActivityIndicator size="small" color={n.colors.accent} />
                      ) : (
                        <Ionicons
                          name={
                            qwenKeyTestResult === 'ok'
                              ? 'checkmark-circle'
                              : qwenKeyTestResult === 'fail'
                                ? 'close-circle'
                                : 'cloud-outline'
                          }
                          size={20}
                          color={
                            qwenKeyTestResult === 'ok'
                              ? n.colors.success
                              : qwenKeyTestResult === 'fail'
                                ? n.colors.error
                                : n.colors.accent
                          }
                        />
                      )}
                    </TouchableOpacity>
                    <LinearText style={[styles.hint, { flex: 1 }]}>
                      {testingQwenKey
                        ? 'Validating Qwen connection...'
                        : qwenKeyTestResult === 'ok'
                          ? 'Connection OK'
                          : qwenKeyTestResult === 'fail'
                            ? 'Connection failed'
                            : 'Tap to validate connection'}
                    </LinearText>
                  </View>
                )}
              </View>
            </SubSectionToggle>

            {/* ── API Keys ─────────────────────────────── */}
            <View style={styles.subSectionDivider} />
            <SubSectionToggle id="ai_api_keys" title="API KEYS">
              <Label text="Groq" />
              <View style={styles.apiKeyRow}>
                <TextInput
                  style={[styles.input, styles.apiKeyInput]}
                  placeholder="gsk_..."
                  placeholderTextColor={n.colors.textMuted}
                  value={groqKey}
                  onChangeText={(value: string) => {
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
                    <ActivityIndicator size="small" color={n.colors.accent} />
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
                          ? n.colors.success
                          : groqValidationStatus === 'fail'
                            ? n.colors.error
                            : n.colors.accent
                      }
                    />
                  )}
                </TouchableOpacity>
              </View>
              <LinearText style={styles.hint}>
                Transcription + AI generation. Free key at console.groq.com
              </LinearText>
              <Label text="GitHub Models" />
              <View style={styles.apiKeyRow}>
                <TextInput
                  style={[styles.input, styles.apiKeyInput]}
                  placeholder="GitHub PAT (Models read)"
                  placeholderTextColor={n.colors.textMuted}
                  value={githubModelsPat}
                  onChangeText={(value: string) => {
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
                    <ActivityIndicator size="small" color={n.colors.accent} />
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
                          ? n.colors.success
                          : githubValidationStatus === 'fail'
                            ? n.colors.error
                            : n.colors.accent
                      }
                    />
                  )}
                </TouchableOpacity>
              </View>
              <LinearText style={styles.hint}>
                Fine-grained PAT with Models (read) scope at models.github.ai
              </LinearText>
              <Label text="OpenRouter" />
              <View style={styles.apiKeyRow}>
                <TextInput
                  style={[styles.input, styles.apiKeyInput]}
                  placeholder="sk-or-v1-..."
                  placeholderTextColor={n.colors.textMuted}
                  value={orKey}
                  onChangeText={(value: string) => {
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
                    <ActivityIndicator size="small" color={n.colors.accent} />
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
                          ? n.colors.success
                          : openRouterValidationStatus === 'fail'
                            ? n.colors.error
                            : n.colors.accent
                      }
                    />
                  )}
                </TouchableOpacity>
              </View>
              <LinearText style={styles.hint}>Free model fallback. Key at openrouter.ai</LinearText>
              <Label text="Kilo" />
              <View style={styles.apiKeyRow}>
                <TextInput
                  style={[styles.input, styles.apiKeyInput]}
                  placeholder="kilo_..."
                  placeholderTextColor={n.colors.textMuted}
                  value={kiloApiKey}
                  onChangeText={(value: string) => {
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
                    <ActivityIndicator size="small" color={n.colors.accent} />
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
                          ? n.colors.success
                          : kiloValidationStatus === 'fail'
                            ? n.colors.error
                            : n.colors.accent
                      }
                    />
                  )}
                </TouchableOpacity>
              </View>
              <LinearText style={styles.hint}>
                Gateway at api.kilo.ai (e.g. kilo-auto/balanced, xiaomi/mimo-v2-pro)
              </LinearText>
              <Label text="DeepSeek" />
              <View style={styles.apiKeyRow}>
                <TextInput
                  style={[styles.input, styles.apiKeyInput]}
                  placeholder="sk-..."
                  placeholderTextColor={n.colors.textMuted}
                  value={deepseekKey}
                  onChangeText={(value: string) => {
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
                    <ActivityIndicator size="small" color={n.colors.accent} />
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
                          ? n.colors.success
                          : deepseekValidationStatus === 'fail'
                            ? n.colors.error
                            : n.colors.accent
                      }
                    />
                  )}
                </TouchableOpacity>
              </View>
              <LinearText style={styles.hint}>Key at platform.deepseek.com</LinearText>
              <Label text="AgentRouter" />
              <View style={styles.apiKeyRow}>
                <TextInput
                  style={[styles.input, styles.apiKeyInput]}
                  placeholder="sk-..."
                  placeholderTextColor={n.colors.textMuted}
                  value={agentRouterKey}
                  onChangeText={(value: string) => {
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
                    <ActivityIndicator size="small" color={n.colors.accent} />
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
                          ? n.colors.success
                          : agentRouterValidationStatus === 'fail'
                            ? n.colors.error
                            : n.colors.accent
                      }
                    />
                  )}
                </TouchableOpacity>
              </View>
              <LinearText style={styles.hint}>
                Free proxy. Key at agentrouter.org/console/token
              </LinearText>
              <Label text="Google Gemini" />
              <View style={styles.apiKeyRow}>
                <TextInput
                  style={[styles.input, styles.apiKeyInput]}
                  placeholder="AIza..."
                  placeholderTextColor={n.colors.textMuted}
                  value={geminiKey}
                  onChangeText={(value: string) => {
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
                    <ActivityIndicator size="small" color={n.colors.accent} />
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
                          ? n.colors.success
                          : geminiValidationStatus === 'fail'
                            ? n.colors.error
                            : n.colors.accent
                      }
                    />
                  )}
                </TouchableOpacity>
              </View>
              <LinearText style={styles.hint}>
                Chat + image models. Key at aistudio.google.com/apikey
              </LinearText>
              <View style={styles.switchRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <LinearText style={styles.switchLabel}>Structured JSON (Gemini)</LinearText>
                  <LinearText style={styles.hint}>
                    When on, structured AI outputs (quizzes, daily plan, lecture analysis) use
                    Gemini native JSON + schema first if your Gemini key is set. Turn off to force
                    text-only parsing (for debugging).
                  </LinearText>
                </View>
                <Switch
                  value={preferGeminiStructuredJson}
                  onValueChange={setPreferGeminiStructuredJson}
                  trackColor={{ true: n.colors.accent, false: n.colors.border }}
                  thumbColor={n.colors.textPrimary}
                />
              </View>
              <Label text="Deepgram" />
              <View style={styles.apiKeyRow}>
                <TextInput
                  style={[styles.input, styles.apiKeyInput]}
                  placeholder="dg_..."
                  placeholderTextColor={n.colors.textMuted}
                  value={deepgramApiKey}
                  onChangeText={(value: string) => {
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
                    <ActivityIndicator size="small" color={n.colors.accent} />
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
                          ? n.colors.success
                          : deepgramValidationStatus === 'fail'
                            ? n.colors.error
                            : n.colors.accent
                      }
                    />
                  )}
                </TouchableOpacity>
              </View>
              <LinearText style={styles.hint}>
                Live lecture quiz sidecar. Key at console.deepgram.com
              </LinearText>
              <Label text="Cloudflare Workers AI" />
              <View style={styles.apiKeyRow}>
                <TextInput
                  style={[styles.input, styles.apiKeyInput]}
                  placeholder="Account ID (32-char hex)"
                  placeholderTextColor={n.colors.textMuted}
                  value={cfAccountId}
                  onChangeText={(value: string) => {
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
                    <ActivityIndicator size="small" color={n.colors.accent} />
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
                          ? n.colors.success
                          : cloudflareValidationStatus === 'fail'
                            ? n.colors.error
                            : n.colors.accent
                      }
                    />
                  )}
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.input}
                placeholder="API Token (Workers AI read)"
                placeholderTextColor={n.colors.textMuted}
                value={cfApiToken}
                onChangeText={(value: string) => {
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
              <LinearText style={styles.hint}>
                Chat, images, and Whisper transcription via Cloudflare
              </LinearText>
            </SubSectionToggle>

            {/* ── Routing ─────────────────────────────── */}
            <View style={styles.subSectionDivider} />
            <SubSectionToggle id="ai_routing" title="PROVIDER ROUTING">
              <LinearText style={styles.hint}>
                Reorder fallback priority. First available provider is used.
              </LinearText>
              {providerOrder.map((id, index) => {
                const hasKey = (() => {
                  switch (id) {
                    case 'chatgpt':
                      return isChatGptEnabled(chatgptAccounts) || !!profile?.chatgptConnected;
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
                    case 'qwen':
                      return !!profile?.qwenConnected || qwenConnected;
                    case 'github_copilot':
                      return !!profile?.githubCopilotConnected;
                    case 'gitlab_duo':
                      return !!profile?.gitlabDuoConnected;
                    case 'poe':
                      return !!profile?.poeConnected;
                    default:
                      return false;
                  }
                })();
                const isDisabled = disabledProviders.has(id);
                return (
                  <LinearSurface
                    padded={false}
                    key={id}
                    style={[styles.providerRow, (!hasKey || isDisabled) && { opacity: 0.45 }]}
                  >
                    <Pressable
                      onPress={() => {
                        setDisabledProviders((prev) => {
                          const next = new Set(prev);
                          if (next.has(id)) next.delete(id);
                          else next.add(id);
                          void updateUserProfile({ disabledProviders: [...next] })
                            .then(() => refreshProfile())
                            .catch((err) => {
                              if (__DEV__)
                                console.warn('[Settings] Failed to toggle provider:', err);
                            });
                          return next;
                        });
                      }}
                      style={({ pressed }) => [
                        styles.providerActionBtn,
                        pressed && styles.providerActionBtnPressed,
                      ]}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: !isDisabled }}
                      accessibilityLabel={`${isDisabled ? 'Enable' : 'Disable'} ${PROVIDER_DISPLAY_NAMES[id]}`}
                    >
                      <Ionicons
                        name={isDisabled ? 'power' : 'power'}
                        size={18}
                        color={isDisabled ? n.colors.error : n.colors.success}
                      />
                    </Pressable>
                    <LinearText style={styles.providerIndex}>{index + 1}</LinearText>
                    <View
                      style={[
                        styles.providerDot,
                        {
                          backgroundColor: isDisabled
                            ? n.colors.error
                            : hasKey
                              ? n.colors.success
                              : n.colors.textMuted,
                        },
                      ]}
                    />
                    <LinearText
                      style={[
                        styles.providerName,
                        { color: n.colors.textPrimary },
                        isDisabled && { textDecorationLine: 'line-through' },
                      ]}
                      numberOfLines={2}
                    >
                      {PROVIDER_DISPLAY_NAMES[id]}
                    </LinearText>
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
                        <Ionicons name="play-skip-back" size={16} color={n.colors.textPrimary} />
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
                        <Ionicons name="chevron-up" size={18} color={n.colors.textPrimary} />
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
                        <Ionicons name="chevron-down" size={18} color={n.colors.textPrimary} />
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
                        <Ionicons name="play-skip-forward" size={16} color={n.colors.textPrimary} />
                      </Pressable>
                    </View>
                  </LinearSurface>
                );
              })}
              <TouchableOpacity
                style={[styles.testBtn, { marginTop: 4, marginBottom: 12 }]}
                onPress={() => {
                  const reset = [...DEFAULT_PROVIDER_ORDER];
                  setProviderOrder(reset);
                  setDisabledProviders(new Set());
                  void updateUserProfile({
                    providerOrder: sanitizeProviderOrder(reset),
                    disabledProviders: [],
                  })
                    .then(() => refreshProfile())
                    .catch((err) => {
                      if (__DEV__) console.warn('[Settings] Failed to reset provider order:', err);
                    });
                }}
                activeOpacity={0.8}
              >
                <LinearText style={styles.testBtnText}>Reset to Default Order</LinearText>
              </TouchableOpacity>
            </SubSectionToggle>

            {/* ── Image Generation ────────────────────── */}
            <View style={styles.subSectionDivider} />
            <SubSectionToggle id="ai_image_gen" title="IMAGE GENERATION">
              <LinearText style={styles.hint}>
                Diagrams and study images. fal uses a separate API key and does not reuse ChatGPT
                Plus login.
              </LinearText>
              <LinearText style={styles.label}>fal API Key</LinearText>
              <View style={styles.apiKeyRow}>
                <TextInput
                  style={[
                    styles.input,
                    styles.apiKeyInput,
                    falValidationStatus === 'ok' && styles.inputSuccess,
                    falValidationStatus === 'fail' && styles.inputError,
                  ]}
                  placeholder="fal key"
                  placeholderTextColor={n.colors.textMuted}
                  value={falApiKey}
                  onChangeText={(value: string) => {
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
                    <ActivityIndicator size="small" color={n.colors.accent} />
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
                          ? n.colors.success
                          : falValidationStatus === 'fail'
                            ? n.colors.error
                            : n.colors.accent
                      }
                    />
                  )}
                </TouchableOpacity>
              </View>
              <LinearText style={styles.hint}>
                Validate your fal API key with fal's model catalog endpoint.
              </LinearText>
              <LinearText style={styles.label}>Brave Search API Key</LinearText>
              <View style={styles.apiKeyRow}>
                <TextInput
                  style={[
                    styles.input,
                    styles.apiKeyInput,
                    braveValidationStatus === 'ok' && styles.inputSuccess,
                    braveValidationStatus === 'fail' && styles.inputError,
                  ]}
                  placeholder="brave key"
                  placeholderTextColor={n.colors.textMuted}
                  value={braveSearchApiKey}
                  onChangeText={(value: string) => {
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
                    <ActivityIndicator size="small" color={n.colors.accent} />
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
                          ? n.colors.success
                          : braveValidationStatus === 'fail'
                            ? n.colors.error
                            : n.colors.accent
                      }
                    />
                  )}
                </TouchableOpacity>
              </View>
              <LinearText style={styles.hint}>
                Optional fallback for image search when MedPix, Open-i, and Wikimedia return
                nothing.
              </LinearText>
              <LinearText style={styles.label}>Google Custom Search API Key</LinearText>
              <View style={styles.apiKeyRow}>
                <TextInput
                  style={[
                    styles.input,
                    styles.apiKeyInput,
                    googleValidationStatus === 'ok' && styles.inputSuccess,
                    googleValidationStatus === 'fail' && styles.inputError,
                  ]}
                  placeholder="Google API key"
                  placeholderTextColor={n.colors.textMuted}
                  value={googleCustomSearchApiKey}
                  onChangeText={(value: string) => {
                    setGoogleCustomSearchApiKey(value);
                    clearProviderValidated('google');
                  }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={styles.validateBtn}
                  onPress={testGoogleCustomSearchKey}
                  disabled={testingGoogleCustomSearchKey}
                  activeOpacity={0.8}
                >
                  {testingGoogleCustomSearchKey ? (
                    <ActivityIndicator size="small" color={n.colors.accent} />
                  ) : (
                    <Ionicons
                      name={
                        googleCustomSearchKeyTestResult === 'ok'
                          ? 'checkmark-circle'
                          : googleCustomSearchKeyTestResult === 'fail'
                            ? 'close-circle'
                            : 'search-outline'
                      }
                      size={20}
                      color={
                        googleCustomSearchKeyTestResult === 'ok'
                          ? n.colors.success
                          : googleCustomSearchKeyTestResult === 'fail'
                            ? n.colors.error
                            : n.colors.accent
                      }
                    />
                  )}
                </TouchableOpacity>
              </View>
              <LinearText style={styles.hint}>
                Uses search engine ID 5085c21a1fd974c13 (medical sites). Enables high-quality image
                search for quizzes, flashcards, and chat.
              </LinearText>
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
                    <LinearText
                      style={[
                        styles.freqText,
                        imageGenerationModel === opt.value && styles.freqTextActive,
                      ]}
                    >
                      {opt.label}
                    </LinearText>
                  </TouchableOpacity>
                ))}
              </View>
            </SubSectionToggle>

            <View style={styles.subSectionDivider} />
            <SubSectionToggle id="ai_transcription" title="TRANSCRIPTION">
              <LinearText style={styles.hint}>
                Configure transcription providers and keys used by Recording Vault and external
                lecture processing.
              </LinearText>
              <TranscriptionSettingsPanel embedded />
            </SubSectionToggle>

            {/* ── Local AI ────────────────────────────── */}
            <View style={styles.subSectionDivider} />
            <SubSectionToggle id="ai_local_ai" title="LOCAL AI">
              <LinearText style={styles.hint}>
                Run AI on-device for offline chat and local transcription.
              </LinearText>
              {localAiEnabled && (
                <LinearText style={[styles.hint, styles.localAiEnabledHint]}>
                  Local AI is currently enabled.
                </LinearText>
              )}
              <View style={styles.localAiStatusRow}>
                <LinearText style={[styles.localAiStatusText, styles.localAiStatusTextWrap]}>
                  LLM model:{' '}
                  <LinearText
                    numberOfLines={2}
                    style={localLlmReady ? styles.localAiModelName : styles.localAiModelMissing}
                  >
                    {localLlmReady ? localLlmFileName : 'Not installed'}
                  </LinearText>
                </LinearText>
                {profile?.useLocalModel && localLlmReady ? (
                  <View style={styles.localAiActiveDot} />
                ) : null}
              </View>
              <View style={styles.localAiStatusRow}>
                <LinearText style={[styles.localAiStatusText, styles.localAiStatusTextWrap]}>
                  Whisper model:{' '}
                  <LinearText
                    numberOfLines={2}
                    style={localWhisperReady ? styles.localAiModelName : styles.localAiModelMissing}
                  >
                    {localWhisperReady ? localWhisperFileName : 'Not installed'}
                  </LinearText>
                </LinearText>
                {profile?.useLocalWhisper && localWhisperReady ? (
                  <View style={styles.localAiActiveDot} />
                ) : null}
              </View>
              {!localLlmAllowed && (
                <LinearText style={[styles.hint, styles.localAiWarningHint]}>
                  {localLlmWarning}
                </LinearText>
              )}
              <TouchableOpacity
                style={styles.localModelBtn}
                activeOpacity={0.8}
                onPress={() => navigation.navigate('LocalModel' as any)}
              >
                <Ionicons
                  name="download-outline"
                  size={18}
                  color={n.colors.textPrimary}
                  style={{ marginRight: 8 }}
                />
                <LinearText style={styles.localModelBtnText}>Manage Local AI Models</LinearText>
              </TouchableOpacity>
            </SubSectionToggle>
          </SectionToggle>

          <LinearText style={styles.categoryLabel}>ACCOUNT</LinearText>
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
              <LinearText style={styles.diagBtnText}>Open System Settings</LinearText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.diagBtn, { marginTop: 8 }]}
              onPress={() => {
                const { devConsole } = require('../components/DevConsole');
                devConsole.show();
              }}
            >
              <LinearText style={styles.diagBtnText}>Open Dev Console</LinearText>
            </TouchableOpacity>
          </SectionToggle>

          <SectionToggle id="profile" title="Profile" icon="person-outline" tint="#8EC5FF">
            <TouchableOpacity
              style={[
                styles.testBtn,
                { marginTop: 0, marginBottom: 16, borderColor: 'rgba(63,185,80,0.08)' },
              ]}
              onPress={() => navigation.navigate('DeviceLink')}
              activeOpacity={0.8}
            >
              <LinearText style={[styles.testBtnText, { color: n.colors.success }]}>
                📱 Link Another Device (Sync)
              </LinearText>
            </TouchableOpacity>
            <Label text="Your name" />
            <TextInput
              style={styles.input}
              placeholder="Dr. ..."
              placeholderTextColor={n.colors.textMuted}
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
              placeholderTextColor={n.colors.textMuted}
            />
            <Label text="NEET-PG date (YYYY-MM-DD)" />
            <TextInput
              style={styles.input}
              value={neetDate}
              onChangeText={setNeetDate}
              placeholderTextColor={n.colors.textMuted}
            />
            <TouchableOpacity
              style={[styles.autoFetchBtn, fetchingDates && styles.autoFetchBtnDisabled]}
              onPress={handleAutoFetchDates}
              disabled={fetchingDates}
              activeOpacity={0.8}
            >
              {fetchingDates ? (
                <ActivityIndicator size="small" color={n.colors.accent} />
              ) : (
                <LinearText style={styles.autoFetchBtnText}>🤖 Auto-fetch dates via AI</LinearText>
              )}
            </TouchableOpacity>
            {fetchDatesMsg ? (
              <LinearText
                style={[
                  styles.hint,
                  fetchDatesMsg.startsWith('✅')
                    ? { color: n.colors.success }
                    : { color: n.colors.error },
                ]}
              >
                {fetchDatesMsg}
              </LinearText>
            ) : (
              <LinearText style={styles.hint}>
                Uses AI to estimate upcoming exam dates. Always verify on nbe.edu.in.
              </LinearText>
            )}
          </SectionToggle>

          <LinearText style={styles.categoryLabel}>STUDY</LinearText>
          <SectionToggle id="live_batch" title="Study Plan" icon="book-outline" tint="#2196F3">
            <Label text="DBMCI One batch start date (YYYY-MM-DD)" />
            <TextInput
              style={styles.input}
              value={dbmciClassStartDate}
              onChangeText={setDbmciClassStartDate}
              placeholder="e.g. 2025-01-06"
              placeholderTextColor={n.colors.textMuted}
              autoCapitalize="none"
            />
            <LinearText style={styles.hint}>
              Set this to unlock the live-class position tracker in the Study Plan screen. Guru will
              highlight which subject DBMCI One is covering today.
            </LinearText>
            <Label text="BTR (Back to Roots) batch start date (YYYY-MM-DD)" />
            <TextInput
              style={styles.input}
              value={btrStartDate}
              onChangeText={setBtrStartDate}
              placeholder="e.g. 2025-09-01"
              placeholderTextColor={n.colors.textMuted}
              autoCapitalize="none"
            />
            <LinearText style={styles.hint}>
              Set this when you start the BTR revision batch. Guru will align your daily revision
              queue with the current BTR subject.
            </LinearText>
            <Label text="Home novelty cooldown (hours)" />
            <View style={styles.frequencyRow}>
              {[2, 4, 6, 8, 12].map((hrs) => {
                const active = (parseInt(homeNoveltyCooldownHours, 10) || 6) === hrs;
                return (
                  <TouchableOpacity
                    key={hrs}
                    style={[styles.frequencyChip, active && styles.frequencyChipActive]}
                    onPress={() => setHomeNoveltyCooldownHours(String(hrs))}
                    activeOpacity={0.8}
                  >
                    <LinearText
                      style={[styles.frequencyChipText, active && styles.frequencyChipTextActive]}
                    >
                      {hrs}h
                    </LinearText>
                  </TouchableOpacity>
                );
              })}
            </View>
            <LinearText style={styles.hint}>
              Controls how quickly Home repeats the same topics in DO THIS NOW and UP NEXT. Lower =
              more repetition, higher = more novelty.
            </LinearText>
          </SectionToggle>
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
              placeholderTextColor={n.colors.textMuted}
            />
            <Label text="Daily study goal (minutes)" />
            <TextInput
              style={styles.input}
              value={dailyGoal}
              onChangeText={setDailyGoal}
              keyboardType="number-pad"
              placeholderTextColor={n.colors.textMuted}
            />
            <View style={[styles.switchRow, { marginTop: 16 }]}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <LinearText style={styles.switchLabel}>Strict Mode 👮</LinearText>
                <LinearText style={styles.hint}>
                  Nag you instantly if you leave the app or are idle. Idle time won't count towards
                  session duration.
                </LinearText>
              </View>
              <Switch
                value={strictMode}
                onValueChange={setStrictMode}
                trackColor={{ true: n.colors.error, false: n.colors.border }}
                thumbColor={n.colors.textPrimary}
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
                <LinearText style={styles.switchLabel}>Enable Guru's reminders</LinearText>
                <LinearText style={styles.hint}>
                  Guru will send personalized daily accountability messages
                </LinearText>
              </View>
              <Switch
                value={notifs}
                onValueChange={setNotifs}
                trackColor={{ true: n.colors.accent, false: n.colors.border }}
                thumbColor={n.colors.textPrimary}
              />
            </View>
            <Label text="Reminder hour (0–23, e.g. 7 = 7:30 AM)" />
            <TextInput
              style={styles.input}
              value={notifHour}
              onChangeText={setNotifHour}
              keyboardType="number-pad"
              placeholderTextColor={n.colors.textMuted}
            />
            <LinearText style={styles.hint}>Evening nudge fires ~11 hours after this.</LinearText>
            <Label text="Guru presence frequency" />
            <View style={styles.frequencyRow}>
              {(['rare', 'normal', 'frequent', 'off'] as const).map((freq) => (
                <TouchableOpacity
                  key={freq}
                  style={[styles.freqBtn, guruFrequency === freq && styles.freqBtnActive]}
                  onPress={() => setGuruFrequency(freq)}
                >
                  <LinearText
                    style={[styles.freqText, guruFrequency === freq && styles.freqTextActive]}
                  >
                    {freq.charAt(0).toUpperCase() + freq.slice(1)}
                  </LinearText>
                </TouchableOpacity>
              ))}
            </View>
            <LinearText style={styles.hint}>
              How often Guru sends ambient messages during sessions. Rare: every 30min, Normal:
              every 20min, Frequent: every 10min.
            </LinearText>
            <TouchableOpacity style={styles.testBtn} onPress={testNotification} activeOpacity={0.8}>
              <LinearText style={styles.testBtnText}>Schedule Notifications Now</LinearText>
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
                <LinearText style={styles.switchLabel}>Guru presence during sessions</LinearText>
                <LinearText style={styles.hint}>
                  Ambient toast messages and pulsing dot while you study. Helps with focus.
                </LinearText>
              </View>
              <Switch
                value={bodyDoubling}
                onValueChange={setBodyDoubling}
                trackColor={{ true: n.colors.accent, false: n.colors.border }}
                thumbColor={n.colors.textPrimary}
              />
            </View>
          </SectionToggle>

          <SectionToggle
            id="content"
            title="Content Type Preferences"
            icon="layers-outline"
            tint="#FF6B9D"
          >
            <LinearText style={styles.hint}>
              Block card types you don't want in sessions. Keypoints can't be blocked.
            </LinearText>
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
                    <LinearText
                      style={[styles.typeChipText, isBlocked && styles.typeChipTextBlocked]}
                    >
                      {label}
                    </LinearText>
                    {isBlocked && <LinearText style={styles.typeChipX}> ✕</LinearText>}
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
            <LinearText style={styles.hint}>
              Pin subjects to limit sessions to those areas only. Clear all to study everything.
            </LinearText>
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
                    <LinearText style={[styles.typeChipText, isFocused && { color: s.colorHex }]}>
                      {s.shortCode}
                    </LinearText>
                  </TouchableOpacity>
                );
              })}
            </View>
            {focusSubjectIds.length > 0 && (
              <TouchableOpacity onPress={() => setFocusSubjectIds([])} style={styles.clearBtn}>
                <LinearText style={styles.clearBtnText}>
                  Clear focus (study all subjects)
                </LinearText>
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
              placeholderTextColor={n.colors.textMuted}
            />
            <Label text="Break duration between topics (minutes)" />
            <TextInput
              style={styles.input}
              value={breakDuration}
              onChangeText={setBreakDuration}
              keyboardType="number-pad"
              placeholderTextColor={n.colors.textMuted}
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
                <LinearText style={styles.switchLabel}>Enable Pomodoro Suggestion</LinearText>
                <LinearText style={styles.hint}>
                  Auto-expand the external lecture overlay every interval to suggest a break.
                </LinearText>
              </View>
              <Switch
                value={pomodoroEnabled}
                onValueChange={setPomodoroEnabled}
                trackColor={{ true: n.colors.accent, false: n.colors.border }}
                thumbColor={n.colors.textPrimary}
              />
            </View>
            <LinearText
              style={[
                styles.hint,
                {
                  color: pomodoroLectureQuizReady
                    ? n.colors.success
                    : pomodoroEnabled
                      ? n.colors.error
                      : n.colors.textMuted,
                },
              ]}
            >
              {pomodoroLectureQuizReady
                ? 'Lecture-aware break quizzes are ready.'
                : pomodoroEnabled
                  ? 'Currently this will only suggest a break until overlay permission, Groq, and Deepgram are configured.'
                  : 'Pomodoro break suggestions are off.'}
            </LinearText>
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
                <LinearText style={styles.testBtnText}>Grant Overlay Permission</LinearText>
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
                      backgroundColor: item.ready ? n.colors.success + '18' : n.colors.error + '12',
                      borderColor: item.ready ? n.colors.success : n.colors.error,
                    },
                  ]}
                >
                  <LinearText
                    style={[
                      styles.typeChipText,
                      { color: item.ready ? n.colors.success : n.colors.error },
                    ]}
                  >
                    {item.label}
                  </LinearText>
                </View>
              ))}
            </View>
            <Label text="Pomodoro interval (minutes)" />
            <TextInput
              style={styles.input}
              value={pomodoroInterval}
              onChangeText={setPomodoroInterval}
              keyboardType="number-pad"
              placeholderTextColor={n.colors.textMuted}
              editable={pomodoroEnabled}
            />
            <View style={styles.modelChipRow}>
              {['5', '10', '20', '25', '30', '40'].map((value) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.freqBtn, pomodoroInterval === value && styles.freqBtnActive]}
                  onPress={() => setPomodoroInterval(value)}
                  disabled={!pomodoroEnabled}
                  activeOpacity={0.8}
                >
                  <LinearText
                    style={[
                      styles.freqText,
                      pomodoroInterval === value && styles.freqTextActive,
                      !pomodoroEnabled && { opacity: 0.45 },
                    ]}
                  >
                    {value}m
                  </LinearText>
                </TouchableOpacity>
              ))}
            </View>
            <LinearText style={styles.hint}>
              Suggested: 20-30 minutes. The overlay can suggest a break without quiz data, but
              lecture-aware quiz breaks need both Groq and Deepgram.
            </LinearText>
          </SectionToggle>

          <LinearText style={styles.categoryLabel}>STORAGE</LinearText>
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
              <LinearText style={styles.dangerBtnText}>Clear AI Content Cache</LinearText>
            </TouchableOpacity>
            <LinearText style={styles.hint}>
              Forces fresh generation of all key points, quizzes, stories, etc.
            </LinearText>
            <TouchableOpacity
              style={[styles.dangerBtn, { borderColor: 'rgba(241,76,76,0.08)', marginTop: 10 }]}
              onPress={async () => {
                const result = await showDialog({
                  title: 'Reset all progress?',
                  message:
                    'This clears all topic progress, XP, streaks, and daily logs. This cannot be undone. Export a backup first.',
                  variant: 'destructive',
                  actions: [
                    { id: 'cancel', label: 'Cancel', variant: 'secondary' },
                    {
                      id: 'reset-progress',
                      label: 'Reset',
                      variant: 'destructive',
                      isDestructive: true,
                    },
                  ],
                  allowDismiss: true,
                });

                if (result !== 'reset-progress') return;

                resetStudyProgress();
                refreshProfile();
                showToast({
                  title: 'Reset',
                  message: 'Progress has been wiped. Start fresh!',
                  variant: 'success',
                });
              }}
              activeOpacity={0.8}
            >
              <LinearText style={[styles.dangerBtnText, { color: n.colors.error }]}>
                Reset All Progress
              </LinearText>
            </TouchableOpacity>
            <LinearText style={styles.hint}>
              Wipes XP, streaks, topic statuses, and daily logs. API keys are kept.
            </LinearText>
          </SectionToggle>

          <SectionToggle
            id="unified_backup"
            title="Unified Backup & Restore"
            icon="archive-outline"
            tint="#4CAF50"
          >
            <LinearText style={styles.hint}>
              Export your entire study data (database, transcripts, images) to a single .guru backup
              file, or restore from a previous backup.
            </LinearText>
            {(profile as any)?.lastAutoBackupAt && (
              <LinearText style={styles.backupDate}>
                Last auto-backup: {new Date((profile as any).lastAutoBackupAt).toLocaleString()}
              </LinearText>
            )}
            <View style={styles.backupRow}>
              <TouchableOpacity
                style={[styles.backupBtn, backupBusy && styles.saveBtnDisabled]}
                disabled={backupBusy}
                activeOpacity={0.8}
                onPress={async () => {
                  setBackupBusy(true);
                  try {
                    const success = await exportUnifiedBackup();
                    if (success) {
                      const now = new Date().toISOString();
                      updateUserProfile({ lastBackupDate: now } as any);
                      refreshProfile();
                    }
                  } catch (e: any) {
                    Alert.alert('Export failed', e?.message ?? 'Unknown error');
                  } finally {
                    setBackupBusy(false);
                  }
                }}
              >
                {backupBusy ? (
                  <ActivityIndicator size="small" color={n.colors.textPrimary} />
                ) : (
                  <LinearText style={styles.backupBtnText}>Create Full Backup</LinearText>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.backupBtn,
                  { borderColor: 'rgba(63,185,80,0.08)' },
                  backupBusy && styles.saveBtnDisabled,
                ]}
                disabled={backupBusy}
                activeOpacity={0.8}
                onPress={async () => {
                  Alert.alert(
                    'Restore from backup?',
                    'This will overwrite your current data with data from the .guru backup file. You can selectively restore settings, progress, transcripts, and images.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Restore',
                        style: 'destructive',
                        onPress: async () => {
                          setBackupBusy(true);
                          try {
                            const res = await importUnifiedBackup();
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
                <LinearText style={[styles.backupBtnText, { color: n.colors.success }]}>
                  Restore from Backup
                </LinearText>
              </TouchableOpacity>
            </View>

            <View style={styles.subSectionDivider} />
            <LinearText style={styles.subSectionLabel}>Auto-Backup Frequency</LinearText>
            <LinearText style={styles.hint}>
              Automatically create backups when the app starts.
            </LinearText>
            <View style={styles.frequencyRow}>
              {(['off', 'daily', '3days', 'weekly', 'monthly'] as AutoBackupFrequency[]).map(
                (freq) => (
                  <TouchableOpacity
                    key={freq}
                    style={[
                      styles.frequencyChip,
                      autoBackupFrequency === freq && styles.frequencyChipActive,
                    ]}
                    onPress={() => setAutoBackupFrequency(freq)}
                    activeOpacity={0.8}
                  >
                    <LinearText
                      style={[
                        styles.frequencyChipText,
                        autoBackupFrequency === freq && styles.frequencyChipTextActive,
                      ]}
                    >
                      {freq === 'off'
                        ? 'Off'
                        : freq === '3days'
                          ? '3 Days'
                          : freq.charAt(0).toUpperCase() + freq.slice(1)}
                    </LinearText>
                  </TouchableOpacity>
                ),
              )}
            </View>
            <TouchableOpacity
              style={[styles.maintenanceBtn, backupBusy && styles.saveBtnDisabled]}
              disabled={backupBusy}
              activeOpacity={0.8}
              onPress={async () => {
                Alert.alert(
                  'Run Auto-Backup Now?',
                  'This will create an automatic backup regardless of your frequency setting.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Run Backup',
                      onPress: async () => {
                        setBackupBusy(true);
                        try {
                          const success = await runAutoBackup();
                          if (success) {
                            const now = new Date().toISOString();
                            await profileRepository.updateProfile({ lastAutoBackupAt: now } as any);
                            refreshProfile();
                            Alert.alert('Auto-backup complete');
                          } else {
                            Alert.alert('Failed', 'Auto-backup failed. Check logs for details.');
                          }
                        } catch (e: any) {
                          Alert.alert('Failed', e?.message ?? 'Unknown error');
                        } finally {
                          setBackupBusy(false);
                        }
                      },
                    },
                  ],
                );
              }}
            >
              <LinearText style={styles.maintenanceBtnText}>Run Auto-Backup Now</LinearText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.maintenanceBtn, backupBusy && styles.saveBtnDisabled]}
              disabled={backupBusy}
              activeOpacity={0.8}
              onPress={async () => {
                setBackupBusy(true);
                try {
                  await cleanupOldBackups(5);
                  Alert.alert('Cleanup complete', 'Old backups have been cleaned up.');
                } catch (e: any) {
                  Alert.alert('Cleanup failed', e?.message ?? 'Unknown error');
                } finally {
                  setBackupBusy(false);
                }
              }}
            >
              <LinearText style={styles.maintenanceBtnText}>Clean Up Old Backups</LinearText>
            </TouchableOpacity>

            <View style={styles.subSectionDivider} />
            <LinearText style={styles.subSectionLabel}>Google Drive Sync</LinearText>
            <LinearText style={styles.hint}>
              Back up to Google Drive to sync between devices and survive app reinstalls.
            </LinearText>
            <LinearText style={[styles.label, { marginTop: 12 }]}>Google Web Client ID</LinearText>
            <LinearText style={styles.hint}>
              Paste your Google OAuth Web application client ID here once. Guru stores it in your
              profile so future sign-ins do not require a rebuild.
            </LinearText>
            <TextInput
              value={gdriveWebClientId}
              onChangeText={setGdriveWebClientId}
              placeholder="Your Google Web Client ID"
              placeholderTextColor={n.colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!backupBusy}
              style={{
                borderWidth: 1,
                borderColor: n.colors.border,
                backgroundColor: n.colors.surface,
                color: n.colors.textPrimary,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 12,
                marginTop: 8,
              }}
            />
            {(profile as any)?.gdriveConnected ? (
              <View>
                <LinearText style={[styles.backupDate, { marginBottom: 8 }]}>
                  Connected: {(profile as any)?.gdriveEmail || 'Google Account'}
                </LinearText>
                {(profile as any)?.gdriveLastSyncAt && (
                  <LinearText style={styles.backupDate}>
                    Last sync: {new Date((profile as any).gdriveLastSyncAt).toLocaleString()}
                  </LinearText>
                )}
                <View style={styles.backupRow}>
                  <TouchableOpacity
                    style={[styles.backupBtn, backupBusy && styles.saveBtnDisabled]}
                    disabled={backupBusy}
                    activeOpacity={0.8}
                    onPress={async () => {
                      setBackupBusy(true);
                      try {
                        const { runAutoBackup } = await import('../services/unifiedBackupService');
                        const success = await runAutoBackup();
                        if (success) {
                          refreshProfile();
                          Alert.alert('Synced', 'Backup uploaded to Google Drive.');
                        } else {
                          Alert.alert('Sync failed', 'Could not create or upload backup.');
                        }
                      } catch (e: any) {
                        Alert.alert('Sync failed', e?.message ?? 'Unknown error');
                      } finally {
                        setBackupBusy(false);
                      }
                    }}
                  >
                    <LinearText style={styles.backupBtnText}>Sync Now</LinearText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.backupBtn,
                      { borderColor: n.colors.error },
                      backupBusy && styles.saveBtnDisabled,
                    ]}
                    disabled={backupBusy}
                    activeOpacity={0.8}
                    onPress={() => {
                      Alert.alert(
                        'Disconnect Google Drive?',
                        'Auto-sync will stop. Your existing backups on Drive will remain.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Disconnect',
                            style: 'destructive',
                            onPress: async () => {
                              try {
                                const { signOutGDrive } =
                                  await import('../services/gdriveBackupService');
                                await signOutGDrive();
                                refreshProfile();
                              } catch (e: any) {
                                Alert.alert('Error', e?.message ?? 'Failed to disconnect');
                              }
                            },
                          },
                        ],
                      );
                    }}
                  >
                    <LinearText style={[styles.backupBtnText, { color: n.colors.error }]}>
                      Disconnect
                    </LinearText>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.backupBtn, { marginTop: 8 }, backupBusy && styles.saveBtnDisabled]}
                disabled={backupBusy}
                activeOpacity={0.8}
                onPress={async () => {
                  const resolvedGoogleClientId =
                    gdriveWebClientId.trim() ||
                    GOOGLE_WEB_CLIENT_ID ||
                    profile?.gdriveWebClientId?.trim();
                  if (!resolvedGoogleClientId) {
                    Alert.alert(
                      'Google Drive setup required',
                      'Paste your Google OAuth Web application client ID in the field above, or provide EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in your build config.',
                    );
                    return;
                  }
                  setBackupBusy(true);
                  try {
                    const { signInToGDrive } = await import('../services/gdriveBackupService');
                    await updateUserProfile({ gdriveWebClientId: resolvedGoogleClientId } as any);
                    const result = await signInToGDrive(resolvedGoogleClientId);
                    refreshProfile();
                    Alert.alert(
                      'Connected!',
                      `Signed in as ${result.email}. Your backups will now sync to Google Drive.`,
                    );
                  } catch (e: any) {
                    if (e?.code !== 'SIGN_IN_CANCELLED') {
                      const code = String(e?.code ?? '');
                      const msg = String(e?.message ?? '');
                      const isDeveloperError =
                        code === '10' ||
                        code === 'DEVELOPER_ERROR' ||
                        msg.toLowerCase().includes('developer error');

                      if (isDeveloperError) {
                        Alert.alert(
                          'Google Sign-In: Developer error',
                          'Troubleshooting:\n\n1. In Google Cloud, create an Android OAuth client for package com.anonymous.gurustudy.\n2. Add SHA-1 and SHA-256 for your signing key (debug and release if needed).\n3. Keep this Web Client ID and Android client in the same Google project.\n4. Ensure OAuth consent screen is configured and your Google account is added as a test user.\n5. Uninstall/reinstall the app and retry sign-in.',
                        );
                      } else {
                        Alert.alert(
                          'Sign-in failed',
                          e?.message ?? 'Could not connect to Google Drive',
                        );
                      }
                    }
                  } finally {
                    setBackupBusy(false);
                  }
                }}
              >
                <LinearText style={styles.backupBtnText}>Connect Google Drive</LinearText>
              </TouchableOpacity>
            )}
          </SectionToggle>

          <SectionToggle
            id="advanced"
            title="Library Maintenance"
            icon="construct-outline"
            tint="#8080A0"
          >
            <LinearText style={styles.hint}>
              Run repair and recovery only when you need it instead of during startup.
            </LinearText>
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
                <ActivityIndicator size="small" color={n.colors.textPrimary} />
              ) : (
                <LinearText style={styles.maintenanceBtnText}>
                  Retry failed lecture processing
                </LinearText>
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
                <ActivityIndicator size="small" color={n.colors.textPrimary} />
              ) : (
                <LinearText style={styles.maintenanceBtnText}>
                  Repair legacy lecture notes
                </LinearText>
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
                <ActivityIndicator size="small" color={n.colors.textPrimary} />
              ) : (
                <LinearText style={styles.maintenanceBtnText}>
                  Recover orphan transcripts
                </LinearText>
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
                <ActivityIndicator size="small" color={n.colors.textPrimary} />
              ) : (
                <LinearText style={styles.maintenanceBtnText}>Recover orphan recordings</LinearText>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.maintenanceBtn, maintenanceBusy !== null && styles.saveBtnDisabled]}
              disabled={maintenanceBusy !== null}
              activeOpacity={0.8}
              onPress={() =>
                runMaintenanceTask(
                  'cleanup_artifacts',
                  async () => {
                    const { cleanupFailedArtifacts } =
                      await import('../services/lecture/lectureSessionMonitor');
                    return cleanupFailedArtifacts();
                  },
                  {
                    done: 'Failed artifacts cleaned up',
                    none: 'No failed artifacts found',
                    failed: 'Artifact cleanup failed',
                  },
                )
              }
            >
              {maintenanceBusy === 'cleanup_artifacts' ? (
                <ActivityIndicator size="small" color={n.colors.textPrimary} />
              ) : (
                <LinearText style={styles.maintenanceBtnText}>
                  Clean up failed AI artifacts
                </LinearText>
              )}
            </TouchableOpacity>
          </SectionToggle>

          {saving && (
            <View style={[styles.saveBtn, styles.saveBtnDisabled]}>
              <ActivityIndicator size="small" color={n.colors.textPrimary} />
              <LinearText style={[styles.saveBtnText, { marginLeft: 8 }]}>Auto-saving…</LinearText>
            </View>
          )}

          <LinearText style={styles.footer}>Guru AI · v1.0.0</LinearText>
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
        <LinearText style={styles.permLabel}>{label}</LinearText>
        <LinearText style={[styles.permStatus, isOk ? styles.permOk : styles.permError]}>
          {isOk ? '✓ Active' : status === 'denied' ? '✗ Disabled' : '○ Not Set'}
        </LinearText>
      </View>
      {!isOk && (
        <TouchableOpacity style={styles.fixBtn} onPress={onFix}>
          <LinearText style={styles.fixBtnText}>Fix</LinearText>
        </TouchableOpacity>
      )}
    </View>
  );
}

function Label({ text }: { text: string }) {
  return <LinearText style={styles.label}>{text}</LinearText>;
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
        <LinearText style={styles.dropdownValue} numberOfLines={2}>
          {selectedLabel}
        </LinearText>
        <LinearText style={styles.dropdownArrow}>▾</LinearText>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.dropdownBackdrop} onPress={() => setOpen(false)}>
          <LinearSurface padded={false} style={styles.dropdownSheet}>
            <LinearText style={styles.dropdownSheetTitle}>{label}</LinearText>
            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator>
              {options.map((opt, idx) => {
                const showGroup = opt.group && (idx === 0 || options[idx - 1]?.group !== opt.group);
                return (
                  <React.Fragment key={opt.id}>
                    {showGroup && (
                      <LinearText style={styles.dropdownGroupLabel}>{opt.group}</LinearText>
                    )}
                    <TouchableOpacity
                      style={[styles.dropdownItem, value === opt.id && styles.dropdownItemActive]}
                      onPress={() => {
                        onSelect(opt.id);
                        setOpen(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <LinearText
                        style={[
                          styles.dropdownItemText,
                          value === opt.id && styles.dropdownItemTextActive,
                        ]}
                        numberOfLines={2}
                      >
                        {opt.label}
                      </LinearText>
                      {value === opt.id && <LinearText style={styles.dropdownCheck}>✓</LinearText>}
                    </TouchableOpacity>
                  </React.Fragment>
                );
              })}
            </ScrollView>
          </LinearSurface>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: n.colors.background },
  content: { padding: n.spacing.lg, paddingBottom: 60 },
  title: {
    color: n.colors.textPrimary,
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 20,
    marginTop: 8,
  },
  section: { marginBottom: n.spacing.md },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: n.spacing.md,
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
    color: n.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  categoryLabel: {
    color: n.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: n.spacing.lg,
    marginBottom: n.spacing.xs,
  },
  sectionContent: {
    borderRadius: 16,
    padding: n.spacing.lg,
  },
  label: { color: n.colors.textSecondary, fontSize: 13, marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: n.colors.background,
    borderRadius: 10,
    padding: 12,
    color: n.colors.textPrimary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: n.colors.border,
    marginBottom: 4,
  },
  apiKeyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  apiKeyInput: { flex: 1, marginBottom: 0 },
  inputSuccess: { borderColor: n.colors.success },
  inputError: { borderColor: n.colors.error },
  validateBtn: {
    backgroundColor: n.colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 52,
    borderWidth: 1,
    borderColor: n.colors.borderLight,
  },
  validateBtnSuccess: {
    backgroundColor: n.colors.successSurface,
    borderColor: n.colors.success,
  },
  validateBtnError: { backgroundColor: n.colors.errorSurface, borderColor: n.colors.error },
  validateBtnOk: {
    backgroundColor: n.colors.successSurface,
    borderColor: n.colors.success,
  },
  validateBtnFail: {
    backgroundColor: n.colors.errorSurface,
    borderColor: n.colors.error,
  },
  validateBtnTesting: { backgroundColor: n.colors.card, borderColor: n.colors.accent },
  validateBtnText: { color: n.colors.textPrimary, fontWeight: '700', fontSize: 14 },
  validationMsg: { fontSize: 12, marginTop: 6, marginBottom: 2 },
  validationSuccess: { color: n.colors.success },
  validationError: { color: n.colors.error },
  hint: { color: n.colors.textMuted, fontSize: 12, marginBottom: 4 },
  subSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  subSectionLabel: {
    color: n.colors.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  subSectionDivider: {
    height: 1,
    backgroundColor: n.colors.border,
    marginVertical: 14,
  },
  localModelBtn: {
    marginTop: 12,
    flexDirection: 'row',
    backgroundColor: n.colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: n.colors.border,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  localModelBtnText: { color: n.colors.textPrimary, fontWeight: '700', fontSize: 14 },
  localAiStatusText: {
    color: n.colors.textSecondary,
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
    color: n.colors.success,
    marginBottom: 8,
  },
  localAiWarningHint: {
    color: n.colors.warning,
    marginTop: 4,
  },
  localAiModelName: {
    color: n.colors.warning,
    fontWeight: '700',
  },
  localAiModelMissing: {
    color: n.colors.textMuted,
    fontWeight: '600',
  },
  localAiActiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: n.colors.success,
    marginLeft: 12,
    flexShrink: 0,
  },
  autoFetchBtn: {
    marginTop: 10,
    backgroundColor: n.colors.card,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: n.colors.borderHighlight,
  },
  autoFetchBtnDisabled: { opacity: 0.5 },
  autoFetchBtnText: { color: n.colors.accent, fontSize: 13, fontWeight: '600' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  switchLabel: {
    color: n.colors.textPrimary,
    fontWeight: '600',
    fontSize: 15,
    marginBottom: 2,
  },
  testBtn: {
    marginTop: 12,
    backgroundColor: n.colors.card,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: n.colors.borderHighlight,
  },
  testBtnText: { color: n.colors.accent, fontWeight: '600', fontSize: 14 },
  providerRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    backgroundColor: n.colors.surface,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  providerIndex: {
    color: n.colors.textMuted,
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
    backgroundColor: n.colors.background,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  providerActionBtnDisabled: { opacity: 0.25 },
  providerActionBtnPressed: { backgroundColor: n.colors.card },
  saveBtn: {
    backgroundColor: 'rgba(109,153,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(130,170,255,0.24)',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row' as const,
    marginTop: 8,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: n.colors.textPrimary, fontWeight: '800', fontSize: 17 },
  backupRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  backupBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  backupBtnText: { color: n.colors.accent, fontWeight: '700', fontSize: 14 },
  backupDate: {
    color: n.colors.textMuted,
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
  frequencyChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: n.colors.background,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  frequencyChipActive: {
    backgroundColor: n.colors.borderHighlight,
    borderColor: n.colors.accent,
  },
  frequencyChipText: {
    fontSize: 13,
    color: n.colors.textMuted,
    fontWeight: '500',
  },
  frequencyChipTextActive: {
    color: n.colors.accent,
    fontWeight: '700',
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
    backgroundColor: n.colors.background,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  freqBtnActive: {
    backgroundColor: n.colors.primaryTintSoft,
    borderColor: n.colors.accent,
  },
  freqText: { color: n.colors.textSecondary, fontSize: 12, fontWeight: '600' },
  freqTextActive: { color: n.colors.accent, fontWeight: '700' },
  footer: {
    color: n.colors.borderLight,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 18,
  },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  typeChip: {
    backgroundColor: n.colors.background,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: n.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeChipBlocked: {
    backgroundColor: n.colors.errorSurface,
    borderColor: 'rgba(241,76,76,0.08)',
  },
  typeChipLocked: { borderColor: n.colors.borderHighlight, opacity: 0.5 },
  typeChipText: { color: n.colors.textPrimary, fontSize: 13, fontWeight: '600' },
  typeChipTextBlocked: { color: n.colors.error },
  typeChipX: { color: n.colors.error, fontSize: 11 },
  clearBtn: { marginTop: 10, padding: 10, alignItems: 'center' },
  clearBtnText: { color: n.colors.textMuted, fontSize: 13 },
  maintenanceBtn: {
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  maintenanceBtnText: { color: n.colors.textPrimary, fontWeight: '700', fontSize: 14 },
  dangerBtn: {
    backgroundColor: n.colors.errorSurface,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: n.colors.error,
  },
  dangerBtnText: { color: n.colors.accent, fontWeight: '700', fontSize: 14 },
  modelSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: n.colors.background,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: n.colors.border,
    marginBottom: 8,
  },
  modelSelectorText: { color: n.colors.textPrimary, fontSize: 14, fontWeight: '600' },
  modelSelectorArrow: { color: n.colors.textMuted, fontSize: 12 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '60%',
  },
  modalTitle: {
    color: n.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: n.spacing.lg,
    textAlign: 'center',
  },
  modelItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: n.colors.borderLight,
  },
  modelItemActive: {
    backgroundColor: n.colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 0,
  },
  modelItemText: { color: n.colors.textSecondary, fontSize: 15 },
  modelItemTextActive: { color: n.colors.accent, fontWeight: '700' },
  checkMark: { color: n.colors.accent, fontWeight: 'bold' },
  closeBtn: {
    marginTop: n.spacing.lg,
    padding: 14,
    alignItems: 'center',
    backgroundColor: n.colors.border,
    borderRadius: 12,
  },
  closeBtnText: { color: n.colors.textPrimary, fontWeight: '600' },
  // Diagnostics
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: n.colors.border,
  },
  permLabel: { color: n.colors.textPrimary, fontSize: 14, fontWeight: '600' },
  permStatus: { fontSize: 12, marginTop: 2 },
  permOk: { color: n.colors.success },
  permError: { color: n.colors.error },
  fixBtn: {
    backgroundColor: n.colors.primaryTintSoft,
    borderWidth: 1,
    borderColor: n.colors.accent,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  fixBtnText: { color: n.colors.accent, fontSize: 12, fontWeight: '800' },
  diagBtn: { marginTop: 12, alignItems: 'center', padding: 10 },
  diagBtnText: { color: n.colors.textMuted, fontSize: 13, textDecorationLine: 'underline' },
  // Dropdown styles
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: n.colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: n.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 6,
    marginBottom: 8,
  },
  dropdownValue: {
    color: n.colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    flex: 1,
  },
  dropdownArrow: { color: n.colors.textMuted, fontSize: 16, marginLeft: 8 },
  dropdownBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  dropdownSheet: {
    borderRadius: 16,
    paddingVertical: 12,
    maxHeight: '80%',
  },
  dropdownSheetTitle: {
    color: n.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: n.colors.border,
  },
  dropdownGroupLabel: {
    color: n.colors.accent,
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
  dropdownItemActive: { backgroundColor: n.colors.primaryTintSoft },
  dropdownItemText: { color: n.colors.textPrimary, fontSize: 14, lineHeight: 20, flex: 1 },
  dropdownItemTextActive: { color: n.colors.accent, fontWeight: '700' },
  dropdownCheck: { color: n.colors.accent, fontSize: 16, fontWeight: '700', marginLeft: 8 },
});
