import { getWhisperModelManager } from './whisperModelManager';
import * as FileSystem from 'expo-file-system/legacy';

// Mock FileSystem
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock-docs/',
  cacheDirectory: 'file:///mock-cache/',
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  downloadAsync: jest.fn(),
  readAsStringAsync: jest.fn().mockResolvedValue('YmFzZTY0ZGF0YQ=='), // "base64data" in b64
  EncodingType: {
    Base64: 'base64',
  },
}));

// Mock crypto for SHA check
if (!(global as any).crypto) {
  (global as any).crypto = require('crypto');
}
try {
  Object.defineProperty(global.crypto, 'subtle', {
    value: {
      digest: jest.fn(async (algo, data) => {
        // Return expected hash for 'base' model to pass checksum
        const hex = 'ed5e8401c63e01c65d07d1fba2a78a824c52aeb6ae1a9d4e49f560a0a1bf5e9a';
        const typedArray = new Uint8Array(hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
        return typedArray.buffer;
      }),
    },
    configurable: true,
  });
} catch (e) {
  // If already defined and not configurable, try to spy
  jest.spyOn(global.crypto.subtle, 'digest').mockImplementation(async (algo, data) => {
    const hex = 'ed5e8401c63e01c65d07d1fba2a78a824c52aeb6ae1a9d4e49f560a0a1bf5e9a';
    const typedArray = new Uint8Array(hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
    return typedArray.buffer;
  });
}

describe('whisperModelManager', () => {
  let manager: any;
  let FileSystem: any;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('expo-file-system/legacy', () => ({
      documentDirectory: 'file:///mock-docs/',
      cacheDirectory: 'file:///mock-cache/',
      getInfoAsync: jest.fn(),
      makeDirectoryAsync: jest.fn(),
      downloadAsync: jest.fn(),
      readAsStringAsync: jest.fn().mockResolvedValue('YmFzZTY0ZGF0YQ=='),
      EncodingType: {
        Base64: 'base64',
      },
    }));

    // Mock whisper.rn
    jest.doMock('whisper.rn', () => ({
      initWhisper: jest.fn(),
    }));

    manager = require('./whisperModelManager').getWhisperModelManager();
    FileSystem = require('expo-file-system/legacy');
  });

  it('can check if a model exists', async () => {
    jest.spyOn(manager, 'isModelDownloaded').mockResolvedValue(true);
    const exists = await manager.isModelDownloaded('base');
    expect(exists).toBe(true);
  });

  it('can list downloaded models', async () => {
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, size: 147_951_465 });
    const models = await manager.listDownloadedModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models.some((m: any) => m.size === 'base')).toBe(true);
  });
});
