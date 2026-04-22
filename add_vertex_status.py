import re

with open('src/screens/SettingsScreen.tsx', 'r') as f:
    content = f.read()

cloudflare_status = """  const cloudflareValidationStatus = resolveValidationStatus(
    'cloudflare',
    cloudflareTestResult,
    `${cfAccountId.trim() || profile?.cloudflareAccountId || ''}:${
      cfApiToken.trim() || profile?.cloudflareApiToken || ''
    }`,
  );"""

vertex_status = """  const cloudflareValidationStatus = resolveValidationStatus(
    'cloudflare',
    cloudflareTestResult,
    `${cfAccountId.trim() || profile?.cloudflareAccountId || ''}:${
      cfApiToken.trim() || profile?.cloudflareApiToken || ''
    }`,
  );
  const vertexValidationStatus = resolveValidationStatus(
    'vertex',
    vertexKeyTestResult,
    vertexAiToken.trim() || profile?.vertexAiToken || '',
  );"""

content = content.replace(cloudflare_status, vertex_status)

with open('src/screens/SettingsScreen.tsx', 'w') as f:
    f.write(content)
