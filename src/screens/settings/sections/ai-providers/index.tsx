import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme } from '../../../../theme/linearTheme';
import LinearSurface from '../../../../components/primitives/LinearSurface';
import LinearText from '../../../../components/primitives/LinearText';
import LinearTextInput from '../../../../components/primitives/LinearTextInput';
import TranscriptionSettingsPanel from '../../../../components/TranscriptionSettingsPanel';
import SettingsToggleRow from '../../components/SettingsToggleRow';
import SettingsLabel from '../../components/SettingsLabel';
import SettingsModelDropdown from '../../components/SettingsModelDropdown';
import type { ChatGptAccountSlot, ProviderId } from '../../../../types';
import { DEFAULT_PROVIDER_ORDER, PROVIDER_DISPLAY_NAMES } from '../../../../types';
import { sanitizeProviderOrder } from '../../../../utils/providerOrder';
import { VERIFICATION_URL } from '../../../../services/ai/chatgpt';
import { VERIFICATION_URL as GITHUB_VERIFICATION_URL } from '../../../../services/ai/github';
import { getGitLabInstanceUrl, getRedirectUri } from '../../../../services/ai/gitlab';
import { VERIFICATION_URL as POE_VERIFICATION_URL } from '../../../../services/ai/poe';
import { GITHUB_COPILOT_MODELS, GITLAB_DUO_MODELS } from '../../../../config/appConfig';
import { isChatGptEnabled } from '../../utils';

import type { AiProvidersProps } from './types';
import ApiKeysSection from './subsections/ApiKeysSection';
import ChatGptOAuthSection from './subsections/ChatGptOAuthSection';
import PoeOAuthSection from './subsections/PoeOAuthSection';
import QwenOAuthSection from './subsections/QwenOAuthSection';
import GithubCopilotSection from './subsections/GithubCopilotSection';
import GitlabDuoSection from './subsections/GitlabDuoSection';

