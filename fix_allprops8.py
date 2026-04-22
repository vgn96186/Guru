with open('src/screens/SettingsScreen.tsx', 'r') as f:
    content = f.read()

content = content.replace('groqApiKey: groqKey || "", setGroqApiKey: setGroqKey,', 'groqApiKey: groqKey,')

with open('src/screens/SettingsScreen.tsx', 'w') as f:
    f.write(content)
