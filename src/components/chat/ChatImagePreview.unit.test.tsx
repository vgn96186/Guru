import { isSupportedChatImageUri } from './ChatImagePreview';

describe('ChatImagePreview URI support', () => {
  it('accepts generated local image URIs as well as remote reference images', () => {
    expect(isSupportedChatImageUri('https://example.com/reference.png')).toBe(true);
    expect(isSupportedChatImageUri('file:///data/user/0/guru/generated/image.png')).toBe(true);
    expect(isSupportedChatImageUri('content://media/external/images/media/42')).toBe(true);
    expect(isSupportedChatImageUri('/data/user/0/guru/generated/image.png')).toBe(true);
  });

  it('rejects empty or unsupported URI values', () => {
    expect(isSupportedChatImageUri('')).toBe(false);
    expect(isSupportedChatImageUri('   ')).toBe(false);
    expect(isSupportedChatImageUri('javascript:alert(1)')).toBe(false);
  });
});
