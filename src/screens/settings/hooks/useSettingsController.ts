import { useState, useEffect, useRef, useCallback } from 'react';
import { Linking, useWindowDimensions } from 'react-native';
import {
  useNavigation,
  useIsFocused,
  type CompositeNavigationProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MenuStackParamList, RootStackParamList } from '../../../navigation/types';
import {
  showInfo,
  showSuccess,
  showWarning,
  showError,
  confirmDestructive,
} from '../../../components/dialogService';
import {
  useProfileQuery,
  useRefreshProfile,
  PROFILE_QUERY_KEY,
} from '../../../hooks/queries/useProfile';
import { queryClient } from '../../../services/queryClient';
import {
  updateUserProfile,
  getUserProfile,
  resetStudyProgress,
  clearAiCache,
} from '../../../db/queries/progress';
import { getAllSubjects } from '../../../db/queries/topics';
import {
  requestNotificationPermissions,
  refreshAccountabilityNotifications,
} from '../../../services/notificationService';
import {
  testGitHubCopilotConnection,
  testGitLabDuoConnection,
} from '../../../services/ai/providerHealth';
import type { ChatGptAccountSlot, ContentType, Subject, UserProfile } from '../../../types';
import { PROVIDER_DISPLAY_NAMES } from '../../../types';
import { sanitizeProviderOrder } from '../../../utils/providerOrder';
import { sanitizeActionHubTools } from '../../../utils/actionHubTools';
import {
  requestDeviceCode,
  pollForAuthorization,
  exchangeForTokens,
  saveTokens,
  clearTokens,
  VERIFICATION_URL,
  type DeviceCodeResponse,
} from '../../../services/ai/chatgpt';
import {
  requestDeviceCode as requestGitHubDeviceCode,
  pollForToken as pollGitHubToken,
  saveTokens as saveGitHubTokens,
  clearTokens as clearGitHubTokens,
  getValidAccessToken as getGitHubCopilotAccessToken,
  VERIFICATION_URL as GITHUB_VERIFICATION_URL,
  invalidateCopilotSessionToken,
} from '../../../services/ai/github';
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
} from '../../../services/ai/gitlab';
import {
  requestDeviceCode as requestPoeDeviceCode,
  pollForToken as pollPoeToken,
  saveTokens as savePoeTokens,
  clearTokens as clearPoeTokens,
  VERIFICATION_URL as POE_VERIFICATION_URL,
} from '../../../services/ai/poe';
import {
  requestDeviceCode as requestQwenDeviceCode,
  pollForToken as pollQwenToken,
  saveQwenTokens,
  clearQwenTokens,
} from '../../../services/ai/qwen';
import {
  DEFAULT_HF_TRANSCRIPTION_MODEL,
  DEFAULT_INICET_DATE,
  DEFAULT_IMAGE_GENERATION_MODEL,
  DEFAULT_NEET_DATE,
  GOOGLE_WEB_CLIENT_ID,
  normalizeImageGenerationModel,
} from '../../../config/appConfig';
import { useLiveGuruChatModels } from '../../../hooks/useLiveGuruChatModels';
import {
  exportUnifiedBackup,
  importUnifiedBackup,
  runAutoBackup,
  cleanupOldBackups,
  type AutoBackupFrequency,
} from '../../../services/unifiedBackupService';
import { profileRepository } from '../../../db/repositories';
import { type SettingsCategory } from '../../../types';
import {
  sanitizeGithubCopilotPreferredModel,
  sanitizeGitlabDuoPreferredModel,
  defaultChatGptAccountSettings,
  sanitizeChatGptAccountSettings,
  isChatGptEnabled,
  sanitizeApiValidationState,
} from '../utils';
import { type ChatGptAccountSettings } from '../types';
import { useSettingsPermissions } from './useSettingsPermissions';
import { useApiKeyTesting } from './useApiKeyTesting';
import { useSettingsDerivedStatus } from './useSettingsDerivedStatus';
import { useSettingsSummaryState } from './useSettingsSummaryState';
import { useProviderApiKeyTests } from './useProviderApiKeyTests';
import { useProviderReadyCount } from './useProviderReadyCount';
import { useSettingsCategoryBadges } from './useSettingsCategoryBadges';
import { getSettingsCategoryMeta } from '../settingsCategoryMeta';

