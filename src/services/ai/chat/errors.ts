export function mapGroundedChatError(error: unknown): Error {
  const msg = error instanceof Error ? error.message : String(error);
  if (__DEV__) console.warn('[GuruGrounded] Generation failed:', msg);
  if (
    typeof msg === 'string' &&
    msg.toLowerCase().includes('invalid') &&
    msg.toLowerCase().includes('key')
  ) {
    return new Error(
      'Invalid API key. Check Settings or .env (EXPO_PUBLIC_BUNDLED_GROQ_KEY). Restart with: npx expo start --clear',
    );
  }
  if (
    typeof msg === 'string' &&
    (msg.includes('429') || msg.toLowerCase().includes('rate limit'))
  ) {
    return new Error('Rate limit hit. Wait a minute or try again.');
  }
  return new Error(`Guru couldn't respond: ${String(msg).slice(0, 120)}`);
}
