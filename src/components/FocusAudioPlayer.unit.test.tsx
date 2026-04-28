import fs from 'fs';
import path from 'path';

describe('FocusAudioPlayer', () => {
  it('uses expo-audio player APIs (not expo-av)', () => {
    const filePath = path.join(__dirname, 'FocusAudioPlayer.tsx');
    const source = fs.readFileSync(filePath, 'utf8');
    expect(source).toContain("from 'expo-audio'");
    expect(source).toContain('createAudioPlayer');
    expect(source).toContain('setAudioModeAsync');
    expect(source).not.toContain("from 'expo' + '-av'");
  });
});
