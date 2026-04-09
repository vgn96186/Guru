import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  Switch,
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
import {
  showDialog,
  showInfo,
  showSuccess,
  showWarning,
  showError,
  confirm,
  confirmDestructive,
} from '../components/dialogService';
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
import AccountSections from './settings/sections/AccountSections';
import StudySections from './settings/sections/StudySections';
import StorageSections from './settings/sections/StorageSections';
import AiProvidersSection from './settings/sections/AiProvidersSection';
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
    showSuccess('Backup saved', `File written to:\n${filePath}`);
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
    return { ok: false, message: 'Invalid backup format â€” missing required fields' };
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
  /** Only in memory / SecureStore â€” never loaded from backup (confidential OAuth secret). */
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
      showWarning('No key', 'Enter a Groq API key first.');
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
      showWarning('Not connected', 'Connect Qwen OAuth first to validate the connection.');
      return;
    }
    setTestingQwenKey(true);
    setQwenKeyTestResult(null);
    try {
      const tokenResult = await getQwenAccessToken();
      if (!tokenResult || !tokenResult.accessToken) {
        setQwenKeyTestResult('fail');
        showError('No OAuth token available. Try reconnecting Qwen.');
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
        showError(res.message || 'Qwen API returned an error.');
      }
    } catch (err: any) {
      setQwenKeyTestResult('fail');
      showError(err.message || 'Unknown error');
    }
    setTestingQwenKey(false);
  }

  async function testGithubModelsPat() {
    const pat = githubModelsPat.trim() || profile?.githubModelsPat || '';
    if (!pat) {
      showWarning('No token', 'Enter a GitHub personal access token with Models access first.');
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
      showWarning('No key', 'Enter an OpenRouter API key first.');
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
      showWarning('No key', 'Enter a DeepSeek API key first.');
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
      showWarning('No key', 'Enter an AgentRouter key first.');
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
      showWarning('No token', 'Enter a Hugging Face token first.');
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
      showWarning('No key', 'Enter a Deepgram API key first.');
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
        showSuccess(
          'Connected',
          `ChatGPT ${slot === 'primary' ? 'primary' : 'secondary'} account is now linked to Guru.`,
        );
        return;
      }
      throw new Error('Device code expired. Please try again.');
    } catch (err: any) {
      showError(err, 'Unknown error');
      setChatgptDeviceCode(null);
      setChatgptConnectingSlot(null);
    }
  }

  async function disconnectChatGpt(slot: ChatGptAccountSlot) {
    const ok = await confirmDestructive(
      'Disconnect ChatGPT?',
      'This will remove stored tokens for this account slot.',
      { confirmLabel: 'Disconnect' },
    );
    if (!ok) return;
    await clearTokens(slot);
    const nextAccounts = sanitizeChatGptAccountSettings(chatgptAccounts);
    nextAccounts[slot] = { ...nextAccounts[slot], connected: false };
    await updateUserProfile({
      chatgptAccounts: nextAccounts,
      chatgptConnected: isChatGptEnabled(nextAccounts),
    });
    setChatgptAccounts(nextAccounts);
    refreshProfile();
  }

  // â”€â”€ GitHub Copilot OAuth â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        showSuccess('Connected', 'GitHub Copilot is now linked to Guru.');
        return;
      }
      throw new Error('Device code expired. Please try again.');
    } catch (err: any) {
      showError(err, 'Unknown error');
      setGithubCopilotDeviceCode(null);
      setGithubCopilotConnecting(false);
    }
  }

  async function disconnectGitHubCopilot() {
    const ok = await confirmDestructive(
      'Disconnect GitHub Copilot?',
      'This will remove stored tokens.',
      { confirmLabel: 'Disconnect' },
    );
    if (!ok) return;
    invalidateCopilotSessionToken();
    await clearGitHubTokens();
    await updateUserProfile({ githubCopilotConnected: false });
    setGithubCopilotConnected(false);
    setGithubCopilotOAuthTestResult(null);
    refreshProfile();
  }

  async function validateGitHubCopilotConnection() {
    const log = '[SETTINGS_VALIDATE][github_copilot]';
    console.info(`${log} Starting OAuth + api.githubcopilot.com probeâ€¦`);
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
        showWarning(
          'GitHub Copilot validate',
          `${msg}\n\nMetro: search ${log} for full details.\nIf the app shows Connected but this fails, Disconnect and sign in again.`,
        );
        return;
      }
      const res = await testGitHubCopilotConnection(token);
      console.info(`${log} HTTP ${res.status} ok=${res.ok}`, res.message?.slice(0, 400) ?? '');
      setGithubCopilotOAuthTestResult(res.ok ? 'ok' : 'fail');
      if (res.ok) {
        showSuccess(
          'GitHub Copilot validate',
          `OK â€” HTTP ${res.status}. Copilot API accepted a minimal chat request.\n\nMetro logs: ${log}`,
        );
      } else {
        showWarning(
          'GitHub Copilot validate',
          `HTTP ${res.status}\n${(res.message ?? '').slice(0, 480)}\n\nMetro: ${log}`,
        );
      }
    } finally {
      setTestingGitHubCopilotOAuth(false);
    }
  }

  // â”€â”€ GitLab Duo OAuth â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function connectGitLabDuo() {
    if (usesDefaultGitLabClientId(gitlabOauthClientId)) {
      showInfo(
        'GitLab Application ID required',
        `Paste your OAuth Application ID in the field above (GitLab â†’ Preferences â†’ Applications), or set EXPO_PUBLIC_GITLAB_CLIENT_ID for your build.\n\nScopes: read_user, api (same as OpenCode GitLab Duo â€” enables AI Gateway).\nReconnect if you previously used ai_features only.\nRedirect URI must match exactly:\n${getRedirectUri()}`,
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
      showInfo(
        'Sign in with GitLab',
        'Finish in the browser. The app should reopen automatically when authorization completes. If it does not, use "Paste callback URL" below with the full guru-study:// link.',
      );
    } catch (err: any) {
      showError(err, 'Unknown error');
    } finally {
      setGitlabDuoConnecting(false);
    }
  }

  async function submitGitLabPasteUrl() {
    const raw = gitlabPasteUrl.trim();
    if (!raw) {
      showWarning('Empty', 'Paste the full callback URL (guru-study://oauth/gitlab?...).');
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
    const ok = await confirmDestructive(
      'Disconnect GitLab Duo?',
      'This will remove stored tokens.',
      { confirmLabel: 'Disconnect' },
    );
    if (!ok) return;
    await clearGitLabTokens();
    await updateUserProfile({ gitlabDuoConnected: false });
    setGitlabDuoConnected(false);
    setGitlabDuoOAuthTestResult(null);
    refreshProfile();
  }

  async function validateGitLabDuoConnection() {
    const log = '[SETTINGS_VALIDATE][gitlab_duo]';
    const instance = getGitLabInstanceUrl();
    console.info(
      `${log} Starting OAuth + ${instance}/api/v4/ai/third_party_agents/direct_access probeâ€¦`,
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
        showWarning('GitLab Duo validate', `${msg}\n\nMetro: search ${log} for details.`);
        return;
      }
      const res = await testGitLabDuoConnection(token);
      console.info(`${log} HTTP ${res.status} ok=${res.ok}`, res.message?.slice(0, 400) ?? '');
      setGitlabDuoOAuthTestResult(res.ok ? 'ok' : 'fail');
      if (res.ok) {
        showSuccess(
          'GitLab Duo validate',
          `OK â€” HTTP ${res.status}. OpenCode-style direct_access (AI Gateway) accepted the token.\n\nMetro: ${log}`,
        );
      } else {
        showWarning(
          'GitLab Duo validate',
          `HTTP ${res.status}\n${(res.message ?? '').slice(0, 480)}\n\n403/404: need Premium/Ultimate Duo, OAuth scopes read_user+api (reconnect), or self-managed Duo + Agent Platform. Metro: ${log}`,
        );
      }
    } finally {
      setTestingGitLabDuoOAuth(false);
    }
  }

  // â”€â”€ Poe OAuth â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        showSuccess('Connected', 'Poe is now linked to Guru.');
        return;
      }
      throw new Error('Device code expired. Please try again.');
    } catch (err: any) {
      showError(err, 'Unknown error');
      setPoeDeviceCode(null);
      setPoeConnecting(false);
    }
  }

  async function disconnectPoe() {
    const ok = await confirmDestructive('Disconnect Poe?', 'This will remove stored tokens.', {
      confirmLabel: 'Disconnect',
    });
    if (!ok) return;
    await clearPoeTokens();
    await updateUserProfile({ poeConnected: false });
    setPoeConnected(false);
    refreshProfile();
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
        showSuccess('Connected', 'Qwen OAuth is now active. Free tier: 1,000 requests/day.');
      }
    } catch (err: any) {
      showError(err, 'Unknown error');
      setQwenDeviceCode(null);
      setQwenConnecting(false);
    }
  }

  async function disconnectQwen() {
    const ok = await confirmDestructive('Disconnect Qwen?', 'This will remove stored tokens.', {
      confirmLabel: 'Disconnect',
    });
    if (!ok) return;
    await clearQwenTokens();
    await updateUserProfile({ qwenConnected: false });
    setQwenConnected(false);
    refreshProfile();
  }

  async function testGeminiKey() {
    const key = geminiKey.trim() || profile?.geminiKey || '';
    if (!key) {
      showWarning('No key', 'Enter a Google AI (Gemini) API key first.');
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
      showWarning(
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
      showWarning('No key', 'Enter a fal API key first.');
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
      showWarning('No key', 'Enter a Brave Search API key first.');
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
      showWarning('No key', 'Enter a Google Custom Search API key first.');
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
        `âœ… Fetched: INICET ${dates.inicetDate} Â· NEET-PG ${dates.neetDate}. Verify and save.`,
      );
    } catch (e: any) {
      setFetchDatesMsg(`âŒ ${e?.message || 'Could not fetch dates. Try manually.'}`);
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

  async function onRequestNotifications() {
    await Notifications.requestPermissionsAsync();
    checkPermissions();
  }

  async function onRequestMic() {
    await Audio.requestPermissionsAsync();
    checkPermissions();
  }

  async function onRequestLocalFiles() {
    await PermissionsAndroid.request(LOCAL_FILE_ACCESS_PERMISSION);
    checkPermissions();
  }

  async function onRequestOverlay() {
    await requestOverlayPermission();
    showInfo(
      'Overlay Permission',
      'Please enable Guru in the settings screen that just opened, then return to the app.',
    );
  }

  function onOpenSystemSettings() {
    Linking.openSettings();
  }

  function onOpenDevConsole() {
    const { devConsole } = require('../components/DevConsole');
    devConsole.show();
  }

  async function requestPomodoroOverlay() {
    await requestOverlayPermission();
    await checkPermissions();
  }

  async function signInToGDrive(clientId: string) {
    const { signInToGDrive: _signIn } = await import('../services/gdriveBackupService');
    return _signIn(clientId);
  }

  async function signOutGDrive() {
    const { signOutGDrive: _signOut } = await import('../services/gdriveBackupService');
    return _signOut();
  }

  // â"€â"€ Profile â†' local state hydration â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â”€
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

  // â”€â”€ Debounced auto-save â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      showSuccess('Done', 'Notifications scheduled! Check your notification panel.');
    } catch (e) {
      showError('Error', 'Could not schedule notifications.');
    }
  }

  const handleSelectBackupDir = async () => {
    if (Platform.OS !== 'android') {
      showWarning('Not supported', 'This feature is only available on Android.');
      return;
    }
    try {
      const { StorageAccessFramework } = await import('expo-file-system/legacy');
      const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (permissions.granted) {
        await updateUserProfile({ backupDirectoryUri: permissions.directoryUri } as any);
        await refreshProfile();
        showSuccess(
          'Success',
          'Backup directory configured! Your data will now stay synced there.',
        );
      }
    } catch (err) {
      showError('Error', 'Failed to configure backup directory.');
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
      if (count > 0) {
        showSuccess(labels.done, `${count} item(s) processed.`);
      } else {
        showInfo(labels.none, 'Nothing needed fixing.');
      }
    } catch (err) {
      showError(labels.failed, err instanceof Error ? err.message : 'Unknown error');
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

          <AiProvidersSection
            styles={styles}
            SectionToggle={SectionToggle}
            SubSectionToggle={SubSectionToggle}
            navigation={navigation}
            profile={profile}
            liveGuruChatModels={liveGuruChatModels}
            formatGuruChatModelChipLabel={formatGuruChatModelChipLabel}
            guruChatDefaultModel={guruChatDefaultModel}
            setGuruChatDefaultModel={setGuruChatDefaultModel}
            guruMemoryNotes={guruMemoryNotes}
            setGuruMemoryNotes={setGuruMemoryNotes}
            chatgptConnectingSlot={chatgptConnectingSlot}
            chatgptDeviceCode={chatgptDeviceCode}
            chatgptAccounts={chatgptAccounts}
            setChatgptAccounts={setChatgptAccounts}
            disconnectChatGpt={disconnectChatGpt}
            connectChatGpt={connectChatGpt}
            githubCopilotConnecting={githubCopilotConnecting}
            githubCopilotDeviceCode={githubCopilotDeviceCode}
            githubCopilotConnected={githubCopilotConnected}
            githubCopilotOAuthTestResult={githubCopilotOAuthTestResult}
            validateGitHubCopilotConnection={validateGitHubCopilotConnection}
            testingGitHubCopilotOAuth={testingGitHubCopilotOAuth}
            disconnectGitHubCopilot={disconnectGitHubCopilot}
            connectGitHubCopilot={connectGitHubCopilot}
            githubCopilotPreferredModel={githubCopilotPreferredModel}
            setGithubCopilotPreferredModel={setGithubCopilotPreferredModel}
            gitlabOauthClientId={gitlabOauthClientId}
            setGitlabOauthClientId={setGitlabOauthClientId}
            gitlabOauthClientSecret={gitlabOauthClientSecret}
            setGitlabOauthClientSecret={setGitlabOauthClientSecret}
            gitlabDuoConnected={gitlabDuoConnected}
            gitlabDuoOAuthTestResult={gitlabDuoOAuthTestResult}
            validateGitLabDuoConnection={validateGitLabDuoConnection}
            testingGitLabDuoOAuth={testingGitLabDuoOAuth}
            gitlabDuoConnecting={gitlabDuoConnecting}
            disconnectGitLabDuo={disconnectGitLabDuo}
            connectGitLabDuo={connectGitLabDuo}
            setGitlabPasteModalVisible={setGitlabPasteModalVisible}
            gitlabDuoPreferredModel={gitlabDuoPreferredModel}
            setGitlabDuoPreferredModel={setGitlabDuoPreferredModel}
            gitlabPasteModalVisible={gitlabPasteModalVisible}
            gitlabPasteUrl={gitlabPasteUrl}
            setGitlabPasteUrl={setGitlabPasteUrl}
            submitGitLabPasteUrl={submitGitLabPasteUrl}
            gitlabPasteSubmitting={gitlabPasteSubmitting}
            poeConnecting={poeConnecting}
            poeDeviceCode={poeDeviceCode}
            poeConnected={poeConnected}
            disconnectPoe={disconnectPoe}
            connectPoe={connectPoe}
            qwenConnecting={qwenConnecting}
            qwenDeviceCode={qwenDeviceCode}
            qwenConnected={qwenConnected}
            connectQwen={connectQwen}
            disconnectQwen={disconnectQwen}
            groqKey={groqKey}
            setGroqKey={setGroqKey}
            setGroqKeyTestResult={setGroqKeyTestResult}
            clearProviderValidated={clearProviderValidated}
            groqValidationStatus={groqValidationStatus}
            testGroqKey={testGroqKey}
            testingGroqKey={testingGroqKey}
            githubModelsPat={githubModelsPat}
            setGithubModelsPat={setGithubModelsPat}
            setGithubPatTestResult={setGithubPatTestResult}
            githubValidationStatus={githubValidationStatus}
            testGithubModelsPat={testGithubModelsPat}
            testingGithubPat={testingGithubPat}
            orKey={orKey}
            setOrKey={setOrKey}
            setOpenRouterKeyTestResult={setOpenRouterKeyTestResult}
            openRouterValidationStatus={openRouterValidationStatus}
            testOpenRouterKey={testOpenRouterKey}
            testingOpenRouterKey={testingOpenRouterKey}
            kiloApiKey={kiloApiKey}
            setKiloApiKey={setKiloApiKey}
            setKiloKeyTestResult={setKiloKeyTestResult}
            kiloValidationStatus={kiloValidationStatus}
            testKiloKey={testKiloKey}
            testingKiloKey={testingKiloKey}
            deepseekKey={deepseekKey}
            setDeepseekKey={setDeepseekKey}
            setDeepseekKeyTestResult={setDeepseekKeyTestResult}
            deepseekValidationStatus={deepseekValidationStatus}
            testDeepseekKey={testDeepseekKey}
            testingDeepseekKey={testingDeepseekKey}
            agentRouterKey={agentRouterKey}
            setAgentRouterKey={setAgentRouterKey}
            setAgentRouterKeyTestResult={setAgentRouterKeyTestResult}
            agentRouterValidationStatus={agentRouterValidationStatus}
            testAgentRouterKey={testAgentRouterKey}
            testingAgentRouterKey={testingAgentRouterKey}
            geminiKey={geminiKey}
            setGeminiKey={setGeminiKey}
            setGeminiKeyTestResult={setGeminiKeyTestResult}
            geminiValidationStatus={geminiValidationStatus}
            testGeminiKey={testGeminiKey}
            testingGeminiKey={testingGeminiKey}
            preferGeminiStructuredJson={preferGeminiStructuredJson}
            setPreferGeminiStructuredJson={setPreferGeminiStructuredJson}
            deepgramApiKey={deepgramApiKey}
            setDeepgramApiKey={setDeepgramApiKey}
            setDeepgramKeyTestResult={setDeepgramKeyTestResult}
            deepgramValidationStatus={deepgramValidationStatus}
            testDeepgramKey={testDeepgramKey}
            testingDeepgramKey={testingDeepgramKey}
            cfAccountId={cfAccountId}
            setCfAccountId={setCfAccountId}
            setCloudflareTestResult={setCloudflareTestResult}
            cloudflareValidationStatus={cloudflareValidationStatus}
            testCloudflareKeys={testCloudflareKeys}
            testingCloudflare={testingCloudflare}
            cfApiToken={cfApiToken}
            setCfApiToken={setCfApiToken}
            providerOrder={providerOrder}
            moveProvider={moveProvider}
            updateUserProfile={updateUserProfile}
            refreshProfile={refreshProfile}
            falApiKey={falApiKey}
            setFalApiKey={setFalApiKey}
            setFalKeyTestResult={setFalKeyTestResult}
            falValidationStatus={falValidationStatus}
            testFalKey={testFalKey}
            testingFalKey={testingFalKey}
            braveSearchApiKey={braveSearchApiKey}
            setBraveSearchApiKey={setBraveSearchApiKey}
            setBraveSearchKeyTestResult={setBraveSearchKeyTestResult}
            braveValidationStatus={braveValidationStatus}
            testBraveSearchKey={testBraveSearchKey}
            testingBraveSearchKey={testingBraveSearchKey}
            imageGenerationOptions={imageGenerationOptions}
            imageGenerationModel={imageGenerationModel}
            setImageGenerationModel={setImageGenerationModel}
            localAiEnabled={localAiEnabled}
            localLlmReady={localLlmReady}
            localLlmFileName={localLlmFileName}
            localWhisperReady={localWhisperReady}
            localWhisperFileName={localWhisperFileName}
            localLlmAllowed={localLlmAllowed}
            localLlmWarning={localLlmWarning}
          />
          <AccountSections
            styles={styles}
            SectionToggle={SectionToggle}
            navigation={navigation}
            permStatus={permStatus}
            onRequestNotifications={onRequestNotifications}
            onRequestMic={onRequestMic}
            onRequestLocalFiles={onRequestLocalFiles}
            onRequestOverlay={onRequestOverlay}
            onOpenSystemSettings={onOpenSystemSettings}
            onOpenDevConsole={onOpenDevConsole}
            name={name}
            setName={setName}
            inicetDate={inicetDate}
            setInicetDate={setInicetDate}
            neetDate={neetDate}
            setNeetDate={setNeetDate}
            handleAutoFetchDates={handleAutoFetchDates}
            fetchingDates={fetchingDates}
            fetchDatesMsg={fetchDatesMsg}
          />

          <StudySections
            styles={styles}
            SectionToggle={SectionToggle}
            dbmciClassStartDate={dbmciClassStartDate}
            setDbmciClassStartDate={setDbmciClassStartDate}
            btrStartDate={btrStartDate}
            setBtrStartDate={setBtrStartDate}
            homeNoveltyCooldownHours={homeNoveltyCooldownHours}
            setHomeNoveltyCooldownHours={setHomeNoveltyCooldownHours}
            sessionLength={sessionLength}
            setSessionLength={setSessionLength}
            dailyGoal={dailyGoal}
            setDailyGoal={setDailyGoal}
            strictMode={strictMode}
            setStrictMode={setStrictMode}
            notifs={notifs}
            setNotifs={setNotifs}
            notifHour={notifHour}
            setNotifHour={setNotifHour}
            guruFrequency={guruFrequency}
            setGuruFrequency={setGuruFrequency}
            testNotification={testNotification}
            bodyDoubling={bodyDoubling}
            setBodyDoubling={setBodyDoubling}
            blockedTypes={blockedTypes}
            setBlockedTypes={setBlockedTypes}
            subjects={subjects}
            focusSubjectIds={focusSubjectIds}
            setFocusSubjectIds={setFocusSubjectIds}
            idleTimeout={idleTimeout}
            setIdleTimeout={setIdleTimeout}
            breakDuration={breakDuration}
            setBreakDuration={setBreakDuration}
            pomodoroEnabled={pomodoroEnabled}
            setPomodoroEnabled={setPomodoroEnabled}
            pomodoroLectureQuizReady={pomodoroLectureQuizReady}
            hasPomodoroOverlayPermission={hasPomodoroOverlayPermission}
            hasPomodoroGroqKey={hasPomodoroGroqKey}
            hasPomodoroDeepgramKey={hasPomodoroDeepgramKey}
            requestPomodoroOverlay={requestPomodoroOverlay}
            pomodoroInterval={pomodoroInterval}
            setPomodoroInterval={setPomodoroInterval}
          />

          <StorageSections
            styles={styles}
            SectionToggle={SectionToggle}
            profile={profile}
            backupBusy={backupBusy}
            setBackupBusy={setBackupBusy}
            refreshProfile={refreshProfile}
            clearAiCache={clearAiCache}
            resetStudyProgress={resetStudyProgress}
            exportUnifiedBackup={exportUnifiedBackup}
            importUnifiedBackup={importUnifiedBackup}
            updateUserProfile={updateUserProfile}
            autoBackupFrequency={autoBackupFrequency}
            setAutoBackupFrequency={setAutoBackupFrequency}
            runAutoBackup={runAutoBackup}
            cleanupOldBackups={cleanupOldBackups}
            profileRepository={profileRepository}
            gdriveWebClientId={gdriveWebClientId}
            setGdriveWebClientId={setGdriveWebClientId}
            GOOGLE_WEB_CLIENT_ID={GOOGLE_WEB_CLIENT_ID}
            signInToGDrive={signInToGDrive}
            signOutGDrive={signOutGDrive}
            maintenanceBusy={maintenanceBusy}
            runMaintenanceTask={runMaintenanceTask}
            getUserProfile={getUserProfile}
          />

          {saving && (
            <View style={[styles.saveBtn, styles.saveBtnDisabled]}>
              <ActivityIndicator size="small" color={n.colors.textPrimary} />
              <LinearText style={[styles.saveBtnText, { marginLeft: 8 }]}>
                Auto-savingâ€¦
              </LinearText>
            </View>
          )}

          <LinearText style={styles.footer}>Guru AI Â· v1.0.0</LinearText>
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
          {isOk ? 'âœ“ Active' : status === 'denied' ? 'âœ— Disabled' : 'â—‹ Not Set'}
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

/** Dropdown picker for model selection â€” replaces congested chip rows. */
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
        <LinearText style={styles.dropdownArrow}>â–¾</LinearText>
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
                      {value === opt.id && (
                        <LinearText style={styles.dropdownCheck}>âœ“</LinearText>
                      )}
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
