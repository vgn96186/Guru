import { CLOUD_MAX_COMPLETION_TOKENS, LOCAL_LLM_MAX_COMPLETION_TOKENS } from './completionLimits';

describe('completionLimits', () => {
  it('exports stable cloud and local LLM token ceilings', () => {
    expect(CLOUD_MAX_COMPLETION_TOKENS).toBe(8192);
    expect(LOCAL_LLM_MAX_COMPLETION_TOKENS).toBe(4096);
  });
});
