import React from 'react';
import type { AiProvidersProps } from './types';
import SummaryHeader, { useSummaryMetrics } from './components/SummaryHeader';
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
import TranscriptionSection from './subsections/TranscriptionSection';
import LocalAiSection from './subsections/LocalAiSection';

import { DEFAULT_PROVIDER_ORDER } from '../../../../types';
import { sanitizeProviderOrder } from '../../../../utils/providerOrder';

export default function AiProvidersSection(props: AiProvidersProps) {
  const {
    styles,
    SectionToggle,
    SubSectionToggle,
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
    localAi,
    updateUserProfile,
    refreshProfile,
    clearProviderValidated,
  } = props;

  return (
    <>
      <SummaryHeader metrics={useSummaryMetrics(props)} styles={styles} />
      <ChatModelSection
        guruChat={guruChat}
        useLocalModel={profile?.useLocalModel ?? false}
        localModelPath={profile?.localModelPath ?? null}
        SectionToggle={SectionToggle}
        styles={styles}
      />

      <MemorySection guruMemory={guruMemory} SectionToggle={SectionToggle} styles={styles} />

      <SectionToggle id="ai_oauth" title="Connected AI Accounts" icon="link" tint="#14B8A6">
        <ChatGptOAuthSection chatgpt={chatgpt} SectionToggle={SubSectionToggle} styles={styles} />
        <GithubCopilotSection
          githubCopilot={githubCopilot}
          SectionToggle={SubSectionToggle}
          styles={styles}
        />
        <GitlabDuoSection gitlabDuo={gitlabDuo} SectionToggle={SubSectionToggle} styles={styles} />
        <PoeOAuthSection poe={poe} SectionToggle={SubSectionToggle} styles={styles} />
        <QwenOAuthSection qwen={qwen} SectionToggle={SubSectionToggle} styles={styles} />
      </SectionToggle>

      <ApiKeysSection
        apiKeys={apiKeys}
        clearProviderValidated={clearProviderValidated}
        SectionToggle={SectionToggle}
        styles={styles}
      />

      <RoutingSection
        routing={routing}
        DEFAULT_PROVIDER_ORDER={DEFAULT_PROVIDER_ORDER}
        sanitizeProviderOrder={sanitizeProviderOrder}
        updateUserProfile={updateUserProfile}
        refreshProfile={refreshProfile}
        SectionToggle={SectionToggle}
        styles={styles}
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

      <TranscriptionSection SectionToggle={SectionToggle} styles={styles} />

      <LocalAiSection
        localAi={localAi}
        profile={profile}
        updateUserProfile={updateUserProfile}
        SectionToggle={SectionToggle}
        styles={styles}
      />
    </>
  );
}
