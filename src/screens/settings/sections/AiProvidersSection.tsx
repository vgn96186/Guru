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
import { linearTheme } from '../../../theme/linearTheme';
import LinearSurface from '../../../components/primitives/LinearSurface';
import LinearText from '../../../components/primitives/LinearText';
import LinearTextInput from '../../../components/primitives/LinearTextInput';
import TranscriptionSettingsPanel from '../../../components/TranscriptionSettingsPanel';
import SettingsToggleRow from '../components/SettingsToggleRow';
import SettingsLabel from '../components/SettingsLabel';
import SettingsModelDropdown from '../components/SettingsModelDropdown';
import type { ChatGptAccountSlot, ProviderId } from '../../../types';
import { DEFAULT_PROVIDER_ORDER, PROVIDER_DISPLAY_NAMES } from '../../../types';
import { sanitizeProviderOrder } from '../../../utils/providerOrder';
import { VERIFICATION_URL } from '../../../services/ai/chatgpt';
import { VERIFICATION_URL as GITHUB_VERIFICATION_URL } from '../../../services/ai/github';
import { getGitLabInstanceUrl, getRedirectUri } from '../../../services/ai/gitlab';
import { VERIFICATION_URL as POE_VERIFICATION_URL } from '../../../services/ai/poe';
import { GITHUB_COPILOT_MODELS, GITLAB_DUO_MODELS } from '../../../config/appConfig';
import { isChatGptEnabled } from '../utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function AiProvidersSection(props: any) {
  const {
    styles,
    SectionToggle,
    SubSectionToggle,
    navigation,
    profile,
    liveGuruChatModels,
    formatGuruChatModelChipLabel,
    guruChatDefaultModel,
    setGuruChatDefaultModel,
    guruMemoryNotes,
    setGuruMemoryNotes,
    chatgptConnectingSlot,
    chatgptDeviceCode,
    chatgptAccounts,
    setChatgptAccounts,
    disconnectChatGpt,
    connectChatGpt,
    githubCopilotConnecting,
    githubCopilotDeviceCode,
    githubCopilotConnected,
    githubCopilotOAuthTestResult,
    validateGitHubCopilotConnection,
    testingGitHubCopilotOAuth,
    disconnectGitHubCopilot,
    connectGitHubCopilot,
    githubCopilotPreferredModel,
    setGithubCopilotPreferredModel,
    gitlabOauthClientId,
    setGitlabOauthClientId,
    gitlabOauthClientSecret,
    setGitlabOauthClientSecret,
    gitlabDuoConnected,
    gitlabDuoOAuthTestResult,
    validateGitLabDuoConnection,
    testingGitLabDuoOAuth,
    gitlabDuoConnecting,
    disconnectGitLabDuo,
    connectGitLabDuo,
    setGitlabPasteModalVisible,
    gitlabDuoPreferredModel,
    setGitlabDuoPreferredModel,
    gitlabPasteModalVisible,
    gitlabPasteUrl,
    setGitlabPasteUrl,
    submitGitLabPasteUrl,
    gitlabPasteSubmitting,
    poeConnecting,
    poeDeviceCode,
    poeConnected,
    disconnectPoe,
    connectPoe,
    // Qwen OAuth
    qwenConnecting,
    qwenDeviceCode,
    qwenConnected,
    connectQwen,
    disconnectQwen,
    groqKey,
    setGroqKey,
    setGroqKeyTestResult,
    clearProviderValidated,
    groqValidationStatus,
    testGroqKey,
    testingGroqKey,
    githubModelsPat,
    setGithubModelsPat,
    setGithubPatTestResult,
    githubValidationStatus,
    testGithubModelsPat,
    testingGithubPat,
    orKey,
    setOrKey,
    setOpenRouterKeyTestResult,
    openRouterValidationStatus,
    testOpenRouterKey,
    testingOpenRouterKey,
    kiloApiKey,
    setKiloApiKey,
    setKiloKeyTestResult,
    kiloValidationStatus,
    testKiloKey,
    testingKiloKey,
    deepseekKey,
    setDeepseekKey,
    setDeepseekKeyTestResult,
    deepseekValidationStatus,
    testDeepseekKey,
    testingDeepseekKey,
    agentRouterKey,
    setAgentRouterKey,
    setAgentRouterKeyTestResult,
    agentRouterValidationStatus,
    testAgentRouterKey,
    testingAgentRouterKey,
    geminiKey,
    setGeminiKey,
    setGeminiKeyTestResult,
    geminiValidationStatus,
    testGeminiKey,
    testingGeminiKey,
    preferGeminiStructuredJson,
    setPreferGeminiStructuredJson,
    deepgramApiKey,
    setDeepgramApiKey,
    setDeepgramKeyTestResult,
    deepgramValidationStatus,
    testDeepgramKey,
    testingDeepgramKey,
    cfAccountId,
    setCfAccountId,
    setCloudflareTestResult,
    cloudflareValidationStatus,
    testCloudflareKeys,
    testingCloudflare,
    cfApiToken,
    setCfApiToken,
    providerOrder,
    moveProvider,
    updateUserProfile,
    refreshProfile,
    falApiKey,
    setFalApiKey,
    setFalKeyTestResult,
    falValidationStatus,
    testFalKey,
    testingFalKey,
    braveSearchApiKey,
    setBraveSearchApiKey,
    setBraveSearchKeyTestResult,
    braveValidationStatus,
    testBraveSearchKey,
    testingBraveSearchKey,
    imageGenerationOptions,
    imageGenerationModel,
    setImageGenerationModel,
    localAiEnabled,
    localLlmReady,
    localLlmFileName,
    localWhisperReady,
    localWhisperFileName,
    localLlmAllowed,
    localLlmWarning,
    useNano,
  } = props;
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
        <SubSectionToggle id="chatgpt_oauth" title="CHATGPT (SUBSCRIPTION)">
          <Text style={styles.hint}>
            Connect your ChatGPT Plus/Pro subscription through the Codex flow. Guru follows the
            Codex models page and currently starts with GPT-5.4, then GPT-5.4-mini, before older
            Codex alternatives.
          </Text>
          <Text style={styles.hint}>
            Primary is tried first. Secondary is only tried if primary fails before producing a
            response. Disable either slot here to skip it entirely.
          </Text>
          {chatgptConnectingSlot && chatgptDeviceCode ? (
            <View style={{ marginTop: 8 }}>
              <Text style={[styles.label, { textAlign: 'center', marginBottom: 4 }]}>
                Enter this code at openai.com:
              </Text>
              <Text
                style={{
                  fontSize: 28,
                  fontWeight: '700',
                  textAlign: 'center',
                  color: linearTheme.colors.accent,
                  letterSpacing: 4,
                  marginVertical: 8,
                  fontFamily: 'Inter_400Regular',
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
                <ActivityIndicator size="small" color={linearTheme.colors.accent} />
                <Text style={[styles.hint, { marginTop: 0 }]}>
                  Waiting for authorization for the{' '}
                  {chatgptConnectingSlot === 'primary' ? 'primary' : 'secondary'} account...
                </Text>
              </View>
              <TouchableOpacity
                style={{ marginTop: 12, alignSelf: 'center' }}
                onPress={() => Linking.openURL(VERIFICATION_URL)}
                activeOpacity={0.7}
              >
                <Text
                  style={{
                    color: linearTheme.colors.accent,
                    textDecorationLine: 'underline',
                    fontSize: 13,
                  }}
                >
                  Open login page again
                </Text>
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
                  borderColor: linearTheme.colors.border,
                  borderRadius: 12,
                  backgroundColor: linearTheme.colors.background,
                }}
              >
                <SettingsToggleRow
                  label={isPrimary ? 'Primary account' : 'Secondary account'}
                  hint={
                    isPrimary
                      ? 'Tried first whenever ChatGPT is selected in routing.'
                      : 'Backup account used only if primary fails early.'
                  }
                  value={slotState.enabled}
                  onValueChange={(value) =>
                    setChatgptAccounts(
                      (
                        prev: Record<ChatGptAccountSlot, { enabled: boolean; connected: boolean }>,
                      ) => ({
                        ...prev,
                        [slot]: { ...prev[slot], enabled: value },
                      }),
                    )
                  }
                  activeTrackColor={linearTheme.colors.primaryTintSoft}
                  thumbColor={
                    slotState.enabled ? linearTheme.colors.accent : linearTheme.colors.textMuted
                  }
                  contentStyle={{ paddingRight: 12 }}
                />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 }}>
                  <Ionicons
                    name={slotState.connected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={
                      slotState.connected
                        ? linearTheme.colors.success
                        : linearTheme.colors.textMuted
                    }
                  />
                  <Text
                    style={[
                      styles.label,
                      {
                        flex: 1,
                        color: slotState.connected
                          ? linearTheme.colors.success
                          : linearTheme.colors.textMuted,
                      },
                    ]}
                  >
                    {slotState.connected ? 'Connected' : 'Not connected'}
                  </Text>
                  {slotState.connected ? (
                    <TouchableOpacity
                      style={[
                        styles.validateBtn,
                        { backgroundColor: linearTheme.colors.error + '22', paddingHorizontal: 16 },
                      ]}
                      onPress={() => disconnectChatGpt(slot)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={{ color: linearTheme.colors.error, fontWeight: '600', fontSize: 13 }}
                      >
                        Disconnect
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.validateBtn,
                        {
                          paddingHorizontal: 16,
                          backgroundColor: linearTheme.colors.accent + '22',
                        },
                      ]}
                      onPress={() => connectChatGpt(slot)}
                      disabled={chatgptConnectingSlot !== null}
                      activeOpacity={0.8}
                    >
                      {isConnecting ? (
                        <ActivityIndicator size="small" color={linearTheme.colors.accent} />
                      ) : (
                        <Text
                          style={{
                            color: linearTheme.colors.accent,
                            fontWeight: '600',
                            fontSize: 13,
                          }}
                        >
                          Connect
                        </Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
                {!slotState.enabled && slotState.connected ? (
                  <Text style={[styles.hint, { marginTop: 8 }]}>
                    Disabled. This connected account will be skipped by routing until re-enabled.
                  </Text>
                ) : null}
              </View>
            );
          })}
          {!isChatGptEnabled(chatgptAccounts) ? (
            <Text style={[styles.hint, { marginTop: 10 }]}>
              ChatGPT is currently excluded from provider routing.
            </Text>
          ) : null}
        </SubSectionToggle>

        <View style={styles.subSectionDivider} />
        <SubSectionToggle id="github_copilot_oauth" title="GITHUB COPILOT (OAUTH)">
          <Text style={styles.hint}>
            Connect your GitHub Copilot subscription through device code flow. Supports Copilot Pro,
            Pro+, Business, and Enterprise.
          </Text>
          {githubCopilotConnecting && githubCopilotDeviceCode ? (
            <View style={{ marginTop: 8 }}>
              <Text style={[styles.label, { textAlign: 'center', marginBottom: 4 }]}>
                Enter this code at github.com:
              </Text>
              <Text
                style={{
                  fontSize: 28,
                  fontWeight: '700',
                  textAlign: 'center',
                  color: linearTheme.colors.accent,
                  letterSpacing: 4,
                  marginVertical: 8,
                  fontFamily: 'Inter_400Regular',
                }}
                selectable
              >
                {githubCopilotDeviceCode.user_code}
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
                <ActivityIndicator size="small" color={linearTheme.colors.accent} />
                <Text style={[styles.hint, { marginTop: 0 }]}>Waiting for authorization...</Text>
              </View>
              <TouchableOpacity
                style={{ marginTop: 12, alignSelf: 'center' }}
                onPress={() => Linking.openURL(GITHUB_VERIFICATION_URL)}
                activeOpacity={0.7}
              >
                <Text
                  style={{
                    color: linearTheme.colors.accent,
                    textDecorationLine: 'underline',
                    fontSize: 13,
                  }}
                >
                  Open login page again
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <View
            style={{
              marginTop: 12,
              padding: 12,
              borderWidth: 1,
              borderColor: linearTheme.colors.border,
              borderRadius: 12,
              backgroundColor: linearTheme.colors.background,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Ionicons
                name={githubCopilotConnected ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={
                  githubCopilotConnected ? linearTheme.colors.success : linearTheme.colors.textMuted
                }
              />
              <Text
                style={[
                  styles.label,
                  {
                    flex: 1,
                    color: githubCopilotConnected
                      ? linearTheme.colors.success
                      : linearTheme.colors.textMuted,
                  },
                ]}
              >
                {githubCopilotConnected ? 'Connected' : 'Not connected'}
              </Text>
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
                    <ActivityIndicator size="small" color={linearTheme.colors.accent} />
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
                          ? linearTheme.colors.success
                          : githubCopilotOAuthTestResult === 'fail'
                            ? linearTheme.colors.error
                            : linearTheme.colors.accent
                      }
                    />
                  )}
                </TouchableOpacity>
                {githubCopilotConnected ? (
                  <TouchableOpacity
                    style={[
                      styles.validateBtn,
                      { backgroundColor: linearTheme.colors.error + '22', paddingHorizontal: 16 },
                    ]}
                    onPress={disconnectGitHubCopilot}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={{ color: linearTheme.colors.error, fontWeight: '600', fontSize: 13 }}
                    >
                      Disconnect
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.validateBtn,
                      { paddingHorizontal: 16, backgroundColor: linearTheme.colors.accent + '22' },
                    ]}
                    onPress={connectGitHubCopilot}
                    disabled={githubCopilotConnecting}
                    activeOpacity={0.8}
                  >
                    {githubCopilotConnecting ? (
                      <ActivityIndicator size="small" color={linearTheme.colors.accent} />
                    ) : (
                      <Text
                        style={{
                          color: linearTheme.colors.accent,
                          fontWeight: '600',
                          fontSize: 13,
                        }}
                      >
                        Connect
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
          <Text style={[styles.hint, { marginTop: 8 }]}>
            Validate (pulse icon): checks SecureStore token + a minimal Copilot API call. Full trace
            in Metro:{' '}
            <Text style={{ fontFamily: 'Inter_400Regular' }}>
              [SETTINGS_VALIDATE][github_copilot]
            </Text>
          </Text>
          {githubCopilotConnected ? (
            <>
              <Text style={[styles.hint, { marginTop: 12 }]}>
                When Auto routing reaches GitHub Copilot, Guru tries this model first. If it fails,
                other catalog models are tried in order.
              </Text>
              <SettingsModelDropdown
                label="Preferred Copilot model"
                value={githubCopilotPreferredModel}
                onSelect={setGithubCopilotPreferredModel}
                options={[
                  { id: '', label: 'Default (catalog order)', group: 'GitHub Copilot' },
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

        <View style={styles.subSectionDivider} />
        <SubSectionToggle id="gitlab_duo_oauth" title="GITLAB DUO (OAUTH)">
          <Text style={styles.hint}>
            OAuth2 + PKCE against your GitLab instance. Add this redirect URI to your GitLab OAuth
            application: {getRedirectUri()}
          </Text>
          <Text style={[styles.label, { marginTop: 12 }]}>Application ID</Text>
          <Text style={styles.hint}>
            Paste from GitLab → Preferences → Applications. Overrides EXPO_PUBLIC_GITLAB_CLIENT_ID
            when set. Scopes: read_user, ai_features.
          </Text>
          <LinearTextInput
            value={gitlabOauthClientId}
            onChangeText={setGitlabOauthClientId}
            placeholder="Your GitLab OAuth Application ID"
            placeholderTextColor={linearTheme.colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!gitlabDuoConnecting}
            style={{
              marginTop: 8,
              borderWidth: 1,
              borderColor: linearTheme.colors.border,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              color: linearTheme.colors.textPrimary,
              fontSize: 15,
            }}
          />
          <Text style={[styles.label, { marginTop: 12 }]}>Application secret</Text>
          <Text style={styles.hint}>
            Confidential apps (default on GitLab.com) require this on token exchange — paste from
            the same Applications page. Stored only in on-device secure storage, not in backups.
            Leave empty only if you created a non-confidential (public) OAuth app.
          </Text>
          <LinearTextInput
            value={gitlabOauthClientSecret}
            onChangeText={setGitlabOauthClientSecret}
            placeholder="OAuth application secret"
            placeholderTextColor={linearTheme.colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            editable={!gitlabDuoConnecting}
            style={{
              marginTop: 8,
              borderWidth: 1,
              borderColor: linearTheme.colors.border,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              color: linearTheme.colors.textPrimary,
              fontSize: 15,
            }}
          />
          <View
            style={{
              marginTop: 12,
              padding: 12,
              borderWidth: 1,
              borderColor: linearTheme.colors.border,
              borderRadius: 12,
              backgroundColor: linearTheme.colors.background,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Ionicons
                name={gitlabDuoConnected ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={
                  gitlabDuoConnected ? linearTheme.colors.success : linearTheme.colors.textMuted
                }
              />
              <Text
                style={[
                  styles.label,
                  {
                    flex: 1,
                    color: gitlabDuoConnected
                      ? linearTheme.colors.success
                      : linearTheme.colors.textMuted,
                  },
                ]}
              >
                {gitlabDuoConnected ? 'Connected' : 'Not connected'}
              </Text>
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
                    <ActivityIndicator size="small" color={linearTheme.colors.accent} />
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
                          ? linearTheme.colors.success
                          : gitlabDuoOAuthTestResult === 'fail'
                            ? linearTheme.colors.error
                            : linearTheme.colors.accent
                      }
                    />
                  )}
                </TouchableOpacity>
                {gitlabDuoConnected ? (
                  <TouchableOpacity
                    style={[
                      styles.validateBtn,
                      { backgroundColor: linearTheme.colors.error + '22', paddingHorizontal: 16 },
                    ]}
                    onPress={disconnectGitLabDuo}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={{ color: linearTheme.colors.error, fontWeight: '600', fontSize: 13 }}
                    >
                      Disconnect
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    <TouchableOpacity
                      style={[
                        styles.validateBtn,
                        {
                          paddingHorizontal: 12,
                          backgroundColor: linearTheme.colors.accent + '22',
                        },
                      ]}
                      onPress={connectGitLabDuo}
                      disabled={gitlabDuoConnecting}
                      activeOpacity={0.8}
                    >
                      {gitlabDuoConnecting ? (
                        <ActivityIndicator size="small" color={linearTheme.colors.accent} />
                      ) : (
                        <Text
                          style={{
                            color: linearTheme.colors.accent,
                            fontWeight: '600',
                            fontSize: 13,
                          }}
                        >
                          Connect
                        </Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.validateBtn,
                        {
                          paddingHorizontal: 12,
                          backgroundColor: linearTheme.colors.border + '44',
                        },
                      ]}
                      onPress={() => setGitlabPasteModalVisible(true)}
                      disabled={gitlabDuoConnecting}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={{
                          color: linearTheme.colors.textPrimary,
                          fontWeight: '600',
                          fontSize: 13,
                        }}
                      >
                        Paste URL
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          </View>
          <Text style={[styles.hint, { marginTop: 8 }]}>
            Validate (pulse icon): checks OAuth token +{' '}
            <Text style={{ fontFamily: 'Inter_400Regular' }}>
              POST {getGitLabInstanceUrl()}/api/v4/chat/completions
            </Text>
            . Metro:{' '}
            <Text style={{ fontFamily: 'Inter_400Regular' }}>[SETTINGS_VALIDATE][gitlab_duo]</Text>
          </Text>
          <Text style={[styles.hint, { marginTop: 12 }]}>
            Default GitLab Duo model for Auto routing. If unavailable, Guru automatically tries the
            next best model in catalog order.
          </Text>
          <SettingsModelDropdown
            label="Default GitLab Duo model"
            value={gitlabDuoPreferredModel}
            onSelect={setGitlabDuoPreferredModel}
            options={[
              { id: '', label: 'Default (catalog order)', group: 'GitLab Duo' },
              ...GITLAB_DUO_MODELS.map((m) => ({ id: m, label: m, group: 'GitLab Duo' })),
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
                <Pressable
                  style={[styles.dropdownSheet, { minWidth: '88%' }]}
                  onPress={(e) => e.stopPropagation()}
                >
                  <Text style={styles.dropdownSheetTitle}>Paste GitLab callback URL</Text>
                  <Text style={[styles.hint, { marginBottom: 8 }]}>
                    After authorizing, paste the full guru-study://oauth/gitlab?... link (same
                    device after tapping Connect).
                  </Text>
                  <LinearTextInput
                    value={gitlabPasteUrl}
                    onChangeText={setGitlabPasteUrl}
                    placeholder="guru-study://oauth/gitlab?code=..."
                    placeholderTextColor={linearTheme.colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    multiline
                    style={{
                      borderWidth: 1,
                      borderColor: linearTheme.colors.border,
                      borderRadius: 10,
                      padding: 12,
                      color: linearTheme.colors.textPrimary,
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
                      <Text style={{ color: linearTheme.colors.textMuted, fontWeight: '600' }}>
                        Cancel
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => void submitGitLabPasteUrl()}
                      disabled={gitlabPasteSubmitting}
                      style={{
                        paddingVertical: 10,
                        paddingHorizontal: 16,
                        backgroundColor: linearTheme.colors.accent + '33',
                        borderRadius: 10,
                      }}
                    >
                      {gitlabPasteSubmitting ? (
                        <ActivityIndicator size="small" color={linearTheme.colors.accent} />
                      ) : (
                        <Text style={{ color: linearTheme.colors.accent, fontWeight: '700' }}>
                          Apply
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </Pressable>
              </Pressable>
            </KeyboardAvoidingView>
          </Modal>
        </SubSectionToggle>

        <View style={styles.subSectionDivider} />
        <SubSectionToggle id="poe_oauth" title="POE (OAUTH)">
          <Text style={styles.hint}>
            Connect your Poe subscription through device code flow. Access Claude, GPT-4o, Gemini
            and more through Poe's API.
          </Text>
          {poeConnecting && poeDeviceCode ? (
            <View style={{ marginTop: 8 }}>
              <Text style={[styles.label, { textAlign: 'center', marginBottom: 4 }]}>
                Enter this code at poe.com:
              </Text>
              <Text
                style={{
                  fontSize: 28,
                  fontWeight: '700',
                  textAlign: 'center',
                  color: linearTheme.colors.accent,
                  letterSpacing: 4,
                  marginVertical: 8,
                  fontFamily: 'Inter_400Regular',
                }}
                selectable
              >
                {poeDeviceCode.user_code}
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
                <ActivityIndicator size="small" color={linearTheme.colors.accent} />
                <Text style={[styles.hint, { marginTop: 0 }]}>Waiting for authorization...</Text>
              </View>
              <TouchableOpacity
                style={{ marginTop: 12, alignSelf: 'center' }}
                onPress={() => Linking.openURL(POE_VERIFICATION_URL)}
                activeOpacity={0.7}
              >
                <Text
                  style={{
                    color: linearTheme.colors.accent,
                    textDecorationLine: 'underline',
                    fontSize: 13,
                  }}
                >
                  Open login page again
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <View
            style={{
              marginTop: 12,
              padding: 12,
              borderWidth: 1,
              borderColor: linearTheme.colors.border,
              borderRadius: 12,
              backgroundColor: linearTheme.colors.background,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Ionicons
                name={poeConnected ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={poeConnected ? linearTheme.colors.success : linearTheme.colors.textMuted}
              />
              <Text
                style={[
                  styles.label,
                  {
                    flex: 1,
                    color: poeConnected ? linearTheme.colors.success : linearTheme.colors.textMuted,
                  },
                ]}
              >
                {poeConnected ? 'Connected' : 'Not connected'}
              </Text>
              {poeConnected ? (
                <TouchableOpacity
                  style={[
                    styles.validateBtn,
                    { backgroundColor: linearTheme.colors.error + '22', paddingHorizontal: 16 },
                  ]}
                  onPress={disconnectPoe}
                  activeOpacity={0.8}
                >
                  <Text
                    style={{ color: linearTheme.colors.error, fontWeight: '600', fontSize: 13 }}
                  >
                    Disconnect
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.validateBtn,
                    { paddingHorizontal: 16, backgroundColor: linearTheme.colors.accent + '22' },
                  ]}
                  onPress={connectPoe}
                  disabled={poeConnecting}
                  activeOpacity={0.8}
                >
                  {poeConnecting ? (
                    <ActivityIndicator size="small" color={linearTheme.colors.accent} />
                  ) : (
                    <Text
                      style={{ color: linearTheme.colors.accent, fontWeight: '600', fontSize: 13 }}
                    >
                      Connect
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </SubSectionToggle>

        <View style={styles.subSectionDivider} />
        <SubSectionToggle id="ai_api_keys" title="API KEYS">
          <SettingsLabel text="Groq" />
          <View style={styles.apiKeyRow}>
            <LinearTextInput
              style={[styles.input, styles.apiKeyInput]}
              placeholder="gsk_..."
              placeholderTextColor={linearTheme.colors.textMuted}
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
                <ActivityIndicator size="small" color={linearTheme.colors.accent} />
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
                      ? linearTheme.colors.success
                      : groqValidationStatus === 'fail'
                        ? linearTheme.colors.error
                        : linearTheme.colors.accent
                  }
                />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>
            Transcription + AI generation. Free key at console.groq.com
          </Text>
          <SettingsLabel text="GitHub Models" />
          <View style={styles.apiKeyRow}>
            <LinearTextInput
              style={[styles.input, styles.apiKeyInput]}
              placeholder="GitHub PAT (Models read)"
              placeholderTextColor={linearTheme.colors.textMuted}
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
                <ActivityIndicator size="small" color={linearTheme.colors.accent} />
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
                      ? linearTheme.colors.success
                      : githubValidationStatus === 'fail'
                        ? linearTheme.colors.error
                        : linearTheme.colors.accent
                  }
                />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>
            Fine-grained PAT with Models (read) scope at models.github.ai
          </Text>
          <SettingsLabel text="OpenRouter" />
          <View style={styles.apiKeyRow}>
            <LinearTextInput
              style={[styles.input, styles.apiKeyInput]}
              placeholder="sk-or-v1-..."
              placeholderTextColor={linearTheme.colors.textMuted}
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
                <ActivityIndicator size="small" color={linearTheme.colors.accent} />
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
                      ? linearTheme.colors.success
                      : openRouterValidationStatus === 'fail'
                        ? linearTheme.colors.error
                        : linearTheme.colors.accent
                  }
                />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>Free model fallback. Key at openrouter.ai</Text>
          <SettingsLabel text="Kilo" />
          <View style={styles.apiKeyRow}>
            <LinearTextInput
              style={[styles.input, styles.apiKeyInput]}
              placeholder="kilo_..."
              placeholderTextColor={linearTheme.colors.textMuted}
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
                <ActivityIndicator size="small" color={linearTheme.colors.accent} />
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
                      ? linearTheme.colors.success
                      : kiloValidationStatus === 'fail'
                        ? linearTheme.colors.error
                        : linearTheme.colors.accent
                  }
                />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>
            Gateway at api.kilo.ai (e.g. kilo-auto/balanced, xiaomi/mimo-v2-pro)
          </Text>
          <SettingsLabel text="DeepSeek" />
          <View style={styles.apiKeyRow}>
            <LinearTextInput
              style={[styles.input, styles.apiKeyInput]}
              placeholder="sk-..."
              placeholderTextColor={linearTheme.colors.textMuted}
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
                <ActivityIndicator size="small" color={linearTheme.colors.accent} />
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
                      ? linearTheme.colors.success
                      : deepseekValidationStatus === 'fail'
                        ? linearTheme.colors.error
                        : linearTheme.colors.accent
                  }
                />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>Key at platform.deepseek.com</Text>
          <SettingsLabel text="AgentRouter" />
          <View style={styles.apiKeyRow}>
            <LinearTextInput
              style={[styles.input, styles.apiKeyInput]}
              placeholder="sk-..."
              placeholderTextColor={linearTheme.colors.textMuted}
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
                <ActivityIndicator size="small" color={linearTheme.colors.accent} />
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
                      ? linearTheme.colors.success
                      : agentRouterValidationStatus === 'fail'
                        ? linearTheme.colors.error
                        : linearTheme.colors.accent
                  }
                />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>Free proxy. Key at agentrouter.org/console/token</Text>
          <SettingsLabel text="Google Gemini" />
          <View style={styles.apiKeyRow}>
            <LinearTextInput
              style={[styles.input, styles.apiKeyInput]}
              placeholder="AIza..."
              placeholderTextColor={linearTheme.colors.textMuted}
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
                <ActivityIndicator size="small" color={linearTheme.colors.accent} />
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
                      ? linearTheme.colors.success
                      : geminiValidationStatus === 'fail'
                        ? linearTheme.colors.error
                        : linearTheme.colors.accent
                  }
                />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>Chat + image models. Key at aistudio.google.com/apikey</Text>
          <SettingsToggleRow
            label="Structured JSON (Gemini)"
            hint="When on, structured AI outputs (quizzes, daily plan, lecture analysis) use Gemini native JSON + schema first if your Gemini key is set. Turn off to force text-only parsing (for debugging)."
            value={preferGeminiStructuredJson}
            onValueChange={setPreferGeminiStructuredJson}
          />
          <SettingsLabel text="Deepgram" />
          <View style={styles.apiKeyRow}>
            <LinearTextInput
              style={[styles.input, styles.apiKeyInput]}
              placeholder="dg_..."
              placeholderTextColor={linearTheme.colors.textMuted}
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
                <ActivityIndicator size="small" color={linearTheme.colors.accent} />
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
                      ? linearTheme.colors.success
                      : deepgramValidationStatus === 'fail'
                        ? linearTheme.colors.error
                        : linearTheme.colors.accent
                  }
                />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>Live lecture quiz sidecar. Key at console.deepgram.com</Text>
          <SettingsLabel text="Cloudflare Workers AI" />
          <View style={styles.apiKeyRow}>
            <LinearTextInput
              style={[styles.input, styles.apiKeyInput]}
              placeholder="Account ID (32-char hex)"
              placeholderTextColor={linearTheme.colors.textMuted}
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
                <ActivityIndicator size="small" color={linearTheme.colors.accent} />
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
                      ? linearTheme.colors.success
                      : cloudflareValidationStatus === 'fail'
                        ? linearTheme.colors.error
                        : linearTheme.colors.accent
                  }
                />
              )}
            </TouchableOpacity>
          </View>
          <LinearTextInput
            style={styles.input}
            placeholder="API Token (Workers AI read)"
            placeholderTextColor={linearTheme.colors.textMuted}
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
          <Text style={styles.hint}>Chat, images, and Whisper transcription via Cloudflare</Text>
        </SubSectionToggle>

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
                  return true;
                case 'openrouter':
                  return !!(orKey.trim() || profile?.openrouterKey);
                case 'cloudflare':
                  return !!(
                    (cfAccountId.trim() || profile?.cloudflareAccountId) &&
                    (cfApiToken.trim() || profile?.cloudflareApiToken)
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
              props.setProviderOrder(reset);
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
          <SubSectionToggle id="qwen_oauth" title="QWEN (FREE OAUTH)">
            <Text style={styles.hint}>
              Connect your Qwen.ai account for free access to qwen-coder-plus, qwen-coder-flash, and
              qwen-vl-plus. 1,000 requests/day, 60 req/min. No API key needed.
            </Text>
            {qwenConnecting && qwenDeviceCode ? (
              <View style={{ marginTop: 8 }}>
                <Text style={[styles.label, { textAlign: 'center', marginBottom: 4 }]}>
                  Enter this code at chat.qwen.ai:
                </Text>
                <Text
                  style={{
                    fontSize: 28,
                    fontWeight: '700',
                    textAlign: 'center',
                    color: linearTheme.colors.accent,
                    letterSpacing: 4,
                    marginVertical: 8,
                    fontFamily: 'Inter_400Regular',
                  }}
                  selectable
                >
                  {qwenDeviceCode.user_code}
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
                  <ActivityIndicator size="small" color={linearTheme.colors.accent} />
                  <Text style={[styles.hint, { marginTop: 0 }]}>Waiting for authorization...</Text>
                </View>
                <TouchableOpacity
                  style={{ marginTop: 12, alignSelf: 'center' }}
                  onPress={() =>
                    qwenDeviceCode && Linking.openURL(qwenDeviceCode.verification_uri_complete)
                  }
                  activeOpacity={0.7}
                >
                  <Text
                    style={{
                      color: linearTheme.colors.accent,
                      textDecorationLine: 'underline',
                      fontSize: 13,
                    }}
                  >
                    Open login page again
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ marginTop: 12 }}>
                {qwenConnected ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 12,
                      borderWidth: 1,
                      borderColor: linearTheme.colors.success + '44',
                      borderRadius: 12,
                      backgroundColor: linearTheme.colors.success + '11',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={linearTheme.colors.success}
                      />
                      <Text style={{ color: linearTheme.colors.success, fontWeight: '700' }}>
                        Connected
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 8,
                        borderRadius: 8,
                        backgroundColor: linearTheme.colors.error + '22',
                      }}
                      onPress={disconnectQwen}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={{ color: linearTheme.colors.error, fontWeight: '700', fontSize: 13 }}
                      >
                        Disconnect
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      padding: 14,
                      borderWidth: 1,
                      borderColor: linearTheme.colors.accent + '66',
                      borderRadius: 12,
                      backgroundColor: linearTheme.colors.accent + '11',
                    }}
                    onPress={connectQwen}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="cloud-outline" size={20} color={linearTheme.colors.accent} />
                    <Text
                      style={{ color: linearTheme.colors.accent, fontWeight: '700', fontSize: 14 }}
                    >
                      Connect Qwen (Free)
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </SubSectionToggle>
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
