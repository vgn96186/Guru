import * as FileSystem from 'expo-file-system/legacy';
import { profileRepository } from '../db/repositories';
import { useAppStore } from '../store/useAppStore';
import { getLocalLlmRamWarning, isLocalLlmAllowedOnThisDevice } from './deviceMemory';
import { showToast } from '../components/Toast';
import { bootstrapLocalModels } from './localModelBootstrap';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock/',
  getInfoAsync: jest.fn(),
  deleteAsync: jest.fn(),
  moveAsync: jest.fn(),
  createDownloadResumable: jest.fn(),
  readAsStringAsync: jest.fn(),
  EncodingType: {
    Base64: 'base64',
  },
}));

jest.mock('../../modules/app-launcher', () => ({
  concatenateFiles: jest.fn().mockResolvedValue(true),
}));

jest.mock('../db/repositories', () => ({
  profileRepository: {
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
  },
}));

const mockRefreshProfile = jest.fn();
jest.mock('../store/useAppStore', () => ({
  useAppStore: {
    getState: jest.fn(() => ({
      refreshProfile: mockRefreshProfile,
    })),
  },
}));

jest.mock('./deviceMemory', () => ({
  getLocalLlmRamWarning: jest.fn(),
  isLocalLlmAllowedOnThisDevice: jest.fn(),
}));

jest.mock('../components/Toast', () => ({
  showToast: jest.fn(),
}));

// Spy only on `digest` so PBKDF2/AES-GCM (`importKey`, `deriveKey`, etc.) keep working for other suites.
const LLm_SHA = '8bcb19d3e363f7d1ab27f364032436fd702e735a6f479d6bb7b1cf066e76b443';
const WHISPER_SHA = '1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69';

function getBufferSourceByteLength(data: BufferSource): number {
  if (data instanceof ArrayBuffer) {
    return data.byteLength;
  }
  if (ArrayBuffer.isView(data)) {
    return data.byteLength;
  }
  return 0;
}

// Default: no Range support → single-stream fallback path
const mockFetch = jest.fn().mockResolvedValue({
  headers: new Map([
    ['accept-ranges', 'none'],
    ['content-length', '0'],
  ]),
});
(global as any).fetch = mockFetch;

