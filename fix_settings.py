import re

with open('src/screens/SettingsScreen.tsx', 'r') as f:
    content = f.read()

# Add state variables
content = re.sub(
    r"const \[agentRouterKey, setAgentRouterKey\] = useState\(''\);\n  const \[deepgramKey, setDeepgramKey\] = useState\(''\);\n  const \[jinaApiKey, setJinaApiKey\] = useState\(''\);\n",
    r"const [agentRouterKey, setAgentRouterKey] = useState('');\n  const [deepgramKey, setDeepgramKey] = useState('');\n  const [jinaApiKey, setJinaApiKey] = useState('');\n  const [vertexAiProject, setVertexAiProject] = useState('');\n  const [vertexAiLocation, setVertexAiLocation] = useState('');\n  const [vertexAiToken, setVertexAiToken] = useState('');\n",
    content
)

# Load profile
content = re.sub(
    r"setAgentRouterKey\(profile.agentRouterKey \?\? ''\);\n      setDeepgramKey\(profile.deepgramApiKey \?\? ''\);\n      setJinaApiKey\(profile.jinaApiKey \?\? ''\);\n",
    r"setAgentRouterKey(profile.agentRouterKey ?? '');\n      setDeepgramKey(profile.deepgramApiKey ?? '');\n      setJinaApiKey(profile.jinaApiKey ?? '');\n      setVertexAiProject(profile.vertexAiProject ?? '');\n      setVertexAiLocation(profile.vertexAiLocation ?? '');\n      setVertexAiToken(profile.vertexAiToken ?? '');\n",
    content
)

# Save profile
content = re.sub(
    r"agentRouterKey: agentRouterKey\.trim\(\),\n        deepgramApiKey: deepgramKey\.trim\(\),\n        jinaApiKey: jinaApiKey\.trim\(\),\n",
    r"agentRouterKey: agentRouterKey.trim(),\n        deepgramApiKey: deepgramKey.trim(),\n        jinaApiKey: jinaApiKey.trim(),\n        vertexAiProject: vertexAiProject.trim(),\n        vertexAiLocation: vertexAiLocation.trim(),\n        vertexAiToken: vertexAiToken.trim(),\n",
    content
)

# Test result state
content = re.sub(
    r"const \[deepgramKeyTestResult, setDeepgramKeyTestResult\] = useState<'ok' \| 'fail' \| null>\(null\);\n",
    r"const [deepgramKeyTestResult, setDeepgramKeyTestResult] = useState<'ok' | 'fail' | null>(null);\n  const [vertexKeyTestResult, setVertexKeyTestResult] = useState<'ok' | 'fail' | null>(null);\n",
    content
)

# Validation payload
content = re.sub(
    r"const jna = jinaApiKey\.trim\(\) \|\| profile\?\.jinaApiKey \|\| '';\n",
    r"const jna = jinaApiKey.trim() || profile?.jinaApiKey || '';\n    const vProject = vertexAiProject.trim() || profile?.vertexAiProject || '';\n    const vLocation = vertexAiLocation.trim() || profile?.vertexAiLocation || '';\n    const vToken = vertexAiToken.trim() || profile?.vertexAiToken || '';\n",
    content
)

# AiProviders component props
content = re.sub(
    r"deepgram: \{\n              value: deepgramKey,\n              setValue: setDeepgramKey,\n              setTestResult: setDeepgramKeyTestResult,\n              validationStatus: getValidationStatus\('deepgram', deepgramKey, deepgramKeyTestResult\),\n              test: \(\) => testConnection\('deepgram', deepgramKey, setDeepgramKeyTestResult\),\n              testing: testingConnection === 'deepgram',\n            \},\n",
    r"""deepgram: {
              value: deepgramKey,
              setValue: setDeepgramKey,
              setTestResult: setDeepgramKeyTestResult,
              validationStatus: getValidationStatus('deepgram', deepgramKey, deepgramKeyTestResult),
              test: () => testConnection('deepgram', deepgramKey, setDeepgramKeyTestResult),
              testing: testingConnection === 'deepgram',
            },
            vertex: {
              project: vertexAiProject,
              setProject: setVertexAiProject,
              location: vertexAiLocation,
              setLocation: setVertexAiLocation,
              token: vertexAiToken,
              setToken: setVertexAiToken,
              setTestResult: setVertexKeyTestResult,
              validationStatus: getValidationStatus('vertex', vertexAiToken, vertexKeyTestResult),
              test: () => testConnection('vertex', vertexAiToken, setVertexKeyTestResult),
              testing: testingConnection === 'vertex',
            },\n""",
    content
)

# testConnection implementation
content = re.sub(
    r"payload\.qwen = qwen;\n",
    r"payload.qwen = qwen;\n    payload.vertexAiProject = vProject;\n    payload.vertexAiLocation = vLocation;\n    payload.vertexAiToken = vToken;\n",
    content
)

with open('src/screens/SettingsScreen.tsx', 'w') as f:
    f.write(content)

