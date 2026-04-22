import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/screens/settings/sections/ai-providers/index.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'export default function AiProvidersSection(props: any)',
  `import type { AiProvidersProps } from './types';
import ApiKeysSection from './subsections/ApiKeysSection';

export default function AiProvidersSection(props: AiProvidersProps)`,
);

const splitStr = '  const {';
const parts = content.split(splitStr);

if (parts.length > 1) {
  parts[1] =
    `
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
  
  const { models: liveGuruChatModels, formatModelChipLabel: formatGuruChatModelChipLabel, defaultModel: guruChatDefaultModel, setDefaultModel: setGuruChatDefaultModel } = guruChat;
  const { notes: guruMemoryNotes, setNotes: setGuruMemoryNotes } = guruMemory;
  const { connectingSlot: chatgptConnectingSlot, deviceCode: chatgptDeviceCode, accounts: chatgptAccounts, setAccounts: setChatgptAccounts, connect: connectChatGpt, disconnect: disconnectChatGpt } = chatgpt;
  const { connecting: githubCopilotConnecting, deviceCode: githubCopilotDeviceCode, connected: githubCopilotConnected, testResult: githubCopilotOAuthTestResult, validateConnection: validateGitHubCopilotConnection, testingOAuth: testingGitHubCopilotOAuth, disconnect: disconnectGitHubCopilot, connect: connectGitHubCopilot, preferredModel: githubCopilotPreferredModel, setPreferredModel: setGithubCopilotPreferredModel } = githubCopilot;
  const { clientId: gitlabOauthClientId, setClientId: setGitlabOauthClientId, clientSecret: gitlabOauthClientSecret, setClientSecret: setGitlabOauthClientSecret, connected: gitlabDuoConnected, testResult: gitlabDuoOAuthTestResult, validateConnection: validateGitLabDuoConnection, testingOAuth: testingGitLabDuoOAuth, connecting: gitlabDuoConnecting, disconnect: disconnectGitLabDuo, connect: connectGitLabDuo, setPasteModalVisible: setGitlabPasteModalVisible, preferredModel: gitlabDuoPreferredModel, setPreferredModel: setGitlabDuoPreferredModel, pasteModalVisible: gitlabPasteModalVisible, pasteUrl: gitlabPasteUrl, setPasteUrl: setGitlabPasteUrl, submitPasteUrl: submitGitLabPasteUrl, pasteSubmitting: gitlabPasteSubmitting } = gitlabDuo;
  const { connecting: poeConnecting, deviceCode: poeDeviceCode, connected: poeConnected, disconnect: disconnectPoe, connect: connectPoe } = poe;
  const { connecting: qwenConnecting, deviceCode: qwenDeviceCode, connected: qwenConnected, connect: connectQwen, disconnect: disconnectQwen } = qwen;
  
  const { value: groqKey, setValue: setGroqKey, setTestResult: setGroqKeyTestResult, validationStatus: groqValidationStatusStr, test: testGroqKey, testing: testingGroqKey } = apiKeys.groq;
  const groqValidationStatus = groqValidationStatusStr === 'valid' ? 'ok' : groqValidationStatusStr === 'invalid' ? 'fail' : null;
  const { value: githubModelsPat, setValue: setGithubModelsPat, setTestResult: setGithubPatTestResult, validationStatus: githubValidationStatusStr, test: testGithubModelsPat, testing: testingGithubPat } = apiKeys.githubModelsPat;
  const githubValidationStatus = githubValidationStatusStr === 'valid' ? 'ok' : githubValidationStatusStr === 'invalid' ? 'fail' : null;
  const { value: orKey, setValue: setOrKey, setTestResult: setOpenRouterKeyTestResult, validationStatus: openRouterValidationStatusStr, test: testOpenRouterKey, testing: testingOpenRouterKey } = apiKeys.openrouter;
  const openRouterValidationStatus = openRouterValidationStatusStr === 'valid' ? 'ok' : openRouterValidationStatusStr === 'invalid' ? 'fail' : null;
  const { value: kiloApiKey, setValue: setKiloApiKey, setTestResult: setKiloKeyTestResult, validationStatus: kiloValidationStatusStr, test: testKiloKey, testing: testingKiloKey } = apiKeys.kilo;
  const kiloValidationStatus = kiloValidationStatusStr === 'valid' ? 'ok' : kiloValidationStatusStr === 'invalid' ? 'fail' : null;
  const { value: deepseekKey, setValue: setDeepseekKey, setTestResult: setDeepseekKeyTestResult, validationStatus: deepseekValidationStatusStr, test: testDeepseekKey, testing: testingDeepseekKey } = apiKeys.deepseek;
  const deepseekValidationStatus = deepseekValidationStatusStr === 'valid' ? 'ok' : deepseekValidationStatusStr === 'invalid' ? 'fail' : null;
  const { value: agentRouterKey, setValue: setAgentRouterKey, setTestResult: setAgentRouterKeyTestResult, validationStatus: agentRouterValidationStatusStr, test: testAgentRouterKey, testing: testingAgentRouterKey } = apiKeys.agentRouter;
  const agentRouterValidationStatus = agentRouterValidationStatusStr === 'valid' ? 'ok' : agentRouterValidationStatusStr === 'invalid' ? 'fail' : null;
  const { value: geminiKey, setValue: setGeminiKey, setTestResult: setGeminiKeyTestResult, validationStatus: geminiValidationStatusStr, test: testGeminiKey, testing: testingGeminiKey } = apiKeys.gemini;
  const geminiValidationStatus = geminiValidationStatusStr === 'valid' ? 'ok' : geminiValidationStatusStr === 'invalid' ? 'fail' : null;
  const { value: deepgramApiKey, setValue: setDeepgramApiKey, setTestResult: setDeepgramKeyTestResult, validationStatus: deepgramValidationStatusStr, test: testDeepgramKey, testing: testingDeepgramKey } = apiKeys.deepgram;
  const deepgramValidationStatus = deepgramValidationStatusStr === 'valid' ? 'ok' : deepgramValidationStatusStr === 'invalid' ? 'fail' : null;
  
  const { accountId: cfAccountId, setAccountId: setCfAccountId, apiToken: cfApiToken, setApiToken: setCfApiToken, setTestResult: setCloudflareTestResult, validationStatus: cloudflareValidationStatusStr, test: testCloudflareKeys, testing: testingCloudflare } = apiKeys.cloudflare;
  const cloudflareValidationStatus = cloudflareValidationStatusStr === 'valid' ? 'ok' : cloudflareValidationStatusStr === 'invalid' ? 'fail' : null;
  const { value: falApiKey, setValue: setFalApiKey, setTestResult: setFalKeyTestResult, validationStatus: falValidationStatusStr, test: testFalKey, testing: testingFalKey } = apiKeys.fal;
  const falValidationStatus = falValidationStatusStr === 'valid' ? 'ok' : falValidationStatusStr === 'invalid' ? 'fail' : null;
  const { value: braveSearchApiKey, setValue: setBraveSearchApiKey, setTestResult: setBraveSearchKeyTestResult, validationStatus: braveValidationStatusStr, test: testBraveSearchKey, testing: testingBraveSearchKey } = apiKeys.braveSearch;
  const braveValidationStatus = braveValidationStatusStr === 'valid' ? 'ok' : braveValidationStatusStr === 'invalid' ? 'fail' : null;

  const { preferStructuredJson: preferGeminiStructuredJson, setPrefer: setPreferGeminiStructuredJson } = gemini;
  const { providerOrder, moveProvider } = routing;
  const { options: imageGenerationOptions, model: imageGenerationModel, setModel: setImageGenerationModel } = imageGen;
  const { enabled: localAiEnabled, llmReady: localLlmReady, llmFileName: localLlmFileName, whisperReady: localWhisperReady, whisperFileName: localWhisperFileName, llmAllowed: localLlmAllowed, llmWarning: localLlmWarning, useNano } = localAi;

  const _dummy = {` + parts[1].substring(parts[1].indexOf('} = props;'));

  content = parts[0] + '  const {' + parts[1];
}

const apiKeysRegex =
  /<SubSectionToggle id="ai_api_keys" title="API KEYS">[\s\S]*?<\/SubSectionToggle>/;
if (content.match(apiKeysRegex)) {
  content = content.replace(
    apiKeysRegex,
    '<ApiKeysSection apiKeys={apiKeys} clearProviderValidated={clearProviderValidated} SubSectionToggle={SubSectionToggle} styles={styles} />',
  );
  fs.writeFileSync(file, content);
  console.log('Replaced successfully');
} else {
  console.log('API Keys regex did not match');
}
