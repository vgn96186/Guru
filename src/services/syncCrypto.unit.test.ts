import { decryptPayload, encryptPayload } from './syncCrypto';

describe('syncCrypto', () => {
  it('encrypts and decrypts v2 payload with metadata', async () => {
    const msg = { type: 'LECTURE_STOPPED' };
    const envelope = await encryptPayload('room-code-123', msg);
    const decrypted = await decryptPayload('room-code-123', envelope);

    expect(decrypted).not.toBeNull();
    expect(decrypted?.version).toBe(2);
    expect(decrypted?.payload).toEqual(msg);
    expect(typeof decrypted?.ts).toBe('number');
    expect(typeof decrypted?.msgId).toBe('string');
  });

  it('fails decryption with wrong key', async () => {
    const envelope = await encryptPayload('room-code-123', { type: 'BREAK_STARTED', durationSeconds: 10 });
    const decrypted = await decryptPayload('wrong-code', envelope);
    expect(decrypted).toBeNull();
  });
});