export default function AiProvidersSection(props: AiProvidersProps) {
  const {
    styles,
    SectionToggle,
    SubSectionToggle,
    navigation,
    profile,
    guruChat,
    guruMemory,
    chatgpt,
    githubCopilot,
    gitlabDuo,
    poe,
    qwen,
    apiKeys,
    gemini,
    routing,
    imageGen,
    localAi,
    updateUserProfile,
    refreshProfile,
    clearProviderValidated,
  } = props;

  const {
    models: liveGuruChatModels,
    formatModelChipLabel: formatGuruChatModelChipLabel,
    defaultModel: guruChatDefaultModel,
    setDefaultModel: setGuruChatDefaultModel,
  } = guruChat;
  const { notes: guruMemoryNotes, setNotes: setGuruMemoryNotes } = guruMemory;
  const {
    connectingSlot: chatgptConnectingSlot,
    deviceCode: chatgptDeviceCode,
    accounts: chatgptAccounts,
    setAccounts: setChatgptAccounts,
    connect: connectChatGpt,
    disconnect: disconnectChatGpt,
  } = chatgpt;
  const {
    connecting: githubCopilotConnecting,
    deviceCode: githubCopilotDeviceCode,
    connected: githubCopilotConnected,
    testResult: githubCopilotOAuthTestResult,
    validateConnection: validateGitHubCopilotConnection,
    testingOAuth: testingGitHubCopilotOAuth,
    disconnect: disconnectGitHubCopilot,
    connect: connectGitHubCopilot,
    preferredModel: githubCopilotPreferredModel,
    setPreferredModel: setGithubCopilotPreferredModel,
  } = githubCopilot;
  const {
    clientId: gitlabOauthClientId,
    setClientId: setGitlabOauthClientId,
    clientSecret: gitlabOauthClientSecret,
    setClientSecret: setGitlabOauthClientSecret,
    connected: gitlabDuoConnected,
    testResult: gitlabDuoOAuthTestResult,
    validateConnection: validateGitLabDuoConnection,
    testingOAuth: testingGitLabDuoOAuth,
    connecting: gitlabDuoConnecting,
    disconnect: disconnectGitLabDuo,
    connect: connectGitLabDuo,
    setPasteModalVisible: setGitlabPasteModalVisible,
    preferredModel: gitlabDuoPreferredModel,
    setPreferredModel: setGitlabDuoPreferredModel,
    pasteModalVisible: gitlabPasteModalVisible,
    pasteUrl: gitlabPasteUrl,
    setPasteUrl: setGitlabPasteUrl,
    submitPasteUrl: submitGitLabPasteUrl,
    pasteSubmitting: gitlabPasteSubmitting,
  } = gitlabDuo;
  const {
    connecting: poeConnecting,
    deviceCode: poeDeviceCode,
    connected: poeConnected,
    disconnect: disconnectPoe,
    connect: connectPoe,
  } = poe;
  const {
    connecting: qwenConnecting,
    deviceCode: qwenDeviceCode,
    connected: qwenConnected,
    connect: connectQwen,
    disconnect: disconnectQwen,
  } = qwen;

  const {
    value: groqKey,
    setValue: setGroqKey,
    setTestResult: setGroqKeyTestResult,
    validationStatus: groqValidationStatusStr,
    test: testGroqKey,
    testing: testingGroqKey,
  } = apiKeys.groq;
  const groqValidationStatus =
    groqValidationStatusStr === 'valid'
      ? 'ok'
      : groqValidationStatusStr === 'invalid'
        ? 'fail'
        : null;
  const {
    value: githubModelsPat,
    setValue: setGithubModelsPat,
    setTestResult: setGithubPatTestResult,
    validationStatus: githubValidationStatusStr,
    test: testGithubModelsPat,
    testing: testingGithubPat,
  } = apiKeys.githubModelsPat;
  const githubValidationStatus =
    githubValidationStatusStr === 'valid'
      ? 'ok'
      : githubValidationStatusStr === 'invalid'
        ? 'fail'
        : null;
  const {
    value: orKey,
    setValue: setOrKey,
    setTestResult: setOpenRouterKeyTestResult,
    validationStatus: openRouterValidationStatusStr,
    test: testOpenRouterKey,
    testing: testingOpenRouterKey,
  } = apiKeys.openrouter;
  const openRouterValidationStatus =
    openRouterValidationStatusStr === 'valid'
      ? 'ok'
      : openRouterValidationStatusStr === 'invalid'
        ? 'fail'
        : null;
  const {
    value: kiloApiKey,
    setValue: setKiloApiKey,
    setTestResult: setKiloKeyTestResult,
    validationStatus: kiloValidationStatusStr,
    test: testKiloKey,
    testing: testingKiloKey,
  } = apiKeys.kilo;
  const kiloValidationStatus =
    kiloValidationStatusStr === 'valid'
      ? 'ok'
      : kiloValidationStatusStr === 'invalid'
        ? 'fail'
        : null;
  const {
    value: deepseekKey,
    setValue: setDeepseekKey,
    setTestResult: setDeepseekKeyTestResult,
    validationStatus: deepseekValidationStatusStr,
    test: testDeepseekKey,
    testing: testingDeepseekKey,
  } = apiKeys.deepseek;
  const deepseekValidationStatus =
    deepseekValidationStatusStr === 'valid'
      ? 'ok'
      : deepseekValidationStatusStr === 'invalid'
        ? 'fail'
        : null;
  const {
    value: agentRouterKey,
    setValue: setAgentRouterKey,
    setTestResult: setAgentRouterKeyTestResult,
    validationStatus: agentRouterValidationStatusStr,
    test: testAgentRouterKey,
    testing: testingAgentRouterKey,
  } = apiKeys.agentRouter;
  const agentRouterValidationStatus =
    agentRouterValidationStatusStr === 'valid'
      ? 'ok'
      : agentRouterValidationStatusStr === 'invalid'
        ? 'fail'
        : null;
  const {
    value: geminiKey,
    setValue: setGeminiKey,
    setTestResult: setGeminiKeyTestResult,
    validationStatus: geminiValidationStatusStr,
    test: testGeminiKey,
    testing: testingGeminiKey,
  } = apiKeys.gemini;
  const geminiValidationStatus =
    geminiValidationStatusStr === 'valid'
      ? 'ok'
      : geminiValidationStatusStr === 'invalid'
        ? 'fail'
        : null;
  const {
    value: deepgramApiKey,
    setValue: setDeepgramApiKey,
    setTestResult: setDeepgramKeyTestResult,
    validationStatus: deepgramValidationStatusStr,
    test: testDeepgramKey,
    testing: testingDeepgramKey,
  } = apiKeys.deepgram;
  const deepgramValidationStatus =
    deepgramValidationStatusStr === 'valid'
      ? 'ok'
      : deepgramValidationStatusStr === 'invalid'
        ? 'fail'
        : null;

  const {
    accountId: cfAccountId,
    setAccountId: setCfAccountId,
    apiToken: cfApiToken,
    setApiToken: setCfApiToken,
    setTestResult: setCloudflareTestResult,
    validationStatus: cloudflareValidationStatusStr,
    test: testCloudflareKeys,
    testing: testingCloudflare,
  } = apiKeys.cloudflare;
  const cloudflareValidationStatus =
    cloudflareValidationStatusStr === 'valid'
      ? 'ok'
      : cloudflareValidationStatusStr === 'invalid'
        ? 'fail'
        : null;
  const {
    value: falApiKey,
    setValue: setFalApiKey,
    setTestResult: setFalKeyTestResult,
    validationStatus: falValidationStatusStr,
    test: testFalKey,
    testing: testingFalKey,
  } = apiKeys.fal;
  const falValidationStatus =
    falValidationStatusStr === 'valid'
      ? 'ok'
      : falValidationStatusStr === 'invalid'
        ? 'fail'
        : null;
  const {
    value: braveSearchApiKey,
    setValue: setBraveSearchApiKey,
    setTestResult: setBraveSearchKeyTestResult,
    validationStatus: braveValidationStatusStr,
    test: testBraveSearchKey,
    testing: testingBraveSearchKey,
  } = apiKeys.braveSearch;
  const braveValidationStatus =
    braveValidationStatusStr === 'valid'
      ? 'ok'
      : braveValidationStatusStr === 'invalid'
        ? 'fail'
        : null;

  const {
    preferStructuredJson: preferGeminiStructuredJson,
    setPrefer: setPreferGeminiStructuredJson,
  } = gemini;
  const { providerOrder, moveProvider, setProviderOrder } = routing;
  const {
    options: imageGenerationOptions,
    model: imageGenerationModel,
    setModel: setImageGenerationModel,
  } = imageGen;
  const {
    enabled: localAiEnabled,
    llmReady: localLlmReady,
    llmFileName: localLlmFileName,
    whisperReady: localWhisperReady,
    whisperFileName: localWhisperFileName,
    llmAllowed: localLlmAllowed,
    llmWarning: localLlmWarning,
    useNano,
  } = localAi;

  const hasValue = (value: string | null | undefined) => Boolean(value?.trim());
  const readyProviderCount = [
    isChatGptEnabled(chatgptAccounts),
    githubCopilotConnected,
    gitlabDuoConnected,
    poeConnected,
    qwenConnected,
    hasValue(groqKey),
    hasValue(githubModelsPat),
    hasValue(orKey),
    hasValue(kiloApiKey),
    hasValue(deepseekKey),
    hasValue(agentRouterKey),
    hasValue(geminiKey),
    hasValue(deepgramApiKey),
    hasValue(falApiKey),
    hasValue(braveSearchApiKey),
    hasValue(cfAccountId) && hasValue(cfApiToken),
    localAiEnabled && (localLlmReady || localWhisperReady || useNano),
  ].filter(Boolean).length;
  const oauthConnectionCount = [
    chatgptAccounts.primary.connected,
    chatgptAccounts.secondary.connected,
    githubCopilotConnected,
    gitlabDuoConnected,
    poeConnected,
    qwenConnected,
  ].filter(Boolean).length;
  const providerPriority = sanitizeProviderOrder(providerOrder)[0];
  const topProviderLabel = PROVIDER_DISPLAY_NAMES[providerPriority] ?? 'Auto';
  const localAiSummary = localAiEnabled
    ? localLlmReady || localWhisperReady || useNano
      ? 'Ready'
      : 'Needs models'
    : 'Cloud first';

  return (
    <>
      <LinearText
        style={[styles.categoryLabel, { marginTop: 0 }]}
        variant="sectionTitle"
        tone="muted"
      >
        AI & PROVIDERS
      </LinearText>
      <LinearSurface compact style={styles.summaryCardCompact}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCopy}>
            <LinearText variant="meta" tone="accent" style={styles.summaryEyebrow}>
              COMMAND CENTER
            </LinearText>
          </View>
          <View style={styles.summaryPill}>
            <LinearText variant="chip" tone="accent">
              {readyProviderCount} ready
            </LinearText>
          </View>
        </View>
        <View style={styles.summaryMetricsRow}>
          <View style={styles.summaryMetricCard}>
            <LinearText variant="title" tone="accent" style={styles.summaryMetricValue}>
              {topProviderLabel}
            </LinearText>
            <LinearText variant="caption" tone="secondary" style={styles.summaryMetricLabel}>
              Top routing priority
            </LinearText>
          </View>
          <View style={styles.summaryMetricCard}>
            <LinearText variant="title" tone="success" style={styles.summaryMetricValue}>
              {oauthConnectionCount}
            </LinearText>
            <LinearText variant="caption" tone="secondary" style={styles.summaryMetricLabel}>
              OAuth connections
            </LinearText>
          </View>
          <View style={styles.summaryMetricCard}>
            <LinearText variant="title" tone="warning" style={styles.summaryMetricValue}>
              {localAiSummary}
            </LinearText>
            <LinearText variant="caption" tone="secondary" style={styles.summaryMetricLabel}>
              Local AI mode
            </LinearText>
          </View>
        </View>
      </LinearSurface>
      <SectionToggle
        id="ai_config"
        title="AI Configuration"
        icon="hardware-chip-outline"
        tint="#6C63FF"
      >
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
                {liveGuruChatModels.loading ? 'Loading live models…' : 'Refresh live model lists'}
              </Text>
            </TouchableOpacity>
            {liveGuruChatModels.loading && (
              <ActivityIndicator size="small" color={linearTheme.colors.accent} />
            )}
          </View>
          <SettingsModelDropdown
            label="Guru Chat — default model"
            value={guruChatDefaultModel}
            onSelect={setGuruChatDefaultModel}
            options={[
              { id: 'auto', label: formatGuruChatModelChipLabel('auto'), group: 'General' },
              ...(profile?.useLocalModel && profile?.localModelPath
                ? [{ id: 'local', label: formatGuruChatModelChipLabel('local'), group: 'General' }]
                : []),
              ...liveGuruChatModels.chatgpt.map((m: string) => ({
                id: `chatgpt/${m}`,
                label: formatGuruChatModelChipLabel(`chatgpt/${m}`),
                group: 'ChatGPT Codex',
              })),
              ...liveGuruChatModels.groq.map((m: string) => ({
                id: `groq/${m}`,
                label: formatGuruChatModelChipLabel(`groq/${m}`),
                group: 'Groq',
              })),
              ...liveGuruChatModels.github.map((m: string) => ({
                id: `github/${m}`,
                label: formatGuruChatModelChipLabel(`github/${m}`),
                group: 'GitHub Models',
              })),
              ...liveGuruChatModels.githubCopilot.map((m: string) => ({
                id: `github_copilot/${m}`,
                label: formatGuruChatModelChipLabel(`github_copilot/${m}`),
                group: 'GitHub Copilot',
              })),
              ...liveGuruChatModels.gitlabDuo.map((m: string) => ({
                id: `gitlab_duo/${m}`,
                label: formatGuruChatModelChipLabel(`gitlab_duo/${m}`),
                group: 'GitLab Duo',
              })),
              ...liveGuruChatModels.poe.map((m: string) => ({
                id: `poe/${m}`,
                label: formatGuruChatModelChipLabel(`poe/${m}`),
                group: 'Poe',
              })),
              ...liveGuruChatModels.kilo.map((m: string) => ({
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
              ...liveGuruChatModels.openrouter.map((m: string) => ({
                id: m,
                label: formatGuruChatModelChipLabel(m),
                group: 'OpenRouter (free)',
              })),
              ...liveGuruChatModels.gemini.map((m: string) => ({
                id: `gemini/${m}`,
                label: formatGuruChatModelChipLabel(`gemini/${m}`),
                group: 'Gemini',
              })),
              ...liveGuruChatModels.cloudflare.map((m: string) => ({
                id: `cf/${m}`,
                label: formatGuruChatModelChipLabel(`cf/${m}`),
                group: 'Cloudflare',
              })),
            ]}
          />
        </SubSectionToggle>

        <View style={styles.subSectionDivider} />
        <SubSectionToggle id="ai_memory" title="GURU MEMORY">
          <Text style={styles.hint}>
            Persistent notes Guru uses in every chat. Session memory is built automatically.
          </Text>
          <LinearTextInput
            style={[styles.input, styles.guruMemoryInput]}
            placeholder="e.g. INICET May 2026 · weak in renal · prefers concise answers"
            placeholderTextColor={linearTheme.colors.textMuted}
            value={guruMemoryNotes}
            onChangeText={setGuruMemoryNotes}
            multiline
            textAlignVertical="top"
            autoCapitalize="sentences"
          />
        </SubSectionToggle>

        <View style={styles.subSectionDivider} />
        <ChatGptOAuthSection
          chatgpt={chatgpt}
          SubSectionToggle={SubSectionToggle}
          styles={styles}
        />

        <View style={styles.subSectionDivider} />
        <GithubCopilotSection
          githubCopilot={githubCopilot}
          SubSectionToggle={SubSectionToggle}
          styles={styles}
        />

        <View style={styles.subSectionDivider} />
        <GitlabDuoSection
          gitlabDuo={gitlabDuo}
          SubSectionToggle={SubSectionToggle}
          styles={styles}
        />

        <View style={styles.subSectionDivider} />
        <PoeOAuthSection poe={poe} SubSectionToggle={SubSectionToggle} styles={styles} />

        <View style={styles.subSectionDivider} />
        <QwenOAuthSection qwen={qwen} SubSectionToggle={SubSectionToggle} styles={styles} />

        <View style={styles.subSectionDivider} />
        <ApiKeysSection
          apiKeys={apiKeys}
          clearProviderValidated={clearProviderValidated}
          SubSectionToggle={SubSectionToggle}
          styles={styles}
        />

        <View style={styles.subSectionDivider} />
        <SubSectionToggle id="ai_routing" title="PROVIDER ROUTING">
          <Text style={styles.hint}>
            Reorder fallback priority. First available provider is used.
          </Text>
          {providerOrder.map((id: ProviderId, index: number) => {
            const providerId = id as keyof typeof PROVIDER_DISPLAY_NAMES;
            const hasKey = (() => {
              switch (id) {
                case 'chatgpt':
                  return isChatGptEnabled(chatgptAccounts) || !!profile?.chatgptConnected;
                case 'groq':
                  return !!(groqKey?.trim() || profile?.groqApiKey);
                case 'github':
                  return !!(githubModelsPat?.trim() || profile?.githubModelsPat);
                case 'kilo':
                  return !!(kiloApiKey?.trim() || profile?.kiloApiKey);
                case 'deepseek':
                  return !!(deepseekKey?.trim() || profile?.deepseekKey);
                case 'agentrouter':
                  return !!(agentRouterKey?.trim() || profile?.agentRouterKey);
                case 'gemini':
                  return !!(geminiKey?.trim() || profile?.geminiKey);
                case 'gemini_fallback':
                  return true;
                case 'openrouter':
                  return !!(orKey?.trim() || profile?.openrouterKey);
                case 'cloudflare':
                  return !!(
                    (cfAccountId?.trim() || profile?.cloudflareAccountId) &&
                    (cfApiToken?.trim() || profile?.cloudflareApiToken)
                  );
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
            return (
              <View key={id} style={[styles.providerRow, !hasKey && { opacity: 0.45 }]}>
                <Text style={styles.providerIndex}>{index + 1}</Text>
                <View
                  style={[
                    styles.providerDot,
                    {
                      backgroundColor: hasKey
                        ? linearTheme.colors.success
                        : linearTheme.colors.textMuted,
                    },
                  ]}
                />
                <Text
                  style={[styles.providerName, { color: linearTheme.colors.textPrimary }]}
                  numberOfLines={2}
                >
                  {PROVIDER_DISPLAY_NAMES[providerId]}
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
                    accessibilityLabel={`Move ${PROVIDER_DISPLAY_NAMES[providerId]} to top`}
                  >
                    <Ionicons
                      name="play-skip-back"
                      size={16}
                      color={linearTheme.colors.textPrimary}
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
                    <Ionicons name="chevron-up" size={18} color={linearTheme.colors.textPrimary} />
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
                    <Ionicons
                      name="chevron-down"
                      size={18}
                      color={linearTheme.colors.textPrimary}
                    />
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
                    accessibilityLabel={`Move ${PROVIDER_DISPLAY_NAMES[providerId]} to bottom`}
                  >
                    <Ionicons
                      name="play-skip-forward"
                      size={16}
                      color={linearTheme.colors.textPrimary}
                    />
                  </Pressable>
                </View>
              </View>
            );
          })}
          <TouchableOpacity
            style={[styles.testBtn, { marginTop: 4, marginBottom: 12 }]}
            onPress={() => {
              const reset = [...DEFAULT_PROVIDER_ORDER];
              setProviderOrder(reset);
              void updateUserProfile({ providerOrder: sanitizeProviderOrder(reset) })
                .then(() => refreshProfile())
                .catch((err: unknown) => {
                  if (__DEV__) console.warn('[Settings] Failed to reset provider order:', err);
                });
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.testBtnText}>Reset to Default Order</Text>
          </TouchableOpacity>
        </SubSectionToggle>

        <View style={styles.subSectionDivider} />
        <SubSectionToggle id="ai_image_gen" title="IMAGE GENERATION">
          <Text style={styles.hint}>
            Diagrams and study images. fal uses a separate API key and does not reuse ChatGPT Plus
            login.
          </Text>
          <Text style={styles.label}>fal API Key</Text>
          <View style={styles.apiKeyRow}>
            <LinearTextInput
              style={[
                styles.input,
                styles.apiKeyInput,
                falValidationStatus === 'ok' && styles.inputSuccess,
                falValidationStatus === 'fail' && styles.inputError,
              ]}
              placeholder="fal key"
              placeholderTextColor={linearTheme.colors.textMuted}
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
                <ActivityIndicator size="small" color={linearTheme.colors.accent} />
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
                      ? linearTheme.colors.success
                      : falValidationStatus === 'fail'
                        ? linearTheme.colors.error
                        : linearTheme.colors.accent
                  }
                />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>
            Validate your fal API key with fal's model catalog endpoint.
          </Text>
          <View style={styles.subSectionDivider} />

          <Text style={styles.label}>Brave Search API Key</Text>
          <View style={styles.apiKeyRow}>
            <LinearTextInput
              style={[
                styles.input,
                styles.apiKeyInput,
                braveValidationStatus === 'ok' && styles.inputSuccess,
                braveValidationStatus === 'fail' && styles.inputError,
              ]}
              placeholder="brave key"
              placeholderTextColor={linearTheme.colors.textMuted}
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
                <ActivityIndicator size="small" color={linearTheme.colors.accent} />
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
                      ? linearTheme.colors.success
                      : braveValidationStatus === 'fail'
                        ? linearTheme.colors.error
                        : linearTheme.colors.accent
                  }
                />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>
            Optional fallback for image search when MedPix, Open-i, and Wikimedia return nothing.
          </Text>
          <View style={styles.modelChipRow}>
            {imageGenerationOptions.map((opt: { value: string; label: string }) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.freqBtn, imageGenerationModel === opt.value && styles.freqBtnActive]}
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
            Configure transcription providers and keys used by Recording Vault and external lecture
            processing.
          </Text>
          <TranscriptionSettingsPanel embedded />
        </SubSectionToggle>

        <View style={styles.subSectionDivider} />
        <SubSectionToggle id="ai_local_ai" title="LOCAL AI">
          {/* ── Gemini Nano (AICore) ── */}
          <View style={styles.localAiCard}>
            <View style={styles.localAiCardHeader}>
              <View style={styles.localAiCardLabelRow}>
                <View style={[styles.localAiCardIcon, { backgroundColor: '#4285F4' + '22' }]}>
                  <Ionicons name="sparkles" size={16} color="#4285F4" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { marginBottom: 0 }]}>Gemini Nano</Text>
                </View>
              </View>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 6,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.localAiBadge, useNano ? null : styles.localAiBadgeMuted]}>
                  <Text
                    style={[styles.localAiBadgeText, useNano ? null : styles.localAiBadgeMutedText]}
                  >
                    {useNano ? 'Active' : 'Off'}
                  </Text>
                </View>
                <Text style={styles.hint}>~256 token output · No model file needed</Text>
              </View>
              <SettingsToggleRow
                label=""
                value={useNano}
                onValueChange={() => {
                  const { setUseNano } =
                    require('../../../hooks/queries/useProfile').useProfileActions();
                  setUseNano(!useNano);
                }}
                style={{ marginBottom: 0 }}
                contentStyle={{ paddingRight: 0 }}
              />
            </View>
          </View>

          {/* ── LiteRT LLM (file-based) ── */}
          <View style={styles.localAiCard}>
            <View style={styles.localAiCardHeader}>
              <View style={styles.localAiCardLabelRow}>
                <View
                  style={[
                    styles.localAiCardIcon,
                    { backgroundColor: linearTheme.colors.accent + '22' },
                  ]}
                >
                  <Ionicons name="hardware-chip" size={16} color={linearTheme.colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { marginBottom: 0 }]}>LiteRT Text Model</Text>
                </View>
              </View>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 6,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                {localLlmReady ? (
                  <View
                    style={[
                      styles.localAiBadge,
                      profile?.useLocalModel ? null : styles.localAiBadgeWarning,
                    ]}
                  >
                    <Text
                      style={[
                        styles.localAiBadgeText,
                        profile?.useLocalModel ? null : styles.localAiBadgeWarningText,
                      ]}
                    >
                      {profile?.useLocalModel ? 'Active' : 'Paused'}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.localAiBadgeMuted}>
                    <Text style={styles.localAiBadgeMutedText}>Not installed</Text>
                  </View>
                )}
                {localLlmReady ? (
                  <Text style={[styles.hint, { flex: 1 }]}>{localLlmFileName}</Text>
                ) : null}
              </View>
              {localLlmReady ? (
                <SettingsToggleRow
                  label=""
                  value={!!profile?.useLocalModel}
                  onValueChange={() => {
                    const { setUseLocalModel } =
                      require('../../../hooks/queries/useProfile').useProfileActions();
                    setUseLocalModel(!profile?.useLocalModel);
                  }}
                  style={{ marginBottom: 0 }}
                  contentStyle={{ paddingRight: 0 }}
                />
              ) : null}
            </View>
            {!localLlmAllowed && (
              <Text style={[styles.hint, styles.localAiWarningHint]}>{localLlmWarning}</Text>
            )}
          </View>

          {/* ── Local Whisper ── */}
          <View style={styles.localAiCard}>
            <View style={styles.localAiCardHeader}>
              <View style={styles.localAiCardLabelRow}>
                <View style={[styles.localAiCardIcon, { backgroundColor: '#10B981' + '22' }]}>
                  <Ionicons name="mic" size={16} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { marginBottom: 0 }]}>Local Whisper</Text>
                </View>
              </View>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 6,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                {localWhisperReady ? (
                  <View
                    style={[
                      styles.localAiBadge,
                      profile?.useLocalWhisper ? null : styles.localAiBadgeWarning,
                    ]}
                  >
                    <Text
                      style={[
                        styles.localAiBadgeText,
                        profile?.useLocalWhisper ? null : styles.localAiBadgeWarningText,
                      ]}
                    >
                      {profile?.useLocalWhisper ? 'Active' : 'Paused'}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.localAiBadgeMuted}>
                    <Text style={styles.localAiBadgeMutedText}>Not installed</Text>
                  </View>
                )}
                {localWhisperReady ? (
                  <Text style={[styles.hint, { flex: 1 }]}>{localWhisperFileName}</Text>
                ) : null}
              </View>
              {localWhisperReady ? (
                <SettingsToggleRow
                  label=""
                  value={!!profile?.useLocalWhisper}
                  onValueChange={() => {
                    const { setUseLocalWhisper } =
                      require('../../../hooks/queries/useProfile').useProfileActions();
                    setUseLocalWhisper(!profile?.useLocalWhisper);
                  }}
                  style={{ marginBottom: 0 }}
                  contentStyle={{ paddingRight: 0 }}
                />
              ) : null}
            </View>
          </View>

          <TouchableOpacity
            style={styles.localModelBtn}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('LocalModel' as never)}
          >
            <Ionicons
              name="download-outline"
              size={18}
              color={linearTheme.colors.textPrimary}
              style={{ marginRight: 8 }}
            />
            <Text style={styles.localModelBtnText}>Download & Manage Models</Text>
          </TouchableOpacity>
        </SubSectionToggle>
      </SectionToggle>
    </>
  );
}
