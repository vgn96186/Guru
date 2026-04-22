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
      <SectionToggle
        id="ai_config"
        title="AI Configuration"
        icon="hardware-chip-outline"
        tint="#6C63FF"
      >
        <ChatModelSection
          guruChat={guruChat}
          useLocalModel={profile?.useLocalModel ?? false}
          localModelPath={profile?.localModelPath ?? null}
          SubSectionToggle={SubSectionToggle}
          styles={styles}
        />

        <MemorySection
          guruMemory={guruMemory}
          SubSectionToggle={SubSectionToggle}
          styles={styles}
        />

        <ChatGptOAuthSection
          chatgpt={chatgpt}
          SubSectionToggle={SubSectionToggle}
          styles={styles}
        />

        <GithubCopilotSection
          githubCopilot={githubCopilot}
          SubSectionToggle={SubSectionToggle}
          styles={styles}
        />

        <GitlabDuoSection
          gitlabDuo={gitlabDuo}
          SubSectionToggle={SubSectionToggle}
          styles={styles}
        />

        <PoeOAuthSection poe={poe} SubSectionToggle={SubSectionToggle} styles={styles} />

        <QwenOAuthSection qwen={qwen} SubSectionToggle={SubSectionToggle} styles={styles} />

        <ApiKeysSection
          apiKeys={apiKeys}
          clearProviderValidated={clearProviderValidated}
          SubSectionToggle={SubSectionToggle}
          styles={styles}
        />

        <RoutingSection
          routing={routing}
          DEFAULT_PROVIDER_ORDER={DEFAULT_PROVIDER_ORDER}
          sanitizeProviderOrder={sanitizeProviderOrder}
          updateUserProfile={updateUserProfile}
          refreshProfile={refreshProfile}
          SubSectionToggle={SubSectionToggle}
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
          SubSectionToggle={SubSectionToggle}
          styles={styles}
        />

        <TranscriptionSection SubSectionToggle={SubSectionToggle} styles={styles} />

        <LocalAiSection
          localAi={localAi}
          profile={profile}
          updateUserProfile={updateUserProfile}
          SubSectionToggle={SubSectionToggle}
          styles={styles}
        />
      </SectionToggle>
    </>
  );
}
