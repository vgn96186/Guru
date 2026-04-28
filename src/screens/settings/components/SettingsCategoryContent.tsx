import React from 'react';
import Animated, { FadeIn } from 'react-native-reanimated';
import { DashboardOverview } from '../sections/DashboardOverview';
import { GeneralOverviewSection } from '../sections/GeneralOverviewSection';
import { AppearanceSection } from '../sections/AppearanceSection';
import AiProvidersSection from '../sections/ai-providers';
import { InterventionsSection } from '../sections/InterventionsSection';
import { AppIntegrationsSection } from '../sections/AppIntegrationsSection';
import { SamsungBackgroundRow } from './SettingsScreenShell';
import { PlanningAlertsSection } from '../sections/PlanningAlertsSection';
import { DeviceSyncSection } from '../sections/DeviceSyncSection';
import StorageSections from '../sections/StorageSections';
import AdvancedSettingsSection from '../sections/AdvancedSettingsSection';
import { formatGuruChatModelChipLabel } from '../../../services/ai/guruChatModelPreference';
import type { SettingsCategory } from '../../../types';

type ValidationStatus = 'ok' | 'fail' | null;

function toFieldValidationStatus(status: ValidationStatus) {
  return status === 'ok' ? 'valid' : status === 'fail' ? 'invalid' : 'idle';
}

const CATEGORY_ENTER = FadeIn.duration(180).withInitialValues({
  opacity: 0,
  transform: [{ translateY: 10 }],
});

