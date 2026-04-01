import {
  isGitLabDuoOpenCodeGatewayModel,
  resolveGitLabDuoGatewayModel,
} from './gitlabDuoGatewayModels';

describe('gitlabDuoGatewayModels', () => {
  it('resolves duo-chat-haiku-4-5 to Anthropic gateway model', () => {
    expect(resolveGitLabDuoGatewayModel('duo-chat-haiku-4-5')).toEqual({
      kind: 'anthropic',
      anthropicModel: 'claude-haiku-4-5-20251001',
    });
  });

  it('resolves duo-chat-gpt-5-4 to OpenAI gateway model', () => {
    expect(resolveGitLabDuoGatewayModel('duo-chat-gpt-5-4')).toEqual({
      kind: 'openai',
      openaiModel: 'gpt-5.4-2026-03-05',
    });
  });

  it('resolves bare model ids that are now in the gateway map', () => {
    expect(resolveGitLabDuoGatewayModel('gpt-4o')).toEqual({
      kind: 'openai',
      openaiModel: 'gpt-4o',
    });
    expect(isGitLabDuoOpenCodeGatewayModel('gpt-4o')).toBe(true);
  });

  it('returns null for completely unknown model ids', () => {
    expect(resolveGitLabDuoGatewayModel('nonexistent-model')).toBeNull();
    expect(isGitLabDuoOpenCodeGatewayModel('nonexistent-model')).toBe(false);
  });
});