export function useSettingsController() {
  const navigation =
    useNavigation<
      CompositeNavigationProp<
        NativeStackNavigationProp<MenuStackParamList, 'Settings'>,
        NativeStackNavigationProp<RootStackParamList>
      >
    >();
  const { width } = useWindowDimensions();
  const isTabletLayout = width >= 980;
  const isFocused = useIsFocused();
  const { data: profile } = useProfileQuery();
  const refreshProfile = useRefreshProfile();
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('dashboard');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const toggleExpandedSection = useCallback((id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const {
    permStatus,
    checkPermissions,
    onRequestNotifications,
    onRequestMic,
    onRequestLocalFiles,
    onRequestOverlay,
    requestPomodoroOverlay,
  } = useSettingsPermissions();

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
  const [autoRepairLegacyNotes, setAutoRepairLegacyNotes] = useState(false);
  const [scanOrphanedTranscripts, setScanOrphanedTranscripts] = useState(false);
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
  const [loadingOrbStyle, setLoadingOrbStyle] = useState<'classic' | 'turbulent'>('turbulent');

  const apiKeyTesting = useApiKeyTesting();
  const {
    apiValidation,
    setApiValidation,
    markProviderValidated,
    clearProviderValidated,
    resolveValidationStatus,
    testingGroqKey,
    setTestingGroqKey,
    groqKeyTestResult,
    setGroqKeyTestResult,
    _setTestingQwenKey,
    _setQwenKeyTestResult,
    testingGithubPat,
    setTestingGithubPat,
    githubPatTestResult,
    setGithubPatTestResult,
    testingOpenRouterKey,
    setTestingOpenRouterKey,
    openRouterKeyTestResult,
    setOpenRouterKeyTestResult,
    _setTestingHuggingFaceToken,
    _setHuggingFaceTokenTestResult,
    testingGeminiKey,
    setTestingGeminiKey,
    geminiKeyTestResult,
    setGeminiKeyTestResult,
    testingCloudflare,
    setTestingCloudflare,
    cloudflareTestResult,
    setCloudflareTestResult,
    testingVertexKey,
    setTestingVertexKey,
    vertexKeyTestResult,
    setVertexKeyTestResult,
    testingFalKey,
    setTestingFalKey,
    falKeyTestResult,
    setFalKeyTestResult,
    testingBraveSearchKey,
    setTestingBraveSearchKey,
    braveSearchKeyTestResult,
    setBraveSearchKeyTestResult,
    _setTestingGoogleCustomSearchKey,
    googleCustomSearchKeyTestResult,
    setGoogleCustomSearchKeyTestResult,
    testingKiloKey,
    setTestingKiloKey,
    kiloKeyTestResult,
    setKiloKeyTestResult,
    testingDeepseekKey,
    setTestingDeepseekKey,
    deepseekKeyTestResult,
    setDeepseekKeyTestResult,
    testingAgentRouterKey,
    setTestingAgentRouterKey,
    agentRouterKeyTestResult,
    setAgentRouterKeyTestResult,
    testingDeepgramKey,
    setTestingDeepgramKey,
    deepgramKeyTestResult,
    setDeepgramKeyTestResult,
    testingGitHubCopilotOAuth,
    setTestingGitHubCopilotOAuth,
    githubCopilotOAuthTestResult,
    setGithubCopilotOAuthTestResult,
    testingGitLabDuoOAuth,
    setTestingGitLabDuoOAuth,
    gitlabDuoOAuthTestResult,
    setGitlabDuoOAuthTestResult,
  } = apiKeyTesting;
  const [githubModelsPat, setGithubModelsPat] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [cfAccountId, setCfAccountId] = useState('');
  const [cfApiToken, setCfApiToken] = useState('');
  const [vertexAiProject, setVertexAiProject] = useState('');
  const [vertexAiLocation, setVertexAiLocation] = useState('');
  const [vertexAiToken, setVertexAiToken] = useState('');
  const [falApiKey, setFalApiKey] = useState('');
  const [braveSearchApiKey, setBraveSearchApiKey] = useState('');
  const [googleCustomSearchApiKey, setGoogleCustomSearchApiKey] = useState('');
  const [kiloApiKey, setKiloApiKey] = useState('');
  const [deepseekKey, setDeepseekKey] = useState('');
  const [agentRouterKey, setAgentRouterKey] = useState('');
  const [deepgramApiKey, setDeepgramApiKey] = useState('');
  const [chatgptAccounts, setChatgptAccounts] = useState<ChatGptAccountSettings>(
    defaultChatGptAccountSettings(),
  );
  const [chatgptConnectingSlot, setChatgptConnectingSlot] = useState<ChatGptAccountSlot | null>(
    null,
  );
  const [chatgptDeviceCode, setChatgptDeviceCode] = useState<DeviceCodeResponse | null>(null);
  const [githubCopilotConnecting, setGithubCopilotConnecting] = useState(false);
  const [githubCopilotDeviceCode, setGithubCopilotDeviceCode] = useState<Awaited<
    ReturnType<typeof requestGitHubDeviceCode>
  > | null>(null);
  const [githubCopilotConnected, setGithubCopilotConnected] = useState(false);
  const [githubCopilotPreferredModel, setGithubCopilotPreferredModel] = useState('');
  const [gitlabDuoPreferredModel, setGitlabDuoPreferredModel] = useState('');
  const [gitlabDuoConnecting, setGitlabDuoConnecting] = useState(false);
  const [gitlabDuoConnected, setGitlabDuoConnected] = useState(false);
  const [gitlabPasteModalVisible, setGitlabPasteModalVisible] = useState(false);
  const [gitlabPasteUrl, setGitlabPasteUrl] = useState('');
  const [gitlabPasteSubmitting, setGitlabPasteSubmitting] = useState(false);
  const [gitlabOauthClientId, setGitlabOauthClientId] = useState('');
  /** Only in memory / SecureStore - never loaded from backup (confidential OAuth secret). */
  const [gitlabOauthClientSecret, setGitlabOauthClientSecret] = useState('');
  const [poeConnecting, setPoeConnecting] = useState(false);
  const [poeDeviceCode, setPoeDeviceCode] = useState<Awaited<
    ReturnType<typeof requestPoeDeviceCode>
  > | null>(null);
  const [poeConnected, setPoeConnected] = useState(false);
  const [qwenConnecting, setQwenConnecting] = useState(false);
  const [qwenDeviceCode, setQwenDeviceCode] = useState<Awaited<
    ReturnType<typeof requestQwenDeviceCode>
  > | null>(null);
  const [qwenConnected, setQwenConnected] = useState(false);
  const [gdriveWebClientId, setGdriveWebClientId] = useState('');
  const [guruChatDefaultModel, setGuruChatDefaultModel] = useState('auto');
  const [imageGenerationModel, setImageGenerationModel] = useState<string>(
    DEFAULT_IMAGE_GENERATION_MODEL,
  );
  const [imageGenerationOrder, setImageGenerationOrder] = useState<string[]>([]);
  const [transcriptionOrder, setTranscriptionOrder] = useState<string[]>([]);
  const [actionHubTools, setActionHubTools] = useState<string[]>([]);
  const [guruMemoryNotes, setGuruMemoryNotes] = useState('');
  const [preferGeminiStructuredJson, setPreferGeminiStructuredJson] = useState(true);
  const [providerOrder, setProviderOrder] = useState<import('../../../types').ProviderId[]>([]);
  const [disabledProviders, setDisabledProviders] = useState<
    Set<import('../../../types').ProviderId>
  >(new Set());
  const profileHydrationSignatureRef = useRef<string | null>(null);

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

  const {
    testGroqKey,
    testGithubModelsPat,
    testOpenRouterKey,
    testKiloKey,
    testDeepseekKey,
    testAgentRouterKey,
    testVertexKey,
    testDeepgramKey,
    testGeminiKey,
    testCloudflareKeys,
    testFalKey,
    testBraveSearchKey,
  } = useProviderApiKeyTests({
    profile,
    qwenConnected,
    keys: {
      groqKey,
      githubModelsPat,
      openrouterKey: orKey,
      kiloApiKey,
      deepseekKey,
      agentRouterKey,
      huggingFaceToken,
      huggingFaceModel,
      vertexAiProject,
      vertexAiLocation,
      vertexAiToken,
      deepgramApiKey,
      geminiKey,
      cloudflareAccountId: cfAccountId,
      cloudflareApiToken: cfApiToken,
      falApiKey,
      braveSearchApiKey,
      googleCustomSearchApiKey,
    },
    setters: {
      setTestingGroqKey,
      setGroqKeyTestResult,
      setTestingQwenKey: _setTestingQwenKey,
      setQwenKeyTestResult: _setQwenKeyTestResult,
      setTestingGithubPat,
      setGithubPatTestResult,
      setTestingOpenRouterKey,
      setOpenRouterKeyTestResult,
      setTestingKiloKey,
      setKiloKeyTestResult,
      setTestingDeepseekKey,
      setDeepseekKeyTestResult,
      setTestingAgentRouterKey,
      setAgentRouterKeyTestResult,
      setTestingHuggingFaceToken: _setTestingHuggingFaceToken,
      setHuggingFaceTokenTestResult: _setHuggingFaceTokenTestResult,
      setTestingVertexKey,
      setVertexKeyTestResult,
      setTestingDeepgramKey,
      setDeepgramKeyTestResult,
      setTestingGeminiKey,
      setGeminiKeyTestResult,
      setTestingCloudflare,
      setCloudflareTestResult,
      setTestingFalKey,
      setFalKeyTestResult,
      setTestingBraveSearchKey,
      setBraveSearchKeyTestResult,
      setTestingGoogleCustomSearchKey: _setTestingGoogleCustomSearchKey,
      setGoogleCustomSearchKeyTestResult,
    },
    markProviderValidated,
    clearProviderValidated,
  });

  useEffect(() => {
    if (isFocused) {
      checkPermissions();
    }
  }, [isFocused, checkPermissions]);

  async function connectChatGpt(slot: ChatGptAccountSlot) {
    setChatgptConnectingSlot(slot);
    try {
      const dc = await requestDeviceCode();
      setChatgptDeviceCode(dc);
      Linking.openURL(VERIFICATION_URL);

      const pollInterval = (dc.interval || 5) * 1000;
      const deadline = Date.now() + dc.expires_in * 1000;

      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, pollInterval));
        const authResult = await pollForAuthorization(dc.device_auth_id, dc.user_code);
        if (!authResult) continue;

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
    } catch (err: unknown) {
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
    } catch (err: unknown) {
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
    if (__DEV__) {
      console.info(`${log} Starting OAuth + api.githubcopilot.com probe...`);
    }
    setTestingGitHubCopilotOAuth(true);
    setGithubCopilotOAuthTestResult(null);
    try {
      let token: string;
      try {
        token = await getGitHubCopilotAccessToken();
        if (__DEV__) {
          console.info(`${log} Access token OK (chars=${token.length})`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (__DEV__) {
          console.warn(`${log} Token failed:`, msg);
        }
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
          `OK - HTTP ${res.status}. Copilot API accepted a minimal chat request.\n\nMetro logs: ${log}`,
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

  async function connectGitLabDuo() {
    if (usesDefaultGitLabClientId(gitlabOauthClientId)) {
      showInfo(
        'GitLab Application ID required',
        `Paste your OAuth Application ID in the field above (GitLab -> Preferences -> Applications), or set EXPO_PUBLIC_GITLAB_CLIENT_ID for your build.\n\nScopes: read_user, api (same as OpenCode GitLab Duo - enables AI Gateway).\nReconnect if you previously used ai_features only.\nRedirect URI must match exactly:\n${getRedirectUri()}`,
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
    } catch (err: unknown) {
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
        const p = queryClient.getQueryData<UserProfile>(PROFILE_QUERY_KEY);
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
      `${log} Starting OAuth + ${instance}/api/v4/ai/third_party_agents/direct_access probe...`,
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
          `OK - HTTP ${res.status}. OpenCode-style direct_access (AI Gateway) accepted the token.\n\nMetro: ${log}`,
        );
      } else {
        showWarning(
          'GitLab Duo validate',
          `HTTP ${res.status}\n${(res.message ?? '').slice(
            0,
            480,
          )}\n\n403/404: need Premium/Ultimate Duo, OAuth scopes read_user+api (reconnect), or self-managed Duo + Agent Platform. Metro: ${log}`,
        );
      }
    } finally {
      setTestingGitLabDuoOAuth(false);
    }
  }

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
    } catch (err: unknown) {
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
      await Linking.openURL(dc.verification_uri_complete || dc.verification_uri);
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
    } catch (err: unknown) {
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

  function onOpenSystemSettings() {
    Linking.openSettings();
  }

  function onOpenDevConsole() {
    const { devConsole } = require('../../../components/DevConsole');
    devConsole.show();
  }

  async function signInToGDrive(clientId: string) {
    const { signInToGDrive: _signIn } = await import('../../../services/gdriveBackupService');
    return _signIn(clientId);
  }

  async function signOutGDrive() {
    const { signOutGDrive: _signOut } = await import('../../../services/gdriveBackupService');
    return _signOut();
  }

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
        deepgramApiKey: currentProfile.deepgramApiKey ?? '',
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
      setVertexAiProject(profile.vertexAiProject ?? '');
      setVertexAiLocation(profile.vertexAiLocation ?? '');
      setVertexAiToken(profile.vertexAiToken ?? '');
      setFalApiKey(profile.falApiKey ?? '');
      setBraveSearchApiKey(profile.braveSearchApiKey ?? '');
      setGoogleCustomSearchApiKey(profile.googleCustomSearchApiKey ?? '');
      setApiValidation(sanitizeApiValidationState((profile as UserProfile).apiValidation));
      setGuruChatDefaultModel(profile.guruChatDefaultModel ?? 'auto');
      setImageGenerationModel(profile.imageGenerationModel ?? DEFAULT_IMAGE_GENERATION_MODEL);
      setImageGenerationOrder(profile.imageGenerationOrder ?? []);
      setTranscriptionOrder(profile.transcriptionOrder ?? []);
      setActionHubTools(profile.actionHubTools ?? []);
      setGuruMemoryNotes(profile.guruMemoryNotes ?? '');
      setPreferGeminiStructuredJson(profile.preferGeminiStructuredJson !== false);
      setHuggingFaceToken(profile.huggingFaceToken ?? '');
      setHuggingFaceModel(profile.huggingFaceTranscriptionModel ?? DEFAULT_HF_TRANSCRIPTION_MODEL);
      setDeepgramApiKey(profile.deepgramApiKey ?? '');
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
      setAutoBackupFrequency(profile.autoBackupFrequency ?? 'off');
      setAutoRepairLegacyNotes(profile.autoRepairLegacyNotesEnabled ?? false);
      setScanOrphanedTranscripts(profile.scanOrphanedTranscriptsEnabled ?? false);
      setLoadingOrbStyle(profile.loadingOrbStyle ?? 'turbulent');
      profileHydrationSignatureRef.current = nextSignature;
      profileLoaded.current = true;
    }
  }, [buildProfileHydrationSignature, profile, setApiValidation]);

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
        vertexAiProject: vertexAiProject.trim(),
        vertexAiLocation: vertexAiLocation.trim(),
        vertexAiToken: vertexAiToken.trim(),
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
        imageGenerationOrder,
        transcriptionOrder,
        actionHubTools: sanitizeActionHubTools(actionHubTools),
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
        autoRepairLegacyNotesEnabled: autoRepairLegacyNotes,
        scanOrphanedTranscriptsEnabled: scanOrphanedTranscripts,
        loadingOrbStyle,
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
    vertexAiProject,
    vertexAiLocation,
    vertexAiToken,
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
    imageGenerationOrder,
    transcriptionOrder,
    actionHubTools,
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
    autoBackupFrequency,
    autoRepairLegacyNotes,
    scanOrphanedTranscripts,
    loadingOrbStyle,
  ]);

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
    } catch {
      showError('Error', 'Could not schedule notifications.');
    }
  }

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

  const {
    groqValidationStatus,
    githubValidationStatus,
    openRouterValidationStatus,
    kiloValidationStatus,
    deepseekValidationStatus,
    agentRouterValidationStatus,
    geminiValidationStatus,
    deepgramValidationStatus,
    cloudflareValidationStatus,
    vertexValidationStatus,
    falValidationStatus,
    braveValidationStatus,
    hasPomodoroOverlayPermission,
    hasPomodoroGroqKey,
    hasPomodoroDeepgramKey,
  } = useSettingsDerivedStatus({
    profile,
    permStatus,
    resolveValidationStatus,
    keys: {
      groqKey,
      githubModelsPat,
      openrouterKey: orKey,
      kiloApiKey,
      deepseekKey,
      agentRouterKey,
      geminiKey,
      deepgramApiKey,
      cloudflareAccountId: cfAccountId,
      cloudflareApiToken: cfApiToken,
      vertexAiToken,
      falApiKey,
      braveSearchApiKey,
      googleCustomSearchApiKey,
    },
    testResults: {
      groqKeyTestResult,
      githubPatTestResult,
      openRouterKeyTestResult,
      kiloKeyTestResult,
      deepseekKeyTestResult,
      agentRouterKeyTestResult,
      geminiKeyTestResult,
      deepgramKeyTestResult,
      cloudflareTestResult,
      vertexKeyTestResult,
      falKeyTestResult,
      braveSearchKeyTestResult,
      googleCustomSearchKeyTestResult,
    },
  });

  const pomodoroLectureQuizReady =
    hasPomodoroOverlayPermission && hasPomodoroGroqKey && hasPomodoroDeepgramKey;
  const providerReadyCount = useProviderReadyCount({
    profile,
    chatgptAccounts,
    githubCopilotConnected,
    gitlabDuoConnected,
    poeConnected,
    qwenConnected,
    keys: {
      groqKey,
      githubModelsPat,
      openrouterKey: orKey,
      kiloApiKey,
      deepseekKey,
      agentRouterKey,
      geminiKey,
      deepgramApiKey,
      falApiKey,
      braveSearchApiKey,
      cloudflareAccountId: cfAccountId,
      cloudflareApiToken: cfApiToken,
    },
  });

  const {
    localLlmReady,
    localWhisperReady,
    localAiEnabled,
    localLlmAllowed,
    localLlmWarning,
    localLlmFileName,
    localWhisperFileName,
    imageGenerationOptions,
    settingsSummaryCards,
  } = useSettingsSummaryState({
    profile,
    permStatus,
    dbmciClassStartDate,
    btrStartDate,
    inicetDate,
    neetDate,
    providerReadyCount,
    activeCategory,
    topProviderName: PROVIDER_DISPLAY_NAMES[providerOrder[0]] || 'Auto',
    guruChatDefaultModel,
  });

  const categoryBadges = useSettingsCategoryBadges({
    profile,
    permStatus,
    providerReadyCount,
    dbmciClassStartDate,
    btrStartDate,
    inicetDate,
    neetDate,
  });

  const activeCategoryMeta = getSettingsCategoryMeta(activeCategory);

  return {
    navigation,
    isTabletLayout,
    profile,
    refreshProfile,
    activeCategory,
    setActiveCategory,
    expandedSections,
    toggleExpandedSection,
    saving,
    settingsSummaryCards,
    categoryBadges,
    activeCategoryMeta,
    name,
    setName,
    loadingOrbStyle,
    setLoadingOrbStyle,
    actionHubTools,
    setActionHubTools,
    liveGuruChatModels,
    guruChatDefaultModel,
    setGuruChatDefaultModel,
    guruMemoryNotes,
    setGuruMemoryNotes,
    chatgptConnectingSlot,
    chatgptDeviceCode,
    chatgptAccounts,
    setChatgptAccounts,
    connectChatGpt,
    disconnectChatGpt,
    githubCopilotConnecting,
    githubCopilotDeviceCode,
    githubCopilotConnected,
    connectGitHubCopilot,
    disconnectGitHubCopilot,
    githubCopilotOAuthTestResult,
    validateGitHubCopilotConnection,
    testingGitHubCopilotOAuth,
    githubCopilotPreferredModel,
    setGithubCopilotPreferredModel,
    gitlabDuoConnecting,
    gitlabDuoConnected,
    connectGitLabDuo,
    disconnectGitLabDuo,
    gitlabOauthClientId,
    setGitlabOauthClientId,
    gitlabOauthClientSecret,
    setGitlabOauthClientSecret,
    gitlabDuoOAuthTestResult,
    validateGitLabDuoConnection,
    testingGitLabDuoOAuth,
    gitlabDuoPreferredModel,
    setGitlabDuoPreferredModel,
    gitlabPasteModalVisible,
    setGitlabPasteModalVisible,
    gitlabPasteUrl,
    setGitlabPasteUrl,
    submitGitLabPasteUrl,
    gitlabPasteSubmitting,
    poeConnecting,
    poeDeviceCode,
    poeConnected,
    connectPoe,
    disconnectPoe,
    qwenConnecting,
    qwenDeviceCode,
    qwenConnected,
    connectQwen,
    disconnectQwen,
    apiKeys: {
      groq: {
        value: groqKey,
        setValue: setGroqKey,
        setTestResult: setGroqKeyTestResult,
        validationStatus: groqValidationStatus,
        test: testGroqKey,
        testing: testingGroqKey,
      },
      githubModelsPat: {
        value: githubModelsPat,
        setValue: setGithubModelsPat,
        setTestResult: setGithubPatTestResult,
        validationStatus: githubValidationStatus,
        test: testGithubModelsPat,
        testing: testingGithubPat,
      },
      openrouter: {
        value: orKey,
        setValue: setOrKey,
        setTestResult: setOpenRouterKeyTestResult,
        validationStatus: openRouterValidationStatus,
        test: testOpenRouterKey,
        testing: testingOpenRouterKey,
      },
      kilo: {
        value: kiloApiKey,
        setValue: setKiloApiKey,
        setTestResult: setKiloKeyTestResult,
        validationStatus: kiloValidationStatus,
        test: testKiloKey,
        testing: testingKiloKey,
      },
      deepseek: {
        value: deepseekKey,
        setValue: setDeepseekKey,
        setTestResult: setDeepseekKeyTestResult,
        validationStatus: deepseekValidationStatus,
        test: testDeepseekKey,
        testing: testingDeepseekKey,
      },
      agentRouter: {
        value: agentRouterKey,
        setValue: setAgentRouterKey,
        setTestResult: setAgentRouterKeyTestResult,
        validationStatus: agentRouterValidationStatus,
        test: testAgentRouterKey,
        testing: testingAgentRouterKey,
      },
      gemini: {
        value: geminiKey,
        setValue: setGeminiKey,
        setTestResult: setGeminiKeyTestResult,
        validationStatus: geminiValidationStatus,
        test: testGeminiKey,
        testing: testingGeminiKey,
      },
      huggingface: {
        value: huggingFaceToken,
        setValue: setHuggingFaceToken,
        setTestResult: () => {}, // Handled by TranscriptionSettingsPanel or generic test
        validationStatus: null,
        test: async () => {
          const { testHuggingFaceConnection } = await import('../../../services/ai/providerHealth');
          const r = await testHuggingFaceConnection(huggingFaceToken, huggingFaceModel);
          if (!r.ok) throw new Error('Hugging Face test failed');
        },
        testing: false,
      },
      deepgram: {
        value: deepgramApiKey,
        setValue: setDeepgramApiKey,
        setTestResult: setDeepgramKeyTestResult,
        validationStatus: deepgramValidationStatus,
        test: async () => {
          const { testDeepgramConnection } = await import('../../../services/ai/providerHealth');
          const r = await testDeepgramConnection(deepgramApiKey);
          if (!r.ok) throw new Error('Deepgram test failed');
        },
        testing: false,
      },
      vertex: {
        project: vertexAiProject,
        setProject: setVertexAiProject,
        location: vertexAiLocation,
        setLocation: setVertexAiLocation,
        token: vertexAiToken,
        setToken: setVertexAiToken,
        setTestResult: setVertexKeyTestResult,
        validationStatus: vertexValidationStatus,
        test: testVertexKey,
        testing: testingVertexKey,
      },
      cloudflare: {
        accountId: cfAccountId,
        setAccountId: setCfAccountId,
        apiToken: cfApiToken,
        setApiToken: setCfApiToken,
        setTestResult: setCloudflareTestResult,
        validationStatus: cloudflareValidationStatus,
        test: testCloudflareKeys,
        testing: testingCloudflare,
      },
      fal: {
        value: falApiKey,
        setValue: setFalApiKey,
        setTestResult: setFalKeyTestResult,
        validationStatus: falValidationStatus,
        test: testFalKey,
        testing: testingFalKey,
      },
      braveSearch: {
        value: braveSearchApiKey,
        setValue: setBraveSearchApiKey,
        setTestResult: setBraveSearchKeyTestResult,
        validationStatus: braveValidationStatus,
        test: testBraveSearchKey,
        testing: testingBraveSearchKey,
      },
    },
    preferGeminiStructuredJson,
    setPreferGeminiStructuredJson,
    transcriptionProvider,
    setTranscriptionProvider,
    providerOrder,
    moveProvider,
    setProviderOrder,
    imageGenerationOptions,
    imageGenerationModel,
    setImageGenerationModel,
    imageGenerationOrder,
    setImageGenerationOrder,
    transcriptionOrder,
    setTranscriptionOrder,
    localAiEnabled,
    localLlmReady,
    localLlmFileName,
    localWhisperReady,
    localWhisperFileName,
    localLlmAllowed,
    localLlmWarning,
    updateUserProfile,
    clearProviderValidated,
    strictMode,
    setStrictMode,
    bodyDoubling,
    setBodyDoubling,
    blockedTypes,
    setBlockedTypes,
    subjects,
    focusSubjectIds,
    setFocusSubjectIds,
    idleTimeout,
    setIdleTimeout,
    breakDuration,
    setBreakDuration,
    pomodoroEnabled,
    setPomodoroEnabled,
    pomodoroLectureQuizReady,
    hasPomodoroOverlayPermission,
    hasPomodoroGroqKey,
    hasPomodoroDeepgramKey,
    requestPomodoroOverlay,
    pomodoroInterval,
    setPomodoroInterval,
    permStatus,
    onRequestNotifications,
    onRequestMic,
    onRequestLocalFiles,
    onRequestOverlay,
    dbmciClassStartDate,
    setDbmciClassStartDate,
    btrStartDate,
    setBtrStartDate,
    homeNoveltyCooldownHours,
    setHomeNoveltyCooldownHours,
    sessionLength,
    setSessionLength,
    dailyGoal,
    setDailyGoal,
    notifs,
    setNotifs,
    notifHour,
    setNotifHour,
    testNotification,
    guruFrequency,
    setGuruFrequency,
    backupBusy,
    setBackupBusy,
    clearAiCache,
    resetStudyProgress,
    exportUnifiedBackup,
    importUnifiedBackup,
    autoBackupFrequency,
    setAutoBackupFrequency,
    runAutoBackup,
    cleanupOldBackups,
    profileRepository,
    gdriveWebClientId,
    setGdriveWebClientId,
    GOOGLE_WEB_CLIENT_ID,
    signInToGDrive,
    signOutGDrive,
    maintenanceBusy,
    runMaintenanceTask,
    getUserProfile,
    onOpenSystemSettings,
    onOpenDevConsole,
  };
}
