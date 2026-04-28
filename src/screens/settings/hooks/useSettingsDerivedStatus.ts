import { useMemo } from 'react';
import type { UserProfile } from '../../../types';
import type { PermissionStatus } from './useSettingsPermissions';
import type { ValidationProviderId } from '../types';

type TestResult = 'ok' | 'fail' | null;

type UseSettingsDerivedStatusParams = {
  profile: UserProfile | null | undefined;
  permStatus: PermissionStatus;
  resolveValidationStatus: (
    provider: ValidationProviderId,
    liveResult: TestResult,
    secret: string,
  ) => TestResult;
  keys: {
    groqKey: string;
    githubModelsPat: string;
    openrouterKey: string;
    kiloApiKey: string;
    deepseekKey: string;
    agentRouterKey: string;
    geminiKey: string;
    deepgramApiKey: string;
    cloudflareAccountId: string;
    cloudflareApiToken: string;
    vertexAiToken: string;
    falApiKey: string;
    jinaApiKey: string;
    braveSearchApiKey: string;
    googleCustomSearchApiKey: string;
  };
  testResults: {
    groqKeyTestResult: TestResult;
    githubPatTestResult: TestResult;
    openRouterKeyTestResult: TestResult;
    kiloKeyTestResult: TestResult;
    deepseekKeyTestResult: TestResult;
    agentRouterKeyTestResult: TestResult;
    geminiKeyTestResult: TestResult;
    deepgramKeyTestResult: TestResult;
    cloudflareTestResult: TestResult;
    vertexKeyTestResult: TestResult;
    falKeyTestResult: TestResult;
    jinaKeyTestResult: TestResult;
    braveSearchKeyTestResult: TestResult;
    googleCustomSearchKeyTestResult: TestResult;
  };
};

export function useSettingsDerivedStatus({
  profile,
  permStatus,
  resolveValidationStatus,
  keys,
  testResults,
}: UseSettingsDerivedStatusParams) {
  return useMemo(() => {
    const groqSecret = keys.groqKey.trim() || profile?.groqApiKey || '';
    const deepgramSecret = keys.deepgramApiKey.trim() || profile?.deepgramApiKey || '';
    const cloudflareSecret = `${
      keys.cloudflareAccountId.trim() || profile?.cloudflareAccountId || ''
    }:${keys.cloudflareApiToken.trim() || profile?.cloudflareApiToken || ''}`;

    return {
      groqValidationStatus: resolveValidationStatus(
        'groq',
        testResults.groqKeyTestResult,
        groqSecret,
      ),
      githubValidationStatus: resolveValidationStatus(
        'github',
        testResults.githubPatTestResult,
        keys.githubModelsPat.trim() || profile?.githubModelsPat || '',
      ),
      openRouterValidationStatus: resolveValidationStatus(
        'openrouter',
        testResults.openRouterKeyTestResult,
        keys.openrouterKey.trim() || profile?.openrouterKey || '',
      ),
      kiloValidationStatus: resolveValidationStatus(
        'kilo',
        testResults.kiloKeyTestResult,
        keys.kiloApiKey.trim() || profile?.kiloApiKey || '',
      ),
      deepseekValidationStatus: resolveValidationStatus(
        'deepseek',
        testResults.deepseekKeyTestResult,
        keys.deepseekKey.trim() || profile?.deepseekKey || '',
      ),
      agentRouterValidationStatus: resolveValidationStatus(
        'agentrouter',
        testResults.agentRouterKeyTestResult,
        keys.agentRouterKey.trim() || profile?.agentRouterKey || '',
      ),
      geminiValidationStatus: resolveValidationStatus(
        'gemini',
        testResults.geminiKeyTestResult,
        keys.geminiKey.trim() || profile?.geminiKey || '',
      ),
      deepgramValidationStatus: resolveValidationStatus(
        'deepgram',
        testResults.deepgramKeyTestResult,
        deepgramSecret,
      ),
      cloudflareValidationStatus: resolveValidationStatus(
        'cloudflare',
        testResults.cloudflareTestResult,
        cloudflareSecret,
      ),
      vertexValidationStatus: resolveValidationStatus(
        'vertex',
        testResults.vertexKeyTestResult,
        keys.vertexAiToken.trim() || profile?.vertexAiToken || '',
      ),
      falValidationStatus: resolveValidationStatus(
        'fal',
        testResults.falKeyTestResult,
        keys.falApiKey.trim() || profile?.falApiKey || '',
      ),
      jinaValidationStatus: resolveValidationStatus(
        'jina',
        testResults.jinaKeyTestResult,
        keys.jinaApiKey.trim() || profile?.jinaApiKey || '',
      ),
      braveValidationStatus: resolveValidationStatus(
        'brave',
        testResults.braveSearchKeyTestResult,
        keys.braveSearchApiKey.trim() || profile?.braveSearchApiKey || '',
      ),
      googleValidationStatus: resolveValidationStatus(
        'google',
        testResults.googleCustomSearchKeyTestResult,
        keys.googleCustomSearchApiKey.trim() || profile?.googleCustomSearchApiKey || '',
      ),
      hasPomodoroOverlayPermission: permStatus.overlay === 'granted',
      hasPomodoroGroqKey: Boolean(groqSecret),
      hasPomodoroDeepgramKey: Boolean(deepgramSecret),
    };
  }, [keys, permStatus.overlay, profile, resolveValidationStatus, testResults]);
}
