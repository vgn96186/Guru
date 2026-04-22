import re

with open('src/screens/SettingsScreen.tsx', 'r') as f:
    content = f.read()

content = re.sub(
    r"    agentRouterKey,\n    providerOrder,",
    r"    agentRouterKey,\n    vertexAiProject,\n    vertexAiLocation,\n    vertexAiToken,\n    providerOrder,",
    content
)

with open('src/screens/SettingsScreen.tsx', 'w') as f:
    f.write(content)