describe('localModelBootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRefreshProfile.mockClear();
    // Reset fetch to no-range-support default for each test
    mockFetch.mockResolvedValue({
      headers: new Map([
        ['accept-ranges', 'none'],
        ['content-length', '0'],
      ]),
    });

    jest
      .spyOn(globalThis.crypto.subtle, 'digest')
      .mockImplementation(async (_algorithm: AlgorithmIdentifier, data: BufferSource) => {
        const byteLength = getBufferSourceByteLength(data);
        const hex = byteLength === 1 ? LLm_SHA : WHISPER_SHA;
        const typedArray = new Uint8Array(hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
        return typedArray.buffer;
      });

    // Provide deterministic base64 content so digest() can select the expected hash.
    (FileSystem.readAsStringAsync as jest.Mock).mockImplementation(async (filePath: string) => {
      if (String(filePath).includes('gemma-4-E4B-it.litertlm')) return 'AQ=='; // 1 byte
      if (String(filePath).includes('ggml-large-v3-turbo.bin')) return 'AgM='; // 2 bytes sentinel
      return 'AA==';
    });
  });

  it('should skip if both models are already configured', async () => {
    (profileRepository.getProfile as jest.Mock).mockResolvedValue({
      localModelPath: 'path/to/llm',
      localWhisperPath: 'path/to/whisper',
    });
    (isLocalLlmAllowedOnThisDevice as jest.Mock).mockReturnValue(true);

    await bootstrapLocalModels();

    expect(FileSystem.getInfoAsync).not.toHaveBeenCalled();
  });

  it('should show warning if LLM is not allowed and LLM is missing, even if Whisper is present', async () => {
    (profileRepository.getProfile as jest.Mock).mockResolvedValue({
      localModelPath: '',
      localWhisperPath: 'path/to/whisper',
    });
    (isLocalLlmAllowedOnThisDevice as jest.Mock).mockReturnValue(false);
    (getLocalLlmRamWarning as jest.Mock).mockReturnValue('Low RAM warning');

    const mockDownload = {
      downloadAsync: jest.fn().mockResolvedValue({ status: 200 }),
    };
    (FileSystem.createDownloadResumable as jest.Mock).mockReturnValue(mockDownload);
    (FileSystem.getInfoAsync as jest.Mock)
      .mockResolvedValueOnce({ exists: false }) // target path: no complete file yet
      .mockResolvedValueOnce({ exists: false }) // partial before download
      .mockResolvedValueOnce({ exists: true, size: 3_600_000_000 }); // validate partial after download

    await bootstrapLocalModels();

    expect(showToast).toHaveBeenCalledWith('Low RAM warning', 'warning');
    expect(FileSystem.createDownloadResumable).toHaveBeenCalledWith(
      expect.stringContaining('gemma-4'),
      expect.stringContaining('gemma-4-E4B-it.litertlm.partial'),
      { headers: { 'Accept-Encoding': 'identity' } },
      expect.any(Function),
    );
    expect(profileRepository.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ localModelPath: expect.any(String), useLocalModel: false }),
    );
  });

  it('should download Whisper if missing', async () => {
    (profileRepository.getProfile as jest.Mock).mockResolvedValue({
      localModelPath: 'path/to/llm',
      localWhisperPath: '',
    });
    (isLocalLlmAllowedOnThisDevice as jest.Mock).mockReturnValue(true);

    const mockDownload = {
      downloadAsync: jest.fn().mockResolvedValue({ status: 200 }),
    };
    (FileSystem.createDownloadResumable as jest.Mock).mockReturnValue(mockDownload);
    (FileSystem.getInfoAsync as jest.Mock)
      .mockResolvedValueOnce({ exists: false }) // target path
      .mockResolvedValueOnce({ exists: false }) // partial before download
      .mockResolvedValueOnce({ exists: true, size: 810_000_000 }); // validate partial after download

    await bootstrapLocalModels();

    expect(FileSystem.createDownloadResumable).toHaveBeenCalledWith(
      expect.stringContaining('whisper'),
      expect.stringContaining('ggml-large-v3-turbo.bin.partial'),
      { headers: { 'Accept-Encoding': 'identity' } },
      expect.any(Function),
    );
    expect(profileRepository.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ localWhisperPath: expect.any(String), useLocalWhisper: true }),
    );
  });

  it('should download LLM if missing and allowed', async () => {
    (profileRepository.getProfile as jest.Mock).mockResolvedValue({
      localModelPath: '',
      localWhisperPath: 'path/to/whisper',
    });
    (isLocalLlmAllowedOnThisDevice as jest.Mock).mockReturnValue(true);

    const mockDownload = {
      downloadAsync: jest.fn().mockResolvedValue({ status: 200 }),
    };
    (FileSystem.createDownloadResumable as jest.Mock).mockReturnValue(mockDownload);
    (FileSystem.getInfoAsync as jest.Mock)
      .mockResolvedValueOnce({ exists: false }) // target path
      .mockResolvedValueOnce({ exists: false }) // partial before download
      .mockResolvedValueOnce({ exists: true, size: 3_600_000_000 }); // validate partial after download

    await bootstrapLocalModels();

    expect(FileSystem.createDownloadResumable).toHaveBeenCalledWith(
      expect.stringContaining('gemma-4'),
      expect.stringContaining('gemma-4-E4B-it.litertlm.partial'),
      { headers: { 'Accept-Encoding': 'identity' } },
      expect.any(Function),
    );
    expect(profileRepository.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ localModelPath: expect.any(String), useLocalModel: true }),
    );
  });

  it('should use existing model if it meets size requirement', async () => {
    (profileRepository.getProfile as jest.Mock).mockResolvedValue({
      localModelPath: '',
      localWhisperPath: 'path/to/whisper',
    });
    (isLocalLlmAllowedOnThisDevice as jest.Mock).mockReturnValue(true);
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, size: 3_600_000_000 });

    await bootstrapLocalModels();

    expect(FileSystem.createDownloadResumable).not.toHaveBeenCalled();
    expect(profileRepository.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ localModelPath: expect.any(String), useLocalModel: true }),
    );
  });

  it('should not delete a valid existing model just because checksum verification is unavailable', async () => {
    (profileRepository.getProfile as jest.Mock).mockResolvedValue({
      localModelPath: '',
      localWhisperPath: 'path/to/whisper',
    });
    (isLocalLlmAllowedOnThisDevice as jest.Mock).mockReturnValue(true);
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, size: 3_600_000_000 });
    (FileSystem.readAsStringAsync as jest.Mock).mockRejectedValue(new Error('too large'));

    await bootstrapLocalModels();

    expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
    expect(FileSystem.createDownloadResumable).not.toHaveBeenCalled();
    expect(profileRepository.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ localModelPath: expect.any(String), useLocalModel: true }),
    );
  });

  it('should delete and re-download if existing model is too small', async () => {
    (profileRepository.getProfile as jest.Mock).mockResolvedValue({
      localModelPath: '',
      localWhisperPath: 'path/to/whisper',
    });
    (isLocalLlmAllowedOnThisDevice as jest.Mock).mockReturnValue(true);

    (FileSystem.getInfoAsync as jest.Mock)
      .mockResolvedValueOnce({ exists: true, size: 1000 }) // Initial check (too small)
      .mockResolvedValueOnce({ exists: false }) // partial does not exist
      .mockResolvedValueOnce({ exists: false }) // no resumable partial before fresh download
      .mockResolvedValueOnce({ exists: true, size: 3_600_000_000 }); // Post-download check

    const mockDownload = {
      downloadAsync: jest.fn().mockResolvedValue({ status: 200 }),
    };
    (FileSystem.createDownloadResumable as jest.Mock).mockReturnValue(mockDownload);

    await bootstrapLocalModels();

    expect(FileSystem.deleteAsync).toHaveBeenCalled();
    expect(FileSystem.createDownloadResumable).toHaveBeenCalled();
  });

  it('should handle download failure gracefully', async () => {
    (profileRepository.getProfile as jest.Mock).mockResolvedValue({
      localModelPath: '',
      localWhisperPath: 'path/to/whisper',
    });
    (isLocalLlmAllowedOnThisDevice as jest.Mock).mockReturnValue(true);
    (FileSystem.getInfoAsync as jest.Mock).mockReset();
    (FileSystem.getInfoAsync as jest.Mock)
      .mockResolvedValueOnce({ exists: false }) // target path
      .mockResolvedValueOnce({ exists: false }); // partial path

    const mockDownload = {
      downloadAsync: jest.fn().mockResolvedValue({ status: 500 }),
    };
    (FileSystem.createDownloadResumable as jest.Mock).mockReset();
    (FileSystem.createDownloadResumable as jest.Mock).mockReturnValue(mockDownload);

    await bootstrapLocalModels();

    expect(profileRepository.updateProfile).not.toHaveBeenCalled();
  });

  it('should handle exceptions during download', async () => {
    (profileRepository.getProfile as jest.Mock).mockResolvedValue({
      localModelPath: '',
      localWhisperPath: 'path/to/whisper',
    });
    (isLocalLlmAllowedOnThisDevice as jest.Mock).mockReturnValue(true);
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });

    (FileSystem.createDownloadResumable as jest.Mock).mockImplementation(() => {
      throw new Error('Network error');
    });

    await bootstrapLocalModels();

    // Should catch error and not crash
    expect(profileRepository.updateProfile).not.toHaveBeenCalled();
  });

  it('should finalize an existing valid partial file instead of re-downloading', async () => {
    (profileRepository.getProfile as jest.Mock).mockResolvedValue({
      localModelPath: '',
      localWhisperPath: 'path/to/whisper',
    });
    (isLocalLlmAllowedOnThisDevice as jest.Mock).mockReturnValue(true);
    (FileSystem.getInfoAsync as jest.Mock)
      .mockResolvedValueOnce({ exists: false }) // target path missing
      .mockResolvedValueOnce({ exists: true, size: 3_600_000_000 }) // partial path valid
      .mockResolvedValueOnce({ exists: true, size: 3_600_000_000 }); // handleDownloadComplete validation
    (FileSystem.readAsStringAsync as jest.Mock).mockRejectedValue(new Error('no resume data'));

    await bootstrapLocalModels();

    expect(FileSystem.createDownloadResumable).not.toHaveBeenCalled();
    expect(FileSystem.moveAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        from: expect.stringContaining('.partial'),
        to: expect.stringContaining('gemma-4-E4B-it.litertlm'),
      }),
    );
    expect(profileRepository.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ localModelPath: expect.any(String), useLocalModel: true }),
    );
  });

  it('should not restart from zero when an interrupted partial file exists without resume data', async () => {
    (profileRepository.getProfile as jest.Mock).mockResolvedValue({
      localModelPath: '',
      localWhisperPath: 'path/to/whisper',
    });
    (isLocalLlmAllowedOnThisDevice as jest.Mock).mockReturnValue(true);
    (FileSystem.getInfoAsync as jest.Mock)
      .mockResolvedValueOnce({ exists: false }) // target path missing
      .mockResolvedValueOnce({ exists: true, size: 1_000_000 }); // partial exists but incomplete
    (FileSystem.readAsStringAsync as jest.Mock).mockRejectedValue(new Error('no resume data'));

    await bootstrapLocalModels();

    expect(FileSystem.createDownloadResumable).not.toHaveBeenCalled();
    expect(FileSystem.deleteAsync).not.toHaveBeenCalledWith(
      expect.stringContaining('.partial'),
      expect.anything(),
    );
    expect(profileRepository.updateProfile).not.toHaveBeenCalledWith(
      expect.objectContaining({ localModelPath: expect.any(String) }),
    );
  });

  it('downloads LLM with a single resumable task (no Range / chunk probe)', async () => {
    (profileRepository.getProfile as jest.Mock).mockResolvedValue({
      localModelPath: '',
      localWhisperPath: 'path/to/whisper',
    });
    (isLocalLlmAllowedOnThisDevice as jest.Mock).mockReturnValue(true);

    const mockDownload = {
      downloadAsync: jest.fn().mockResolvedValue({ status: 200 }),
    };
    (FileSystem.createDownloadResumable as jest.Mock).mockReturnValue(mockDownload);
    (FileSystem.getInfoAsync as jest.Mock)
      .mockResolvedValueOnce({ exists: false }) // target path
      .mockResolvedValueOnce({ exists: false }) // partial before download
      .mockResolvedValueOnce({ exists: true, size: 3_600_000_000 }); // validate partial after download

    await bootstrapLocalModels();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(FileSystem.createDownloadResumable).toHaveBeenCalledWith(
      expect.stringContaining('gemma-4'),
      expect.stringContaining('gemma-4-E4B-it.litertlm.partial'),
      { headers: { 'Accept-Encoding': 'identity' } },
      expect.any(Function),
    );
    expect(profileRepository.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ localModelPath: expect.any(String), useLocalModel: true }),
    );
  });
});
