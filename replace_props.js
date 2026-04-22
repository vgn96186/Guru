const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'src/screens/SettingsScreen.tsx');
let content = fs.readFileSync(file, 'utf8');

const regex = /<AiProvidersSection[\s\S]*?useNano={profile\?\.useNano \?\? true}\n\s*\/>/;

const replacement = `<AiProvidersSection
            styles={styles}
            SectionToggle={SectionToggle}
            SubSectionToggle={SubSectionToggle}
            navigation={navigation}
            profile={profile!}
            guruChat={{
              models: liveGuruChatModels,
              defaultModel: guruChatDefaultModel,
              setDefaultModel: setGuruChatDefaultModel,
              formatModelChipLabel: formatGuruChatModelChipLabel,
            }}
            guruMemory={{
              notes: guruMemoryNotes,
              setNotes: setGuruMemoryNotes,
            }}
            chatgpt={{
              connectingSlot: chatgptConnectingSlot,
              deviceCode: chatgptDeviceCode,
              accounts: chatgptAccounts,
              setAccounts: setChatgptAccounts,
              connect: connectChatGpt,
              disconnect: disconnectChatGpt,
            }}
            githubCopilot={{
              connecting: githubCopilotConnecting,
              deviceCode: githubCopilotDeviceCode,
              connected: githubCopilotConnected,
              connect: connectGitHubCopilot,
              disconnect: disconnectGitHubCopilot,
              testResult: githubCopilotOAuthTestResult,
              validateConnection: validateGitHubCopilotConnection,
              testingOAuth: testingGitHubCopilotOAuth,
              preferredModel: githubCopilotPreferredModel,
              setPreferredModel: setGithubCopilotPreferredModel,
            }}
            gitlabDuo={{
              connecting: gitlabDuoConnecting,
              connected: gitlabDuoConnected,
              connect: connectGitLabDuo,
              disconnect: disconnectGitLabDuo,
              clientId: gitlabOauthClientId,
              setClientId: setGitlabOauthClientId,
              clientSecret: gitlabOauthClientSecret,
              setClientSecret: setGitlabOauthClientSecret,
              testResult: gitlabDuoOAuthTestResult,
              validateConnection: validateGitLabDuoConnection,
              testingOAuth: testingGitLabDuoOAuth,
              preferredModel: gitlabDuoPreferredModel,
              setPreferredModel: setGitlabDuoPreferredModel,
              pasteModalVisible: gitlabPasteModalVisible,
              setPasteModalVisible: setGitlabPasteModalVisible,
              pasteUrl: gitlabPasteUrl,
              setPasteUrl: setGitlabPasteUrl,
              submitPasteUrl: submitGitLabPasteUrl,
              pasteSubmitting: gitlabPasteSubmitting,
            }}
            poe={{
              connecting: poeConnecting,
              deviceCode: poeDeviceCode,
              connected: poeConnected,
              connect: connectPoe,
              disconnect: disconnectPoe,
            }}
            qwen={{
              connecting: qwenConnecting,
              deviceCode: qwenDeviceCode,
              connected: qwenConnected,
              connect: connectQwen,
              disconnect: disconnectQwen,
            }}
            apiKeys={{
              groq: {
                value: groqKey,
                setValue: setGroqKey,
                setTestResult: setGroqKeyTestResult,
                validationStatus: groqValidationStatus === 'ok' ? 'valid' : groqValidationStatus === 'fail' ? 'invalid' : 'idle',
                test: testGroqKey,
                testing: testingGroqKey,
              },
              githubModelsPat: {
                value: githubModelsPat,
                setValue: setGithubModelsPat,
                setTestResult: setGithubPatTestResult,
                validationStatus: githubValidationStatus === 'ok' ? 'valid' : githubValidationStatus === 'fail' ? 'invalid' : 'idle',
                test: testGithubModelsPat,
                testing: testingGithubPat,
              },
              openrouter: {
                value: orKey,
                setValue: setOrKey,
                setTestResult: setOpenRouterKeyTestResult,
                validationStatus: openRouterValidationStatus === 'ok' ? 'valid' : openRouterValidationStatus === 'fail' ? 'invalid' : 'idle',
                test: testOpenRouterKey,
                testing: testingOpenRouterKey,
              },
              kilo: {
                value: kiloApiKey,
                setValue: setKiloApiKey,
                setTestResult: setKiloKeyTestResult,
                validationStatus: kiloValidationStatus === 'ok' ? 'valid' : kiloValidationStatus === 'fail' ? 'invalid' : 'idle',
                test: testKiloKey,
                testing: testingKiloKey,
              },
              deepseek: {
                value: deepseekKey,
                setValue: setDeepseekKey,
                setTestResult: setDeepseekKeyTestResult,
                validationStatus: deepseekValidationStatus === 'ok' ? 'valid' : deepseekValidationStatus === 'fail' ? 'invalid' : 'idle',
                test: testDeepseekKey,
                testing: testingDeepseekKey,
              },
              agentRouter: {
                value: agentRouterKey,
                setValue: setAgentRouterKey,
                setTestResult: setAgentRouterKeyTestResult,
                validationStatus: agentRouterValidationStatus === 'ok' ? 'valid' : agentRouterValidationStatus === 'fail' ? 'invalid' : 'idle',
                test: testAgentRouterKey,
                testing: testingAgentRouterKey,
              },
              gemini: {
                value: geminiKey,
                setValue: setGeminiKey,
                setTestResult: setGeminiKeyTestResult,
                validationStatus: geminiValidationStatus === 'ok' ? 'valid' : geminiValidationStatus === 'fail' ? 'invalid' : 'idle',
                test: testGeminiKey,
                testing: testingGeminiKey,
              },
              deepgram: {
                value: deepgramApiKey,
                setValue: setDeepgramApiKey,
                setTestResult: setDeepgramKeyTestResult,
                validationStatus: deepgramValidationStatus === 'ok' ? 'valid' : deepgramValidationStatus === 'fail' ? 'invalid' : 'idle',
                test: testDeepgramKey,
                testing: testingDeepgramKey,
              },
              cloudflare: {
                accountId: cfAccountId,
                setAccountId: setCfAccountId,
                apiToken: cfApiToken,
                setApiToken: setCfApiToken,
                setTestResult: setCloudflareTestResult,
                validationStatus: cloudflareValidationStatus === 'ok' ? 'valid' : cloudflareValidationStatus === 'fail' ? 'invalid' : 'idle',
                test: testCloudflareKeys,
                testing: testingCloudflare,
              },
              fal: {
                value: falApiKey,
                setValue: setFalApiKey,
                setTestResult: setFalKeyTestResult,
                validationStatus: falValidationStatus === 'ok' ? 'valid' : falValidationStatus === 'fail' ? 'invalid' : 'idle',
                test: testFalKey,
                testing: testingFalKey,
              },
              braveSearch: {
                value: braveSearchApiKey,
                setValue: setBraveSearchApiKey,
                setTestResult: setBraveSearchKeyTestResult,
                validationStatus: braveValidationStatus === 'ok' ? 'valid' : braveValidationStatus === 'fail' ? 'invalid' : 'idle',
                test: testBraveSearchKey,
                testing: testingBraveSearchKey,
              }
            }}
            gemini={{
              preferStructuredJson: preferGeminiStructuredJson,
              setPrefer: setPreferGeminiStructuredJson,
            }}
            routing={{
              providerOrder: providerOrder,
              moveProvider: moveProvider,
            }}
            imageGen={{
              options: imageGenerationOptions,
              model: imageGenerationModel,
              setModel: setImageGenerationModel,
            }}
            localAi={{
              enabled: localAiEnabled,
              llmReady: localLlmReady,
              llmFileName: localLlmFileName,
              whisperReady: localWhisperReady,
              whisperFileName: localWhisperFileName,
              llmAllowed: localLlmAllowed,
              llmWarning: localLlmWarning,
              useNano: profile?.useNano ?? true,
            }}
            updateUserProfile={updateUserProfile}
            refreshProfile={refreshProfile}
            clearProviderValidated={clearProviderValidated}
          />`;

if (content.match(regex)) {
  fs.writeFileSync(file, content.replace(regex, replacement));
  console.log('Replaced successfully');
} else {
  console.log('Regex did not match!');
}
