import { useState, useCallback } from 'react';
import { fingerprintSecret, sanitizeApiValidationState } from '../utils';
import type { ValidationProviderId, ApiValidationState } from '../types';

export function useApiKeyTesting() {
  const [testingGroqKey, setTestingGroqKey] = useState(false);
  const [groqKeyTestResult, setGroqKeyTestResult] = useState<'ok' | 'fail' | null>(null);
  const [_testingQwenKey, _setTestingQwenKey] = useState(false);
  const [_qwenKeyTestResult, _setQwenKeyTestResult] = useState<'ok' | 'fail' | null>(null);
  const [testingGithubPat, setTestingGithubPat] = useState(false);
  const [githubPatTestResult, setGithubPatTestResult] = useState<'ok' | 'fail' | null>(null);
  const [testingOpenRouterKey, setTestingOpenRouterKey] = useState(false);
  const [openRouterKeyTestResult, setOpenRouterKeyTestResult] = useState<'ok' | 'fail' | null>(
    null,
  );
  const [_testingHuggingFaceToken, _setTestingHuggingFaceToken] = useState(false);
  const [_huggingFaceTokenTestResult, _setHuggingFaceTokenTestResult] = useState<
    'ok' | 'fail' | null
  >(null);
  const [testingGeminiKey, setTestingGeminiKey] = useState(false);
  const [geminiKeyTestResult, setGeminiKeyTestResult] = useState<'ok' | 'fail' | null>(null);
  const [testingCloudflare, setTestingCloudflare] = useState(false);
  const [cloudflareTestResult, setCloudflareTestResult] = useState<'ok' | 'fail' | null>(null);
  const [testingVertexKey, setTestingVertexKey] = useState(false);
  const [vertexKeyTestResult, setVertexKeyTestResult] = useState<'ok' | 'fail' | null>(null);
  const [testingFalKey, setTestingFalKey] = useState(false);
  const [falKeyTestResult, setFalKeyTestResult] = useState<'ok' | 'fail' | null>(null);
  const [testingJinaKey, setTestingJinaKey] = useState(false);
  const [jinaKeyTestResult, setJinaKeyTestResult] = useState<'ok' | 'fail' | null>(null);
  const [testingBraveSearchKey, setTestingBraveSearchKey] = useState(false);
  const [braveSearchKeyTestResult, setBraveSearchKeyTestResult] = useState<'ok' | 'fail' | null>(
    null,
  );
  const [_testingGoogleCustomSearchKey, _setTestingGoogleCustomSearchKey] = useState(false);
  const [googleCustomSearchKeyTestResult, setGoogleCustomSearchKeyTestResult] = useState<
    'ok' | 'fail' | null
  >(null);
  const [testingKiloKey, setTestingKiloKey] = useState(false);
  const [kiloKeyTestResult, setKiloKeyTestResult] = useState<'ok' | 'fail' | null>(null);
  const [testingDeepseekKey, setTestingDeepseekKey] = useState(false);
  const [deepseekKeyTestResult, setDeepseekKeyTestResult] = useState<'ok' | 'fail' | null>(null);
  const [testingAgentRouterKey, setTestingAgentRouterKey] = useState(false);
  const [agentRouterKeyTestResult, setAgentRouterKeyTestResult] = useState<'ok' | 'fail' | null>(
    null,
  );
  const [testingDeepgramKey, setTestingDeepgramKey] = useState(false);
  const [deepgramKeyTestResult, setDeepgramKeyTestResult] = useState<'ok' | 'fail' | null>(null);
  const [apiValidation, setApiValidation] = useState<ApiValidationState>({});

  const [testingGitHubCopilotOAuth, setTestingGitHubCopilotOAuth] = useState(false);
  const [githubCopilotOAuthTestResult, setGithubCopilotOAuthTestResult] = useState<
    'ok' | 'fail' | null
  >(null);
  const [testingGitLabDuoOAuth, setTestingGitLabDuoOAuth] = useState(false);
  const [gitlabDuoOAuthTestResult, setGitlabDuoOAuthTestResult] = useState<'ok' | 'fail' | null>(
    null,
  );

  const markProviderValidated = useCallback((provider: ValidationProviderId, secret: string) => {
    const normalized = secret.trim();
    if (!normalized) return;
    setApiValidation((prev) => ({
      ...sanitizeApiValidationState(prev),
      [provider]: {
        verified: true,
        verifiedAt: Date.now(),
        fingerprint: fingerprintSecret(normalized),
      },
    }));
  }, []);

  const clearProviderValidated = useCallback((provider: ValidationProviderId) => {
    setApiValidation((prev) => {
      const safePrev = sanitizeApiValidationState(prev);
      if (!safePrev[provider]) return safePrev;
      const next = { ...safePrev };
      delete next[provider];
      return next;
    });
  }, []);

  const resolveValidationStatus = useCallback(
    (
      provider: ValidationProviderId,
      liveResult: 'ok' | 'fail' | null,
      secret: string,
    ): 'ok' | 'fail' | null => {
      if (liveResult) return liveResult;
      const normalized = secret.trim();
      if (!normalized) return null;
      const persisted = sanitizeApiValidationState(apiValidation)[provider];
      if (!persisted?.verified || !persisted.fingerprint) return null;
      return persisted.fingerprint === fingerprintSecret(normalized) ? 'ok' : null;
    },
    [apiValidation],
  );

  return {
    apiValidation,
    setApiValidation,
    markProviderValidated,
    clearProviderValidated,
    resolveValidationStatus,
    testingGroqKey,
    setTestingGroqKey,
    groqKeyTestResult,
    setGroqKeyTestResult,
    _testingQwenKey,
    _setTestingQwenKey,
    _qwenKeyTestResult,
    _setQwenKeyTestResult,
    testingGithubPat,
    setTestingGithubPat,
    githubPatTestResult,
    setGithubPatTestResult,
    testingOpenRouterKey,
    setTestingOpenRouterKey,
    openRouterKeyTestResult,
    setOpenRouterKeyTestResult,
    _testingHuggingFaceToken,
    _setTestingHuggingFaceToken,
    _huggingFaceTokenTestResult,
    _setHuggingFaceTokenTestResult,
    testingGeminiKey,
    setTestingGeminiKey,
    geminiKeyTestResult,
    setGeminiKeyTestResult,
    testingCloudflare,
    setTestingCloudflare,
    cloudflareTestResult,
    setCloudflareTestResult,
    testingVertexKey,
    setTestingVertexKey,
    vertexKeyTestResult,
    setVertexKeyTestResult,
    testingFalKey,
    setTestingFalKey,
    falKeyTestResult,
    setFalKeyTestResult,
    testingJinaKey,
    setTestingJinaKey,
    jinaKeyTestResult,
    setJinaKeyTestResult,
    testingBraveSearchKey,
    setTestingBraveSearchKey,
    braveSearchKeyTestResult,
    setBraveSearchKeyTestResult,
    _testingGoogleCustomSearchKey,
    _setTestingGoogleCustomSearchKey,
    googleCustomSearchKeyTestResult,
    setGoogleCustomSearchKeyTestResult,
    testingKiloKey,
    setTestingKiloKey,
    kiloKeyTestResult,
    setKiloKeyTestResult,
    testingDeepseekKey,
    setTestingDeepseekKey,
    deepseekKeyTestResult,
    setDeepseekKeyTestResult,
    testingAgentRouterKey,
    setTestingAgentRouterKey,
    agentRouterKeyTestResult,
    setAgentRouterKeyTestResult,
    testingDeepgramKey,
    setTestingDeepgramKey,
    deepgramKeyTestResult,
    setDeepgramKeyTestResult,
    testingGitHubCopilotOAuth,
    setTestingGitHubCopilotOAuth,
    githubCopilotOAuthTestResult,
    setGithubCopilotOAuthTestResult,
    testingGitLabDuoOAuth,
    setTestingGitLabDuoOAuth,
    gitlabDuoOAuthTestResult,
    setGitlabDuoOAuthTestResult,
  };
}
