import * as FileSystem from 'expo-file-system/legacy';
import { saveTranscriptToFile } from './transcriptStorage';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///data/user/0/com.guru/files/',
  cacheDirectory: 'file:///data/user/0/com.guru/cache/',
  makeDirectoryAsync: jest.fn(async () => {}),
  writeAsStringAsync: jest.fn(async () => {}),
  copyAsync: jest.fn(async () => {}),
  EncodingType: { UTF8: 'utf8' },
  getInfoAsync: jest.fn(async () => ({ exists: true })),
  StorageAccessFramework: {
    createFileAsync: jest.fn(async () => 'file://backup'),
  },
}));

jest.mock('../db/repositories', () => ({
  profileRepository: {
    getProfile: jest.fn(async () => ({
      groqApiKey: 'mock-key',
      useLocalWhisper: false,
      backupDirectoryUri: 'content://mock-uri',
    })),
  },
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
  });
});
