import fs from 'fs';
import path from 'path';

describe('AudioPlayer', () => {
  it('imports expo-audio (not expo av)', () => {
    const filePath = path.join(__dirname, 'AudioPlayer.tsx');
    const source = fs.readFileSync(filePath, 'utf8');
    expect(source).toContain("from 'expo-audio'");
    expect(source).not.toContain("from 'expo' + '-av'");
  });
});
