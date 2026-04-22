import re

with open('src/services/ai/llmRouting.ts', 'r') as f:
    content = f.read()

# Add isProviderConfigured case
content = re.sub(
    r"    case 'qwen':\n      return !!keys\.qwenConnected;",
    r"    case 'qwen':\n      return !!keys.qwenConnected;\n    case 'vertex':\n      return !!(keys.vertexAiProject && keys.vertexAiLocation && keys.vertexAiToken);",
    content
)

# Add attemptCloudLLMStream case
content = re.sub(
    r"    case 'qwen': \{\n      if \(!keys\.qwenConnected\) return null;\n      const qwenStream = \(\n        m: Message\[\],\n        onD: \(d: string\) => void,\n      \) => streamOpenAiCompatibleChat\(m, qwenUrl, '', m\[0\]\?\.modelUsed \|\| preferredQwenModel, onD\);\n      return qwenStream;\n    \}",
    r"    case 'qwen': {\n      if (!keys.qwenConnected) return null;\n      const qwenStream = (\n        m: Message[],\n        onD: (d: string) => void,\n      ) => streamOpenAiCompatibleChat(m, qwenUrl, '', m[0]?.modelUsed || preferredQwenModel, onD);\n      return qwenStream;\n    }\n    case 'vertex': {\n      if (!keys.vertexAiProject || !keys.vertexAiLocation || !keys.vertexAiToken) return null;\n      const vStream = (\n        m: Message[],\n        onD: (d: string) => void,\n      ) => streamGeminiChat(m, keys.vertexAiToken!, m[0]?.modelUsed || preferredVertexModel, onD, true, keys.vertexAiProject!, keys.vertexAiLocation!);\n      return vStream;\n    }",
    content
)

with open('src/services/ai/llmRouting.ts', 'w') as f:
    f.write(content)
