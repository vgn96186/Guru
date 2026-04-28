import {
  buildImageSearchSeed,
  isLowInformationImagePrompt,
  isRenderableReferenceImageUrl,
} from './imageSeed';

describe('imageSeed', () => {
  it('detects low-information prompts', () => {
    expect(isLowInformationImagePrompt('')).toBe(true);
    expect(isLowInformationImagePrompt('ok')).toBe(true);
    expect(isLowInformationImagePrompt('left')).toBe(true);
    expect(isLowInformationImagePrompt('diagram of kidney')).toBe(false);
  });

  it('builds a seed from a substantive question', () => {
    const seed = buildImageSearchSeed('show diagram of kidney', 'Renal', []);
    expect(seed?.topic).toContain('Renal');
    expect(seed?.context).toContain('Latest student message');
  });

  it('falls back to recent user prompt when latest question is low-information', () => {
    const seed = buildImageSearchSeed('ok', undefined, [
      { role: 'user', text: 'Can you show a diagram of nephron with labels?' },
      { role: 'guru', text: 'Sure, here is the nephron breakdown...' },
    ]);
    expect(seed?.topic.toLowerCase()).toContain('diagram');
    expect(seed?.context).toContain('Earlier student question');
  });

  it('filters reference image URLs', () => {
    expect(isRenderableReferenceImageUrl(undefined)).toBe(false);
    expect(isRenderableReferenceImageUrl('file://local.png')).toBe(false);
    expect(isRenderableReferenceImageUrl('https://example.com/a.pdf')).toBe(false);
    expect(isRenderableReferenceImageUrl('https://example.com/a.png')).toBe(true);
  });
});
