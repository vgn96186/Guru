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
});
