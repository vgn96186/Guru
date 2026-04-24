import type { ProviderId, UserProfile } from '../../../types';
import { createGuruFallbackModel } from '../v2/providers/guruFallback';
import type { GroundingDecision } from './types';

const NON_TOOL_CAPABLE_PROVIDERS = new Set<ProviderId>(['gitlab_duo', 'poe']);

function getToolCapableProviderOrder(profile: UserProfile): ProviderId[] | undefined {
  const order = profile.providerOrder?.filter(
    (provider): provider is ProviderId => !NON_TOOL_CAPABLE_PROVIDERS.has(provider as ProviderId),
  );
  return order && order.length > 0 ? order : undefined;
}

export function buildGroundingModel(options: {
  profile: UserProfile;
  decision: GroundingDecision;
  onProviderError?: (provider: string, modelId: string, error: unknown) => void;
  onProviderSuccess?: (provider: string, modelId: string) => void;
}) {
  return createGuruFallbackModel({
    profile: options.profile,
    textMode: true,
    disableLocal: options.decision.mode === 'grounded_agent',
    forceOrder:
      options.decision.mode === 'grounded_agent'
        ? getToolCapableProviderOrder(options.profile)
        : undefined,
    onProviderError: options.onProviderError,
    onProviderSuccess: options.onProviderSuccess,
  });
}
