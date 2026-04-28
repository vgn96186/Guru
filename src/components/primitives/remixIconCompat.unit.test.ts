import { resolveRemixIconName } from './remixIconCompat';

describe('resolveRemixIconName', () => {
  it('maps common Ionicons names to meaningful remix icons', () => {
    expect(resolveRemixIconName('trash-outline', 'filled')).toMatch(/delete-bin/);
    expect(resolveRemixIconName('copy-outline', 'filled')).toMatch(/file-copy/);
    expect(resolveRemixIconName('alert-circle-outline', 'filled')).toMatch(/alert/);
    expect(resolveRemixIconName('warning-outline', 'filled')).toMatch(/error-warning/);
    expect(resolveRemixIconName('hardware-chip-outline', 'filled')).toMatch(/cpu/);
    expect(resolveRemixIconName('medical-outline', 'filled')).toMatch(/stethoscope|first-aid/);
    expect(resolveRemixIconName('bone-outline', 'filled')).toMatch(/body-scan|stethoscope/);
  });

  it('avoids the question-mark fallback for commonly used app icons', () => {
    expect(resolveRemixIconName('help-circle-outline', 'outlined')).toBe('questionnaire-line');
    expect(resolveRemixIconName('help-circle-outline', 'filled')).toBe('questionnaire-fill');
    expect(resolveRemixIconName('shield-half-outline', 'outlined')).toBe('shield-line');
    expect(resolveRemixIconName('shield-half-outline', 'filled')).toBe('shield-fill');
    expect(resolveRemixIconName('albums-outline', 'outlined')).toMatch(/album/);
  });

  it('does not fall back for action-hub / chrome icon set', () => {
    const outlined = [
      'calendar-outline',
      'help-circle-outline',
      'albums-outline',
      'library-outline',
      'document-text-outline',
      'mic-outline',
      'bar-chart-outline',
      'images-outline',
      'search-outline',
      'link-outline',
      'settings-outline',
      'reorder-three-outline',
      'create-outline',
      'close',
      'chevron-forward-outline',
      'flash-outline',
      'hardware-chip-outline',
      'medical-outline',
      'bone-outline',
      'arrow-up-circle-outline',
      'logo-youtube',
      'apps-outline',
    ];

    for (const name of outlined) {
      const resolved = resolveRemixIconName(name, 'outlined');
      if (resolved === 'question-line') {
        throw new Error(`resolveRemixIconName() fell back for ${name}`);
      }
    }
  });
});
