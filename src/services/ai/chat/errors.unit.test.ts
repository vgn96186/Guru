import { mapGroundedChatError } from './errors';

describe('mapGroundedChatError', () => {
  it('maps invalid key errors', () => {
    const err = mapGroundedChatError(new Error('Invalid API key'));
    expect(err.message.toLowerCase()).toContain('invalid api key');
  });

  it('maps rate limit errors', () => {
    const err = mapGroundedChatError(new Error('429 rate limit'));
    expect(err.message.toLowerCase()).toContain('rate limit');
  });

  it('maps unknown errors', () => {
    const err = mapGroundedChatError('something else happened');
    expect(err.message.toLowerCase()).toContain("guru couldn't respond");
  });
});