// SettingsScreen still owns the state. This component only owns category rendering
// while the remaining refactor breaks the state into smaller domain hooks.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- transitional settings refactor boundary
export default function SettingsCategoryContent(props: any) {
  const {
    activeCategory,
    isTabletLayout,
    setActiveCategory,
    styles,
    SectionToggle,
    SubSectionToggle,
    navigation,
    profile,
    name,
    setName,
    loadingOrbStyle,
    setLoadingOrbStyle,
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
    apiKeys,
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
    refreshProfile,
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
  } = props;

  const content = (() => {
    switch (activeCategory as SettingsCategory) {
    case 'dashboard':
      return (
        <>
          <DashboardOverview isTablet={isTabletLayout} setActiveCategory={setActiveCategory} />
          <GeneralOverviewSection
            styles={styles}
            SectionToggle={SectionToggle}
            navigation={navigation}
            name={name}
            setName={setName}
            loadingOrbStyle={loadingOrbStyle}
            setLoadingOrbStyle={setLoadingOrbStyle}
          />
        </>
      );
    case 'appearance':
      return (
        <AppearanceSection
          SectionToggle={SectionToggle}
          loadingOrbStyle={loadingOrbStyle}
          setLoadingOrbStyle={setLoadingOrbStyle}
        />
      );
    case 'profile':
      return (
        <GeneralOverviewSection
          styles={styles}
          SectionToggle={SectionToggle}
          navigation={navigation}
          name={name}
          setName={setName}
          loadingOrbStyle={loadingOrbStyle}
          setLoadingOrbStyle={setLoadingOrbStyle}
        />
      );
    case 'ai':
      return (
        <AiProvidersSection
          styles={styles}
          SectionToggle={SectionToggle}
          SubSectionToggle={SubSectionToggle}
          navigation={navigation}
          profile={profile}
          guruChat={{
            models: liveGuruChatModels,
            defaultModel: guruChatDefaultModel,
            setDefaultModel: setGuruChatDefaultModel,
            formatModelChipLabel: formatGuruChatModelChipLabel,
          }}
          guruMemory={{ notes: guruMemoryNotes, setNotes: setGuruMemoryNotes }}
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
          transcriptionProvider={transcriptionProvider}
          setTranscriptionProvider={setTranscriptionProvider}
          apiKeys={{
            groq: {
              ...apiKeys.groq,
              validationStatus: toFieldValidationStatus(apiKeys.groq.validationStatus),
            },
            githubModelsPat: {
              ...apiKeys.githubModelsPat,
              validationStatus: toFieldValidationStatus(apiKeys.githubModelsPat.validationStatus),
            },
            openrouter: {
              ...apiKeys.openrouter,
              validationStatus: toFieldValidationStatus(apiKeys.openrouter.validationStatus),
            },
            kilo: {
              ...apiKeys.kilo,
              validationStatus: toFieldValidationStatus(apiKeys.kilo.validationStatus),
            },
            deepseek: {
              ...apiKeys.deepseek,
              validationStatus: toFieldValidationStatus(apiKeys.deepseek.validationStatus),
            },
            agentRouter: {
              ...apiKeys.agentRouter,
              validationStatus: toFieldValidationStatus(apiKeys.agentRouter.validationStatus),
            },
            gemini: {
              ...apiKeys.gemini,
              validationStatus: toFieldValidationStatus(apiKeys.gemini.validationStatus),
            },
            huggingface: {
              ...apiKeys.huggingface,
              validationStatus: toFieldValidationStatus(apiKeys.huggingface.validationStatus),
            },
            deepgram: {
              ...apiKeys.deepgram,
              validationStatus: toFieldValidationStatus(apiKeys.deepgram.validationStatus),
            },
            vertex: {
              ...apiKeys.vertex,
              validationStatus: toFieldValidationStatus(apiKeys.vertex.validationStatus),
            },
            cloudflare: {
              ...apiKeys.cloudflare,
              validationStatus: toFieldValidationStatus(apiKeys.cloudflare.validationStatus),
            },
            fal: {
              ...apiKeys.fal,
              validationStatus: toFieldValidationStatus(apiKeys.fal.validationStatus),
            },
            jina: {
              ...apiKeys.jina,
              validationStatus: toFieldValidationStatus(apiKeys.jina.validationStatus),
            },
            braveSearch: {
              ...apiKeys.braveSearch,
              validationStatus: toFieldValidationStatus(apiKeys.braveSearch.validationStatus),
            },
          }}
          gemini={{
            preferStructuredJson: preferGeminiStructuredJson,
            setPrefer: setPreferGeminiStructuredJson,
          }}
          routing={{ providerOrder, moveProvider, setProviderOrder }}
          imageGen={{
            options: imageGenerationOptions,
            model: imageGenerationModel,
            setModel: setImageGenerationModel,
            order: imageGenerationOrder,
            setOrder: setImageGenerationOrder,
          }}
          transcriptionOrder={transcriptionOrder}
          setTranscriptionOrder={setTranscriptionOrder}
          localAi={{
            enabled: localAiEnabled,
            llmReady: localLlmReady,
            llmFileName: localLlmFileName,
            whisperReady: localWhisperReady,
            whisperFileName: localWhisperFileName,
            llmAllowed: localLlmAllowed,
            llmWarning: localLlmWarning ?? '',
            useNano: profile?.useNano ?? true,
          }}
          updateUserProfile={updateUserProfile}
          refreshProfile={refreshProfile}
          clearProviderValidated={clearProviderValidated}
        />
      );
    case 'interventions':
      return (
        <InterventionsSection
          styles={styles}
          SectionToggle={SectionToggle}
          strictMode={strictMode}
          setStrictMode={setStrictMode}
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
      );
    case 'integrations':
      return (
        <>
          <AppIntegrationsSection
            styles={styles}
            SectionToggle={SectionToggle}
            permStatus={permStatus}
            onRequestNotifications={onRequestNotifications}
            onRequestMic={onRequestMic}
            onRequestLocalFiles={onRequestLocalFiles}
            onRequestOverlay={onRequestOverlay}
          />
          <SamsungBackgroundRow />
        </>
      );
    case 'planning':
      return (
        <PlanningAlertsSection
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
          notifs={notifs}
          setNotifs={setNotifs}
          notifHour={notifHour}
          setNotifHour={setNotifHour}
          testNotification={testNotification}
          guruFrequency={guruFrequency}
          setGuruFrequency={setGuruFrequency}
        />
      );
    case 'sync':
      return <DeviceSyncSection SectionToggle={SectionToggle} />;
    case 'storage':
      return (
        <StorageSections
          styles={styles}
          SectionToggle={SectionToggle}
          navigation={navigation}
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
      );
    case 'advanced':
      return (
        <AdvancedSettingsSection
          SectionToggle={SectionToggle}
          styles={styles}
          onOpenSystemSettings={onOpenSystemSettings}
          onOpenDevConsole={onOpenDevConsole}
        />
      );
    default:
      return null;
  }
  })();

  if (!content) return null;

  return (
    <Animated.View key={activeCategory} entering={CATEGORY_ENTER}>
      {content}
    </Animated.View>
  );
}
