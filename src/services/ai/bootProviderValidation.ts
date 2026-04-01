import type { ProviderId } from '../../types';
import { profileRepository } from '../../db/repositories';
import { getApiKeys } from './config';
import {
  testAgentRouterConnection,
  testCloudflareConnection,
  testDeepSeekConnection,
  testGitHubCopilotConnection,
  testGitHubModelsConnection,
  testGitLabDuoConnection,
  testGroqConnection,
  testOpenRouterConnection,
  testGeminiConnection,
  testKiloConnection,
  testPoeConnection,
} from './providerHealth';
import {
  clearTokens as clearGitHubCopilotTokens,
  getValidAccessToken as getGitHubCopilotToken,
  isConnected as isGitHubCopilotTokenStoreConnected,
} from './github/githubTokenStore';
import { invalidateCopilotSessionToken } from './github/githubCopilotClient';
import {
  clearTokens as clearGitLabDuoTokens,
  getValidAccessToken as getGitLabDuoToken,
  isConnected as isGitLabDuoTokenStoreConnected,
} from './gitlab/gitlabTokenStore';
import { getValidAccessToken as getPoeToken } from './poe/poeTokenStore';
import { callChatGpt } from './chatgpt/chatgptApi';

type BootCheck = {
  id: ProviderId;
  ok: boolean;
  status: number;
  message?: string;
  ms: number;
  skipped?: boolean;
};

function brief(msg: string | undefined, max = 140): string {
  const t = (msg ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const t0 = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - t0 };
}

/** Wrap a check promise so it never rejects — errors become BootCheck with the correct provider ID. */
function safeCheck(id: ProviderId, p: Promise<BootCheck>): Promise<BootCheck> {
  return p.catch(
    (err): BootCheck => ({
      id,
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : String(err),
      ms: 0,
    }),
  );
}

