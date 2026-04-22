import React from 'react';
import { View, Text } from 'react-native';
import ApiKeyRow from '../components/ApiKeyRow';
import CloudflareKeyRow from '../components/CloudflareKeyRow';
import type { AiProvidersProps } from '../types';

export default function ApiKeysSection({
  apiKeys,
  clearProviderValidated,
  SubSectionToggle,
  styles,
}: {
  apiKeys: AiProvidersProps['apiKeys'];
  clearProviderValidated: AiProvidersProps['clearProviderValidated'];
  SubSectionToggle: any;
  styles: any;
}) {
  return (
    <SubSectionToggle id="ai_api_keys" title="API KEYS">
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
    </SubSectionToggle>
  );
}
