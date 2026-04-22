with open('src/screens/SettingsScreen.tsx', 'r') as f:
    content = f.read()

# Fix the broken useState lines
content = content.replace('const [deepseekKey: deepseekKey || "", setDeepseekKey] = useState(\'\');', 'const [deepseekKey, setDeepseekKey] = useState(\'\');')
content = content.replace('const [agentRouterKey: agentRouterKey || "", setAgentRouterKey] = useState(\'\');', 'const [agentRouterKey, setAgentRouterKey] = useState(\'\');')
content = content.replace('const [deepgramApiKey: deepgramApiKey || "", setDeepgramApiKey] = useState(\'\');', 'const [deepgramApiKey, setDeepgramApiKey] = useState(\'\');')

with open('src/screens/SettingsScreen.tsx', 'w') as f:
    f.write(content)
print("Fixed useState declarations")