export async function validateAiProvidersOnBoot(): Promise<void> {
  const profile = await profileRepository.getProfile();
  const keys = getApiKeys(profile);

  const checks: Array<Promise<BootCheck>> = [];

  if (keys.groqKey) {
    checks.push(
      safeCheck(
        'groq',
        timed(() => testGroqConnection(keys.groqKey!)).then(({ result, ms }) => ({
          id: 'groq',
          ...result,
          ms,
        })),
      ),
    );
  }

  if (keys.orKey) {
    checks.push(
      safeCheck(
        'openrouter',
        timed(() => testOpenRouterConnection(keys.orKey!)).then(({ result, ms }) => ({
          id: 'openrouter',
          ...result,
          ms,
        })),
      ),
    );
  }

  if (keys.geminiKey) {
    checks.push(
      safeCheck(
        'gemini',
        timed(() => testGeminiConnection(keys.geminiKey!)).then(({ result, ms }) => ({
          id: 'gemini',
          ...result,
          ms,
        })),
      ),
    );
  }

  if (keys.geminiFallbackKey) {
    checks.push(
      safeCheck(
        'gemini_fallback',
        timed(() => testGeminiConnection(keys.geminiFallbackKey!)).then(({ result, ms }) => ({
          id: 'gemini_fallback',
          ...result,
          ms,
        })),
      ),
    );
  }

  if (keys.cfAccountId && keys.cfApiToken) {
    checks.push(
      safeCheck(
        'cloudflare',
        timed(() => testCloudflareConnection(keys.cfAccountId!, keys.cfApiToken!)).then(
          ({ result, ms }) => ({
            id: 'cloudflare',
            ...result,
            ms,
          }),
        ),
      ),
    );
  }

  if (keys.githubModelsPat) {
    checks.push(
      safeCheck(
        'github',
        timed(() => testGitHubModelsConnection(keys.githubModelsPat!)).then(({ result, ms }) => ({
          id: 'github',
          ...result,
          ms,
        })),
      ),
    );
  }

  // kilo works without auth; still run probe (fast, and tells us if endpoint is reachable)
  checks.push(
    safeCheck(
      'kilo',
      timed(() => testKiloConnection(keys.kiloApiKey ?? '')).then(({ result, ms }) => ({
        id: 'kilo',
        ...result,
        ms,
      })),
    ),
  );

  if (keys.deepseekKey) {
    checks.push(
      safeCheck(
        'deepseek',
        timed(() => testDeepSeekConnection(keys.deepseekKey!)).then(({ result, ms }) => ({
          id: 'deepseek',
          ...result,
          ms,
        })),
      ),
    );
  }

  if (keys.agentRouterKey) {
    checks.push(
      safeCheck(
        'agentrouter',
        timed(() => testAgentRouterConnection(keys.agentRouterKey!)).then(({ result, ms }) => ({
          id: 'agentrouter',
          ...result,
          ms,
        })),
      ),
    );
  }

  // OAuth-backed providers: validate token refresh + a tiny probe.
  if (keys.githubCopilotConnected) {
    // Profile can say "connected" even if SecureStore got cleared (app reinstall / data clear),
    // or if we previously saved an access token without refresh token. Auto-heal to stop noisy warnings.
    const tokenStoreConnected = await isGitHubCopilotTokenStoreConnected();
    if (!tokenStoreConnected) {
      invalidateCopilotSessionToken();
      await clearGitHubCopilotTokens();
      await profileRepository.updateProfile({ githubCopilotConnected: false });
      checks.push(
        Promise.resolve({
          id: 'github_copilot',
          ok: false,
          status: 0,
          ms: 0,
          skipped: true,
          message: 'Disconnected: access token not present in SecureStore',
        }),
      );
    } else {
      checks.push(
        safeCheck(
          'github_copilot',
          timed(async () => {
            const token = await getGitHubCopilotToken();
            return testGitHubCopilotConnection(token);
          }).then(({ result, ms }) => ({ id: 'github_copilot' as ProviderId, ...result, ms })),
        ),
      );
    }
  } else {
    checks.push(
      Promise.resolve({ id: 'github_copilot', ok: false, status: 0, ms: 0, skipped: true }),
    );
  }

  if (keys.gitlabDuoConnected) {
    // Profile can say "connected" even if SecureStore got cleared (app reinstall / data clear),
    // or if the refresh token was revoked. Auto-heal to stop routing to a broken provider.
    const tokenStoreConnected = await isGitLabDuoTokenStoreConnected();
    if (!tokenStoreConnected) {
      await clearGitLabDuoTokens();
      await profileRepository.updateProfile({ gitlabDuoConnected: false });
      checks.push(
        Promise.resolve({
          id: 'gitlab_duo',
          ok: false,
          status: 0,
          ms: 0,
          skipped: true,
          message: 'Disconnected: access token not present in SecureStore',
        }),
      );
    } else {
      checks.push(
        safeCheck(
          'gitlab_duo',
          timed(async () => {
            const token = await getGitLabDuoToken();
            return testGitLabDuoConnection(token);
          }).then(({ result, ms }) => ({ id: 'gitlab_duo' as ProviderId, ...result, ms })),
        ),
      );
    }
  } else {
    checks.push(Promise.resolve({ id: 'gitlab_duo', ok: false, status: 0, ms: 0, skipped: true }));
  }

  if (keys.poeConnected) {
    checks.push(
      safeCheck(
        'poe',
        timed(async () => {
          const token = await getPoeToken();
          return testPoeConnection(token);
        }).then(({ result, ms }) => ({ id: 'poe' as ProviderId, ...result, ms })),
      ),
    );
  } else {
    checks.push(Promise.resolve({ id: 'poe', ok: false, status: 0, ms: 0, skipped: true }));
  }

  // ChatGPT uses a different transport; best-effort probe if connected.
  if (keys.chatgptConnected) {
    checks.push(
      safeCheck(
        'chatgpt',
        timed(async () => {
          const text = await callChatGpt([{ role: 'user', content: 'Reply with one word: ok' }]);
          return {
            ok: !!text?.trim(),
            status: text?.trim() ? 200 : 500,
            message: text?.trim() ? undefined : 'empty response',
          };
        }).then(({ result, ms }) => ({ id: 'chatgpt' as ProviderId, ...result, ms })),
      ),
    );
  } else {
    checks.push(Promise.resolve({ id: 'chatgpt', ok: false, status: 0, ms: 0, skipped: true }));
  }

  const settled = await Promise.allSettled(checks);
  const results: BootCheck[] = settled.map((s) => {
    if (s.status === 'fulfilled') return s.value;
    return {
      id: 'unknown' as ProviderId,
      ok: false,
      status: 0,
      message: s.reason instanceof Error ? s.reason.message : String(s.reason),
      ms: 0,
    };
  });

  const byId = new Map<ProviderId, BootCheck>();
  for (const r of results) byId.set(r.id, r);

  const order: ProviderId[] = [
    'chatgpt',
    'github_copilot',
    'gitlab_duo',
    'poe',
    'groq',
    'github',
    'kilo',
    'deepseek',
    'agentrouter',
    'gemini',
    'gemini_fallback',
    'openrouter',
    'cloudflare',
  ];

  const summary = order
    .map((id) => {
      const r = byId.get(id);
      if (!r) return `${id}=n/a`;
      if (r.skipped) return `${id}=skip`;
      return r.ok ? `${id}=ok` : `${id}=fail(${r.status || 'err'})`;
    })
    .join(' ');

  console.log(`[AI_BOOT] provider validation: ${summary}`);
  for (const id of order) {
    const r = byId.get(id);
    if (!r || r.skipped) continue;
    if (r.ok) {
      console.log(`[AI_BOOT] ${id}: ok (${r.status}) ${r.ms}ms`);
    } else {
      console.warn(`[AI_BOOT] ${id}: fail (${r.status}) ${r.ms}ms — ${brief(r.message)}`);
    }
  }
}
