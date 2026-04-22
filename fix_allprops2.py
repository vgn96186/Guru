with open('src/screens/SettingsScreen.tsx', 'r') as f:
    content = f.read()

content = content.replace('gitlabDuoPendingSession,', '')
content = content.replace('openrouterKey,', 'openrouterKey: testOpenRouterKey,')
content = content.replace('groqApiKey,', 'groqApiKey: groqKey,')
content = content.replace('geminiApiKey,', 'geminiApiKey: geminiKey,')
content = content.replace('githubModelsToken,', 'githubModelsToken: githubModelsPat,')
content = content.replace('profile?.currentStreak', '0')

with open('src/screens/SettingsScreen.tsx', 'w') as f:
    f.write(content)
