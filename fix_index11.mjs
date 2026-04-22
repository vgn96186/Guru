import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/screens/settings/sections/ai-providers/index.tsx');
let content = fs.readFileSync(file, 'utf8');

// remove unused apiKeys destructurings
const apiKeysStr = \`  const {
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
        : null;\`;

content = content.replace(apiKeysStr, '');

// Also remove unused variables
content = content.replace(
  \`const {
    preferStructuredJson: preferGeminiStructuredJson,
    setPrefer: setPreferGeminiStructuredJson,
  } = gemini;\`,
  ''
);

// We need to keep:
//  const hasValue = (value: string | null | undefined) => Boolean(value?.trim());
//  const readyProviderCount = [
//    ...
//    hasValue(apiKeys.groq.value),

content = content.replace('hasValue(groqKey)', 'hasValue(apiKeys.groq.value)');
content = content.replace('hasValue(githubModelsPat)', 'hasValue(apiKeys.githubModelsPat.value)');
content = content.replace('hasValue(orKey)', 'hasValue(apiKeys.openrouter.value)');
content = content.replace('hasValue(kiloApiKey)', 'hasValue(apiKeys.kilo.value)');
content = content.replace('hasValue(deepseekKey)', 'hasValue(apiKeys.deepseek.value)');
content = content.replace('hasValue(agentRouterKey)', 'hasValue(apiKeys.agentRouter.value)');
content = content.replace('hasValue(geminiKey)', 'hasValue(apiKeys.gemini.value)');
content = content.replace('hasValue(deepgramApiKey)', 'hasValue(apiKeys.deepgram.value)');
content = content.replace('hasValue(falApiKey)', 'hasValue(apiKeys.fal.value)');
content = content.replace('hasValue(braveSearchApiKey)', 'hasValue(apiKeys.braveSearch.value)');
content = content.replace('hasValue(cfAccountId) && hasValue(cfApiToken)', 'hasValue(apiKeys.cloudflare.accountId) && hasValue(apiKeys.cloudflare.apiToken)');

// Also remove other unused destructures
content = content.replace(\`  const {
    connectingSlot: chatgptConnectingSlot,
    deviceCode: chatgptDeviceCode,
    accounts: chatgptAccounts,
    setAccounts: setChatgptAccounts,
    connect: connectChatGpt,
    disconnect: disconnectChatGpt,
  } = chatgpt;\`, \`const { accounts: chatgptAccounts } = chatgpt;\`);

content = content.replace(\`  const {
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
  } = githubCopilot;\`, \`const { connected: githubCopilotConnected } = githubCopilot;\`);

content = content.replace(\`  const {
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
  } = gitlabDuo;\`, \`const { connected: gitlabDuoConnected } = gitlabDuo;\`);

content = content.replace(\`  const {
    connecting: poeConnecting,
    deviceCode: poeDeviceCode,
    connected: poeConnected,
    disconnect: disconnectPoe,
    connect: connectPoe,
  } = poe;\`, \`const { connected: poeConnected } = poe;\`);

content = content.replace(\`  const {
    connecting: qwenConnecting,
    deviceCode: qwenDeviceCode,
    connected: qwenConnected,
    connect: connectQwen,
    disconnect: disconnectQwen,
  } = qwen;\`, \`const { connected: qwenConnected } = qwen;\`);


fs.writeFileSync(file, content);