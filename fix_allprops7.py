with open('src/screens/SettingsScreen.tsx', 'r') as f:
    content = f.read()

content = content.replace('groqApiKey: groqKey || "", setGroqApiKey: setGroqKey,', 'groqApiKey: groqKey || "",')
content = content.replace('openrouterKey: orKey || "", setOpenrouterKey: setOrKey,', 'openrouterKey: orKey || "",')
content = content.replace('geminiApiKey: geminiKey || "", setGeminiApiKey: setGeminiKey,', 'geminiApiKey: geminiKey || "",')
content = content.replace('githubModelsToken: githubModelsPat || "", setGithubModelsToken: setGithubModelsPat,', 'githubModelsToken: githubModelsPat || "",')

with open('src/screens/SettingsScreen.tsx', 'w') as f:
    f.write(content)
print("Fixed liveGuruChatModels keys")
