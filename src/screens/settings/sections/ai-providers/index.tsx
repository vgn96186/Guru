import React from 'react';
import type { AiProvidersProps } from './types';
import ChatModelSection from './subsections/ChatModelSection';
import MemorySection from './subsections/MemorySection';
import ChatGptOAuthSection from './subsections/ChatGptOAuthSection';
import GithubCopilotSection from './subsections/GithubCopilotSection';
import GitlabDuoSection from './subsections/GitlabDuoSection';
import PoeOAuthSection from './subsections/PoeOAuthSection';
import QwenOAuthSection from './subsections/QwenOAuthSection';
import ApiKeysSection from './subsections/ApiKeysSection';
import RoutingSection from './subsections/RoutingSection';
import ImageGenSection from './subsections/ImageGenSection';
import EmbeddingSection from './subsections/EmbeddingSection';
import TranscriptionSection from './subsections/TranscriptionSection';
import LocalAiSection from './subsections/LocalAiSection';
import WebSearchSection from './subsections/WebSearchSection';

import { DEFAULT_PROVIDER_ORDER } from '../../../../types';
import { sanitizeProviderOrder } from '../../../../utils/providerOrder';

export default function AiProvidersSection(props: AiProvidersProps) {
  const {
    styles,
    SectionToggle,
    SubSectionToggle: _SubSectionToggle,
    profile,
    guruChat,
    guruMemory,
    chatgpt,
    githubCopilot,
    gitlabDuo,
    poe,
    qwen,
    apiKeys,
    routing,
    imageGen,
    transcriptionOrder,
    setTranscriptionOrder,
    transcriptionProvider,
    setTranscriptionProvider,
    localAi,
    updateUserProfile,
    refreshProfile,
    clearProviderValidated,
  } = props;

  return (
    <>
      {/* 1. API KEYS */}
      <ApiKeysSection
        apiKeys={apiKeys}
        clearProviderValidated={clearProviderValidated}
        SectionToggle={SectionToggle}
        styles={styles}
      />

      {/* 2. OAUTH */}
      <SectionToggle id="ai_oauth" title="OAuth" icon="link" tint="#14B8A6">
        <ChatGptOAuthSection chatgpt={chatgpt} styles={styles} />
        <GithubCopilotSection githubCopilot={githubCopilot} styles={styles} />
        <GitlabDuoSection gitlabDuo={gitlabDuo} styles={styles} />
        <PoeOAuthSection poe={poe} styles={styles} />
        <QwenOAuthSection qwen={qwen} styles={styles} />
      </SectionToggle>

      {/* 3. DEFAULTS */}
      <SectionToggle id="ai_defaults" title="Default Models" icon="options-outline" tint="#EC4899">
        <ChatModelSection
          guruChat={guruChat}
          useLocalModel={profile?.useLocalModel ?? false}
          localModelPath={profile?.localModelPath ?? null}
          SectionToggle={SectionToggle}
          styles={styles}
        />

        <EmbeddingSection
          profile={profile}
          updateUserProfile={updateUserProfile}
          refreshProfile={refreshProfile}
        />

        <ImageGenSection
          imageGen={imageGen}
          falValidationStatus={apiKeys.fal.validationStatus}
          falApiKey={apiKeys.fal.value}
          setFalApiKey={apiKeys.fal.setValue}
          setFalKeyTestResult={apiKeys.fal.setTestResult}
          testFalKey={apiKeys.fal.test}
          testingFalKey={apiKeys.fal.testing}
          clearProviderValidated={clearProviderValidated}
          SectionToggle={SectionToggle}
          styles={styles}
        />
        <TranscriptionSection
          transcriptionProvider={transcriptionProvider}
          setTranscriptionProvider={setTranscriptionProvider}
        />
      </SectionToggle>

      {/* 4. ROUTING */}
      <SectionToggle id="ai_routing" title="Provider Routing" icon="git-network" tint="#6C63FF">
        <RoutingSection
          routing={routing}
          DEFAULT_PROVIDER_ORDER={DEFAULT_PROVIDER_ORDER}
          sanitizeProviderOrder={sanitizeProviderOrder}
          imageGen={imageGen}
          transcriptionOrder={transcriptionOrder}
          setTranscriptionOrder={setTranscriptionOrder}
          updateUserProfile={updateUserProfile}
          refreshProfile={refreshProfile}
          styles={styles}
        />
      </SectionToggle>

      {/* 3. ON-DEVICE AI */}
      <LocalAiSection
        localAi={localAi}
        profile={profile}
        updateUserProfile={updateUserProfile}
        refreshProfile={refreshProfile}
        SectionToggle={SectionToggle}
        styles={styles}
      />

      {/* 5. WEB SEARCH */}
      <WebSearchSection
        styles={styles}
        SectionToggle={SectionToggle}
        profile={profile}
        updateUserProfile={updateUserProfile}
        refreshProfile={refreshProfile}
      />

      {/* 6. MEMORY */}
      <MemorySection guruMemory={guruMemory} SectionToggle={SectionToggle} styles={styles} />
    </>
  );
}
