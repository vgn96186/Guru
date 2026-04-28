import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { showError, showWarning } from '../../../components/dialogService';
import {
  testBraveSearchConnection,
  testCloudflareConnection,
  testDeepgramConnection,
  testFalConnection,
  testGeminiConnection,
  testGitHubModelsConnection,
  testGroqConnection,
  testHuggingFaceConnection,
  testKiloConnection,
  testOpenRouterConnection,
  testQwenConnection,
  testVertexConnection,
} from '../../../services/ai/providerHealth';
import { getQwenAccessToken } from '../../../services/ai/qwen';
import type { UserProfile } from '../../../types';
import type { ValidationProviderId } from '../types';
import { getErrorMessage } from '../utils';

type TestResult = 'ok' | 'fail' | null;
type SetBool = Dispatch<SetStateAction<boolean>>;
type SetTestResult = Dispatch<SetStateAction<TestResult>>;

type UseProviderApiKeyTestsParams = {
  profile: UserProfile | null | undefined;
  qwenConnected: boolean;
  keys: {
    groqKey: string;
    githubModelsPat: string;
    openrouterKey: string;
    kiloApiKey: string;
    deepseekKey: string;
    agentRouterKey: string;
    huggingFaceToken: string;
    huggingFaceModel: string;
    vertexAiProject: string;
    vertexAiLocation: string;
    vertexAiToken: string;
    deepgramApiKey: string;
    geminiKey: string;
    cloudflareAccountId: string;
    cloudflareApiToken: string;
    falApiKey: string;
    braveSearchApiKey: string;
    googleCustomSearchApiKey: string;
  };
  setters: {
    setTestingGroqKey: SetBool;
    setGroqKeyTestResult: SetTestResult;
    setTestingQwenKey: SetBool;
    setQwenKeyTestResult: SetTestResult;
    setTestingGithubPat: SetBool;
    setGithubPatTestResult: SetTestResult;
    setTestingOpenRouterKey: SetBool;
    setOpenRouterKeyTestResult: SetTestResult;
    setTestingKiloKey: SetBool;
    setKiloKeyTestResult: SetTestResult;
    setTestingDeepseekKey: SetBool;
    setDeepseekKeyTestResult: SetTestResult;
    setTestingAgentRouterKey: SetBool;
    setAgentRouterKeyTestResult: SetTestResult;
    setTestingHuggingFaceToken: SetBool;
    setHuggingFaceTokenTestResult: SetTestResult;
    setTestingVertexKey: SetBool;
    setVertexKeyTestResult: SetTestResult;
    setTestingDeepgramKey: SetBool;
    setDeepgramKeyTestResult: SetTestResult;
    setTestingGeminiKey: SetBool;
    setGeminiKeyTestResult: SetTestResult;
    setTestingCloudflare: SetBool;
    setCloudflareTestResult: SetTestResult;
    setTestingFalKey: SetBool;
    setFalKeyTestResult: SetTestResult;
    setTestingBraveSearchKey: SetBool;
    setBraveSearchKeyTestResult: SetTestResult;
    setTestingGoogleCustomSearchKey: SetBool;
    setGoogleCustomSearchKeyTestResult: SetTestResult;
  };
  markProviderValidated: (provider: ValidationProviderId, secret: string) => void;
  clearProviderValidated: (provider: ValidationProviderId) => void;
};

