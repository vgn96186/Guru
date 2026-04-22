import re


def update_file():
    with open("src/screens/SettingsScreen.tsx", "r") as f:
        content = f.read()

    # Define the new return block
    new_return = """  const allProps = {
    styles, SectionToggle, SubSectionToggle, navigation, permStatus, onRequestNotifications, onRequestMic,
    onRequestLocalFiles, onRequestOverlay, onOpenSystemSettings, onOpenDevConsole, name, setName, inicetDate,
    setInicetDate, neetDate, setNeetDate, handleAutoFetchDates, fetchingDates, fetchDatesMsg,
    dbmciClassStartDate, setDbmciClassStartDate, btrStartDate, setBtrStartDate, homeNoveltyCooldownHours,
    setHomeNoveltyCooldownHours, sessionLength, setSessionLength, dailyGoal, setDailyGoal, strictMode,
    setStrictMode, notifs, setNotifs, notifHour, setNotifHour, guruFrequency, setGuruFrequency,
    testNotification, bodyDoubling, setBodyDoubling, blockedTypes, setBlockedTypes, subjects,
    focusSubjectIds, setFocusSubjectIds, idleTimeout, setIdleTimeout, breakDuration, setBreakDuration,
    pomodoroEnabled, setPomodoroEnabled, pomodoroLectureQuizReady, hasPomodoroOverlayPermission,
    hasPomodoroGroqKey, hasPomodoroDeepgramKey, requestPomodoroOverlay, pomodoroInterval, setPomodoroInterval,
    autoRepairLegacyNotes, setAutoRepairLegacyNotes, scanOrphanedTranscripts, setScanOrphanedTranscripts,
    profile, liveGuruChatModels, formatGuruChatModelChipLabel, guruChatDefaultModel, setGuruChatDefaultModel,
    guruMemoryNotes, setGuruMemoryNotes, chatgptConnectingSlot, chatgptDeviceCode, chatgptAccounts,
    setChatgptAccounts, disconnectChatGpt, connectChatGpt, githubCopilotConnected, setGithubCopilotConnected,
    githubConnecting, githubDeviceCode, connectGitHubCopilot, disconnectGitHubCopilot, gitlabDuoConnected,
    setGitlabDuoConnected, gitlabConnecting, gitlabPendingSession, connectGitLabDuo,
    handleGitLabCustomInstanceUrlConnect, disconnectGitLabDuo, hasPoeKey, hasPoeConnectedAccount, poeConnected,
    setPoeConnected, connectPoeProvider, disconnectPoe, hasQwenKey, hasQwenConnectedAccount, qwenConnected,
    setQwenConnected, connectQwenProvider, disconnectQwen, openrouterKey, setOpenrouterKey, groqApiKey,
    setGroqApiKey, deepgramApiKey, setDeepgramApiKey, geminiApiKey, setGeminiApiKey, githubModelsToken,
    setGithubModelsToken, cfAccountId, setCfAccountId, cfApiToken, setCfApiToken, braveSearchApiKey,
    setBraveSearchApiKey, falApiKey, setFalApiKey, testHuggingFaceConnection, testOpenRouterConnection,
    testGroqConnection, testDeepgramConnection, testGeminiConnection, testGitHubModelsConnection,
    testCloudflareConnection, testBraveSearchConnection, testFalConnection, testKiloConnection,
    localAiEnabled, setLocalAiEnabled, localLlmReady, testLocalLlm, startLocalLlmDownload,
    localWhisperReady, testLocalWhisper, startLocalWhisperDownload, providerOrder, setProviderOrder,
    disabledProviders, setDisabledProviders, isDownloadingLocalModel, localModelProgress, hasAnyLocalModelInProgress,
    testGitHubCopilotConnection, testGitLabDuoConnection, testQwenConnection, resetStudyProgress, clearAiCache,
    testProviderConnection, providerTestStatuses,
  };

  return (
    <SafeAreaView style={styles.safe} className="bg-[#141517] flex-1">
      <StatusBar barStyle="light-content" backgroundColor="#141517" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        
        {/* Header */}
        <View className="h-14 border-b border-[#292A2D] flex-row items-center justify-between px-4 bg-[#141517]/80 z-20">
          <View className="flex-row items-center gap-3">
            <TouchableOpacity onPress={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="p-1.5 rounded-md">
              <LinearText variant="body">☰</LinearText>
            </TouchableOpacity>
            <View className="w-px h-4 bg-[#292A2D] mx-1" />
            <View className="flex-row items-center gap-2">
              <TouchableOpacity onPress={() => navigation.navigate('MenuHome')}>
                <LinearText variant="body" tone="secondary">Hub</LinearText>
              </TouchableOpacity>
              <LinearText variant="body" tone="muted">/</LinearText>
              <LinearText variant="body" tone="primary">
                {activeCategory === 'general' ? 'General Overview' : activeCategory === 'ai' ? 'AI & Inference' : activeCategory === 'interventions' ? 'Interventions' : activeCategory === 'integrations' ? 'App Integrations' : activeCategory === 'planning' ? 'Planning & Alerts' : activeCategory === 'sync' ? 'Device Sync' : 'Data & Storage'}
              </LinearText>
            </View>
          </View>
          {saving && (
            <View className="flex-row items-center bg-[#5E6AD2]/10 px-2 py-1 rounded-md border border-[#5E6AD2]/20">
              <ActivityIndicator size="small" color="#5E6AD2" />
              <LinearText variant="bodySmall" className="ml-2 text-[#5E6AD2]">Saving</LinearText>
            </View>
          )}
        </View>

        <View className="flex-1 flex-row">
          <SettingsSidebar 
            activeCategory={activeCategory} 
            onSelectCategory={setActiveCategory} 
            isCollapsed={isSidebarCollapsed} 
            profileName={name} 
            totalXp={profile?.totalXp || 0} 
            onLogout={() => {}} 
          />

          <ScrollView
            contentContainerStyle={{ padding: 24 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
            className="flex-1 bg-[#141517]"
          >
            <View className="max-w-5xl w-full mx-auto">
              
              {activeCategory === 'general' && (
                <View className="flex-row items-center justify-between border border-[#292A2D] rounded-xl p-5 bg-[#1B1C1F] shadow-sm mb-6">
                  <View className="flex-row items-center gap-4">
                    <View className="w-14 h-14 rounded-full bg-[#5E6AD2] flex items-center justify-center">
                      <LinearText variant="display" style={{ color: 'white' }}>{name.charAt(0)}</LinearText>
                    </View>
                    <View>
                      <LinearText variant="title">{name}</LinearText>
                      <LinearText variant="bodySmall" tone="secondary">Target: NEET-PG</LinearText>
                    </View>
                  </View>
                  <View className="flex-row gap-6">
                    <View>
                      <LinearText variant="meta" tone="muted">TOTAL XP</LinearText>
                      <LinearText variant="title">{profile?.totalXp || 0}</LinearText>
                    </View>
                    <View className="w-px bg-[#292A2D]" />
                    <View>
                      <LinearText variant="meta" tone="muted">STREAK</LinearText>
                      <LinearText variant="title" style={{ color: '#F6AD55' }}>{profile?.currentStreak || 0} Days</LinearText>
                    </View>
                  </View>
                </View>
              )}

              {activeCategory === 'general' && <GeneralOverviewSection {...allProps} />}
              {activeCategory === 'ai' && <AiInferenceSection {...allProps} />}
              {activeCategory === 'interventions' && <InterventionsSection {...allProps} />}
              {activeCategory === 'integrations' && <AppIntegrationsSection {...allProps} />}
              {activeCategory === 'planning' && <PlanningAlertsSection {...allProps} />}
              {activeCategory === 'sync' && <DeviceSyncSection {...allProps} />}
              {activeCategory === 'storage' && <DataStorageSection {...allProps} />}

            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}"""

    # We need to replace from `return (` at line 1906 up to the last `}` before the other component definitions
    # Actually, we can just replace everything from `return (` until `function SectionToggle` but SectionToggle is defined inside `SettingsScreen`?
    # Wait, `SettingsScreen` goes all the way down to line 2244.

    match = re.search(
        r"  return \(\n    <SafeAreaView.*?  \);\n}", content, re.DOTALL | re.MULTILINE
    )
    if match:
        new_content = content[: match.start()] + new_return + content[match.end() :]
        with open("src/screens/SettingsScreen.tsx", "w") as f:
            f.write(new_content)
        print("Successfully replaced return block")
    else:
        print("Could not find return block")


update_file()
