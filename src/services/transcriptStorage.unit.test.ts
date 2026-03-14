import * as FileSystem from 'expo-file-system/legacy';
import { saveTranscriptToFile } from './transcriptStorage';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///data/user/0/com.guru/files/',
  cacheDirectory: 'file:///data/user/0/com.guru/cache/',
  makeDirectoryAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  copyAsync: jest.fn(),
  EncodingType: { UTF8: 'utf8' },
}));

describe('transcriptStorage backup', () => {
  it('should save transcript and attempt backup', async () => {
    const text = 'Biochemistry lecture content';
    const uri = await saveTranscriptToFile(text);

    expect(uri).toContain('transcript_');
    expect(FileSystem.makeDirectoryAsync).toHaveBeenCalled();
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      expect.stringContaining('transcripts/transcript_'),
      text,
      { encoding: 'utf8' },
    );
    // Check if backup was attempted
    expect(FileSystem.copyAsync).toHaveBeenCalled();
  });
});
