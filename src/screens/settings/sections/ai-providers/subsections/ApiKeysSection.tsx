import React from 'react';
import ApiKeyRow from '../components/ApiKeyRow';
import CloudflareKeyRow from '../components/CloudflareKeyRow';
import VertexKeyRow from '../components/VertexKeyRow';
import type { AiProvidersProps } from '../types';

export default function ApiKeysSection({
  apiKeys,
  clearProviderValidated,
  SectionToggle,
  styles,
}: {
  apiKeys: AiProvidersProps['apiKeys'];
  clearProviderValidated: AiProvidersProps['clearProviderValidated'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  SectionToggle: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  styles: any;
}) {
  return (
    <SectionToggle id="ai_keys" title="API Keys" icon="key" tint="#F59E0B">
      <ApiKeyRow
        {...apiKeys.groq}
        label="Groq"
        placeholder="gsk_..."
        hint="Transcription + AI generation. Free key at console.groq.com"
        styles={styles}
        clearProviderValidated={clearProviderValidated}
        providerId="groq"
      />
      <ApiKeyRow
        {...apiKeys.githubModelsPat}
        label="GitHub Models"
        placeholder="GitHub PAT (Models read)"
        styles={styles}
        clearProviderValidated={clearProviderValidated}
        providerId="github"
      />
      <ApiKeyRow
        {...apiKeys.openrouter}
        label="OpenRouter"
        placeholder="sk-or-v1-..."
        styles={styles}
        clearProviderValidated={clearProviderValidated}
        providerId="openrouter"
      />
      <ApiKeyRow
        {...apiKeys.kilo}
        label="Kilo"
        placeholder="kilo_..."
        styles={styles}
        clearProviderValidated={clearProviderValidated}
        providerId="kilo"
      />
      <ApiKeyRow
        {...apiKeys.deepseek}
        label="DeepSeek"
        placeholder="sk-..."
        styles={styles}
        clearProviderValidated={clearProviderValidated}
        providerId="deepseek"
      />
      <ApiKeyRow
        {...apiKeys.agentRouter}
        label="AgentRouter"
        placeholder="sk-..."
        styles={styles}
        clearProviderValidated={clearProviderValidated}
        providerId="agentrouter"
      />
      <ApiKeyRow
        {...apiKeys.gemini}
        label="Gemini"
        placeholder="AIzaSy..."
        styles={styles}
        clearProviderValidated={clearProviderValidated}
        providerId="gemini"
      />
      <ApiKeyRow
        {...apiKeys.deepgram}
        label="Deepgram"
        placeholder="dg_..."
        styles={styles}
        clearProviderValidated={clearProviderValidated}
        providerId="deepgram"
      />
      <CloudflareKeyRow
        {...apiKeys.cloudflare}
        styles={styles}
        clearProviderValidated={clearProviderValidated}
        providerId="cf"
      />
      <VertexKeyRow
        {...apiKeys.vertex}
        styles={styles}
        clearProviderValidated={clearProviderValidated}
        providerId="vertex"
      />
    </SectionToggle>
  );
}