export function useProviderApiKeyTests({
  profile,
  qwenConnected,
  keys,
  setters,
  markProviderValidated,
  clearProviderValidated,
}: UseProviderApiKeyTestsParams) {
  const testGroqKey = useCallback(async () => {
    const key = keys.groqKey.trim() || profile?.groqApiKey || '';
    if (!key) {
      showWarning('No key', 'Enter a Groq API key first.');
      return;
    }
    setters.setTestingGroqKey(true);
    setters.setGroqKeyTestResult(null);
    const res = await testGroqConnection(key);
    setters.setGroqKeyTestResult(res.ok ? 'ok' : 'fail');
    if (res.ok) markProviderValidated('groq', key);
    else clearProviderValidated('groq');
    setters.setTestingGroqKey(false);
  }, [clearProviderValidated, keys.groqKey, markProviderValidated, profile?.groqApiKey, setters]);

  const testQwenKey = useCallback(async () => {
    if (!profile?.qwenConnected && !qwenConnected) {
      showWarning('Not connected', 'Connect Qwen OAuth first to validate the connection.');
      return;
    }
    setters.setTestingQwenKey(true);
    setters.setQwenKeyTestResult(null);
    try {
      const tokenResult = await getQwenAccessToken();
      if (!tokenResult?.accessToken) {
        setters.setQwenKeyTestResult('fail');
        showError('No OAuth token available. Try reconnecting Qwen.');
        setters.setTestingQwenKey(false);
        return;
      }
      const res = await testQwenConnection(
        tokenResult.accessToken,
        tokenResult.apiKey,
        tokenResult.resourceUrl,
      );
      setters.setQwenKeyTestResult(res.ok ? 'ok' : 'fail');
      if (res.ok) markProviderValidated('qwen', tokenResult.accessToken);
      else clearProviderValidated('qwen');
      if (!res.ok) showError(res.message || 'Qwen API returned an error.');
    } catch (err: unknown) {
      setters.setQwenKeyTestResult('fail');
      showError(getErrorMessage(err));
    }
    setters.setTestingQwenKey(false);
  }, [
    clearProviderValidated,
    markProviderValidated,
    profile?.qwenConnected,
    qwenConnected,
    setters,
  ]);

  const testGithubModelsPat = useCallback(async () => {
    const pat = keys.githubModelsPat.trim() || profile?.githubModelsPat || '';
    if (!pat) {
      showWarning('No token', 'Enter a GitHub personal access token with Models access first.');
      return;
    }
    setters.setTestingGithubPat(true);
    setters.setGithubPatTestResult(null);
    const res = await testGitHubModelsConnection(pat);
    setters.setGithubPatTestResult(res.ok ? 'ok' : 'fail');
    if (res.ok) markProviderValidated('github', pat);
    else clearProviderValidated('github');
    setters.setTestingGithubPat(false);
  }, [
    clearProviderValidated,
    keys.githubModelsPat,
    markProviderValidated,
    profile?.githubModelsPat,
    setters,
  ]);

  const testOpenRouterKey = useCallback(async () => {
    const key = keys.openrouterKey.trim() || profile?.openrouterKey || '';
    if (!key) {
      showWarning('No key', 'Enter an OpenRouter API key first.');
      return;
    }
    setters.setTestingOpenRouterKey(true);
    setters.setOpenRouterKeyTestResult(null);
    const res = await testOpenRouterConnection(key);
    setters.setOpenRouterKeyTestResult(res.ok ? 'ok' : 'fail');
    if (res.ok) markProviderValidated('openrouter', key);
    else clearProviderValidated('openrouter');
    setters.setTestingOpenRouterKey(false);
  }, [
    clearProviderValidated,
    keys.openrouterKey,
    markProviderValidated,
    profile?.openrouterKey,
    setters,
  ]);

  const testKiloKey = useCallback(async () => {
    const key = keys.kiloApiKey.trim() || profile?.kiloApiKey || '';
    setters.setTestingKiloKey(true);
    setters.setKiloKeyTestResult(null);
    const res = await testKiloConnection(key);
    setters.setKiloKeyTestResult(res.ok ? 'ok' : 'fail');
    if (res.ok) markProviderValidated('kilo', key);
    else clearProviderValidated('kilo');
    setters.setTestingKiloKey(false);
  }, [
    clearProviderValidated,
    keys.kiloApiKey,
    markProviderValidated,
    profile?.kiloApiKey,
    setters,
  ]);

  const testDeepseekKey = useCallback(async () => {
    const key = keys.deepseekKey.trim() || profile?.deepseekKey || '';
    if (!key) {
      showWarning('No key', 'Enter a DeepSeek API key first.');
      return;
    }
    setters.setTestingDeepseekKey(true);
    setters.setDeepseekKeyTestResult(null);
    try {
      const res = await fetch('https://api.deepseek.com/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
      setters.setDeepseekKeyTestResult(res.ok ? 'ok' : 'fail');
      if (res.ok) markProviderValidated('deepseek', key);
      else clearProviderValidated('deepseek');
    } catch {
      setters.setDeepseekKeyTestResult('fail');
      clearProviderValidated('deepseek');
    }
    setters.setTestingDeepseekKey(false);
  }, [
    clearProviderValidated,
    keys.deepseekKey,
    markProviderValidated,
    profile?.deepseekKey,
    setters,
  ]);

  const testAgentRouterKey = useCallback(async () => {
    const key = keys.agentRouterKey.trim() || profile?.agentRouterKey || '';
    if (!key) {
      showWarning('No key', 'Enter an AgentRouter key first.');
      return;
    }
    setters.setTestingAgentRouterKey(true);
    setters.setAgentRouterKeyTestResult(null);
    try {
      const res = await fetch('https://agentrouter.org/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          'User-Agent': 'Kilo-Code/5.11.0',
          'HTTP-Referer': 'https://kilocode.ai',
          'X-Title': 'Kilo Code',
          'X-KiloCode-Version': '5.11.0',
          'x-stainless-arch': 'x64',
          'x-stainless-lang': 'js',
          'x-stainless-os': 'Android',
          'x-stainless-package-version': '6.32.0',
          'x-stainless-retry-count': '0',
          'x-stainless-runtime': 'node',
          'x-stainless-runtime-version': 'v20.20.0',
        },
        body: JSON.stringify({
          model: 'deepseek-v3.2',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 5,
        }),
      });
      setters.setAgentRouterKeyTestResult(res.ok ? 'ok' : 'fail');
      if (res.ok) markProviderValidated('agentrouter', key);
      else clearProviderValidated('agentrouter');
    } catch {
      setters.setAgentRouterKeyTestResult('fail');
      clearProviderValidated('agentrouter');
    }
    setters.setTestingAgentRouterKey(false);
  }, [
    clearProviderValidated,
    keys.agentRouterKey,
    markProviderValidated,
    profile?.agentRouterKey,
    setters,
  ]);

  const testHuggingFaceKey = useCallback(async () => {
    const token = keys.huggingFaceToken.trim() || profile?.huggingFaceToken || '';
    if (!token) {
      showWarning('No token', 'Enter a Hugging Face token first.');
      return;
    }
    setters.setTestingHuggingFaceToken(true);
    setters.setHuggingFaceTokenTestResult(null);
    const res = await testHuggingFaceConnection(token, keys.huggingFaceModel.trim());
    setters.setHuggingFaceTokenTestResult(res.ok ? 'ok' : 'fail');
    setters.setTestingHuggingFaceToken(false);
  }, [keys.huggingFaceModel, keys.huggingFaceToken, profile?.huggingFaceToken, setters]);

  const testVertexKey = useCallback(async () => {
    const p = keys.vertexAiProject.trim() || profile?.vertexAiProject || '';
    const l = keys.vertexAiLocation.trim() || profile?.vertexAiLocation || '';
    const t = keys.vertexAiToken.trim() || profile?.vertexAiToken || '';
    if (!t) {
      showWarning('Missing info', 'Enter an API key or access token.');
      return;
    }
    setters.setTestingVertexKey(true);
    setters.setVertexKeyTestResult(null);
    const res = await testVertexConnection(p, l, t);
    setters.setVertexKeyTestResult(res.ok ? 'ok' : 'fail');
    if (res.ok) markProviderValidated('vertex', t);
    else clearProviderValidated('vertex');
    setters.setTestingVertexKey(false);
  }, [
    clearProviderValidated,
    keys.vertexAiLocation,
    keys.vertexAiProject,
    keys.vertexAiToken,
    markProviderValidated,
    profile?.vertexAiLocation,
    profile?.vertexAiProject,
    profile?.vertexAiToken,
    setters,
  ]);

  const testDeepgramKey = useCallback(async () => {
    const key = keys.deepgramApiKey.trim() || profile?.deepgramApiKey || '';
    if (!key) {
      showWarning('No key', 'Enter a Deepgram API key first.');
      return;
    }
    setters.setTestingDeepgramKey(true);
    setters.setDeepgramKeyTestResult(null);
    const res = await testDeepgramConnection(key);
    setters.setDeepgramKeyTestResult(res.ok ? 'ok' : 'fail');
    if (res.ok) markProviderValidated('deepgram', key);
    else clearProviderValidated('deepgram');
    setters.setTestingDeepgramKey(false);
  }, [
    clearProviderValidated,
    keys.deepgramApiKey,
    markProviderValidated,
    profile?.deepgramApiKey,
    setters,
  ]);

  const testGeminiKey = useCallback(async () => {
    const key = keys.geminiKey.trim() || profile?.geminiKey || '';
    if (!key) {
      showWarning('No key', 'Enter an AI Studio (Gemini) API key first.');
      return;
    }
    setters.setTestingGeminiKey(true);
    setters.setGeminiKeyTestResult(null);
    const res = await testGeminiConnection(key);
    setters.setGeminiKeyTestResult(res.ok ? 'ok' : 'fail');
    if (res.ok) markProviderValidated('gemini', key);
    else clearProviderValidated('gemini');
    setters.setTestingGeminiKey(false);
  }, [clearProviderValidated, keys.geminiKey, markProviderValidated, profile?.geminiKey, setters]);

  const testCloudflareKeys = useCallback(async () => {
    const aid = keys.cloudflareAccountId.trim() || profile?.cloudflareAccountId || '';
    const tok = keys.cloudflareApiToken.trim() || profile?.cloudflareApiToken || '';
    if (!aid || !tok) {
      showWarning(
        'Missing credentials',
        'Enter your Cloudflare Account ID and API token (Workers AI permissions).',
      );
      return;
    }
    setters.setTestingCloudflare(true);
    setters.setCloudflareTestResult(null);
    const res = await testCloudflareConnection(aid, tok);
    setters.setCloudflareTestResult(res.ok ? 'ok' : 'fail');
    if (res.ok) markProviderValidated('cloudflare', `${aid}:${tok}`);
    else clearProviderValidated('cloudflare');
    setters.setTestingCloudflare(false);
  }, [
    clearProviderValidated,
    keys.cloudflareAccountId,
    keys.cloudflareApiToken,
    markProviderValidated,
    profile?.cloudflareAccountId,
    profile?.cloudflareApiToken,
    setters,
  ]);

  const testFalKey = useCallback(async () => {
    const key = keys.falApiKey.trim() || profile?.falApiKey || '';
    if (!key) {
      showWarning('No key', 'Enter a fal API key first.');
      return;
    }
    setters.setTestingFalKey(true);
    setters.setFalKeyTestResult(null);
    const res = await testFalConnection(key);
    setters.setFalKeyTestResult(res.ok ? 'ok' : 'fail');
    if (res.ok) markProviderValidated('fal', key);
    else clearProviderValidated('fal');
    setters.setTestingFalKey(false);
  }, [clearProviderValidated, keys.falApiKey, markProviderValidated, profile?.falApiKey, setters]);

  const testBraveSearchKey = useCallback(async () => {
    const key = keys.braveSearchApiKey.trim() || profile?.braveSearchApiKey || '';
    if (!key) {
      showWarning('No key', 'Enter a Brave Search API key first.');
      return;
    }
    setters.setTestingBraveSearchKey(true);
    setters.setBraveSearchKeyTestResult(null);
    const res = await testBraveSearchConnection(key);
    setters.setBraveSearchKeyTestResult(res.ok ? 'ok' : 'fail');
    if (res.ok) markProviderValidated('brave', key);
    else clearProviderValidated('brave');
    setters.setTestingBraveSearchKey(false);
  }, [
    clearProviderValidated,
    keys.braveSearchApiKey,
    markProviderValidated,
    profile?.braveSearchApiKey,
    setters,
  ]);

  const testGoogleCustomSearchKey = useCallback(async () => {
    const key = keys.googleCustomSearchApiKey.trim() || profile?.googleCustomSearchApiKey || '';
    if (!key) {
      showWarning('No key', 'Enter a Google Custom Search API key first.');
      return;
    }
    setters.setTestingGoogleCustomSearchKey(true);
    setters.setGoogleCustomSearchKeyTestResult(null);
    try {
      const cx = '5085c21a1fd974c13';
      const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(
        key,
      )}&cx=${cx}&q=test&searchType=image&num=1`;
      const res = await fetch(url);
      setters.setGoogleCustomSearchKeyTestResult(res.ok ? 'ok' : 'fail');
      if (res.ok) markProviderValidated('google', key);
      else clearProviderValidated('google');
    } catch {
      setters.setGoogleCustomSearchKeyTestResult('fail');
      clearProviderValidated('google');
    }
    setters.setTestingGoogleCustomSearchKey(false);
  }, [
    clearProviderValidated,
    keys.googleCustomSearchApiKey,
    markProviderValidated,
    profile?.googleCustomSearchApiKey,
    setters,
  ]);

  return {
    testGroqKey,
    testQwenKey,
    testGithubModelsPat,
    testOpenRouterKey,
    testKiloKey,
    testDeepseekKey,
    testAgentRouterKey,
    testHuggingFaceKey,
    testVertexKey,
    testDeepgramKey,
    testGeminiKey,
    testCloudflareKeys,
    testFalKey,
    testBraveSearchKey,
    testGoogleCustomSearchKey,
  };
}
