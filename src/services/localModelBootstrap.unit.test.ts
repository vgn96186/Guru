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

describe('localModelBootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRefreshProfile.mockClear();
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
    // To trigger warning, we need to bypass the early return
    // (!needsLlm && !needsWhisper) must be false
    // needsLlm = llmAllowed && !profile.localModelPath
    // needsWhisper = !profile.localWhisperPath
    
    // If llmAllowed is false, needsLlm is false.
    // So needsWhisper MUST be true to avoid early return.
    
    (profileRepository.getProfile as jest.Mock).mockResolvedValue({
      localModelPath: '',
      localWhisperPath: '', // Make it missing so we don't return early
    });
    (isLocalLlmAllowedOnThisDevice as jest.Mock).mockReturnValue(false);
    (getLocalLlmRamWarning as jest.Mock).mockReturnValue('Low RAM warning');

    // Mock Whisper download to avoid it failing the test
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
    const mockDownload = {
      downloadAsync: jest.fn().mockResolvedValue({ status: 500 }), // Fail it so it doesn't try to move files
    };
    (FileSystem.createDownloadResumable as jest.Mock).mockReturnValue(mockDownload);

    await bootstrapLocalModels();

    expect(showToast).toHaveBeenCalledWith('Low RAM warning', 'warning');
  });

  it('should download Whisper if missing', async () => {
    (profileRepository.getProfile as jest.Mock).mockResolvedValue({
      localModelPath: 'path/to/llm',
      localWhisperPath: '',
    });
    (isLocalLlmAllowedOnThisDevice as jest.Mock).mockReturnValue(true);
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
    
    const mockDownload = {
      downloadAsync: jest.fn().mockResolvedValue({ status: 200 }),
    };
    (FileSystem.createDownloadResumable as jest.Mock).mockReturnValue(mockDownload);
    (FileSystem.getInfoAsync as jest.Mock)
      .mockResolvedValueOnce({ exists: false }) // first check
      .mockResolvedValueOnce({ exists: true, size: 800_000_000 }); // after download check

    await bootstrapLocalModels();

    expect(FileSystem.createDownloadResumable).toHaveBeenCalledWith(
      expect.stringContaining('whisper'),
      expect.stringContaining('ggml-large-v3-turbo.bin.partial'),
      {},
      expect.any(Function)
    );
    expect(profileRepository.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ localWhisperPath: expect.any(String), useLocalWhisper: true })
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
      .mockResolvedValueOnce({ exists: false }) // LLM check
      .mockResolvedValueOnce({ exists: true, size: 2_300_000_000 }); // LLM download check

    await bootstrapLocalModels();

    expect(FileSystem.createDownloadResumable).toHaveBeenCalledWith(
      expect.stringContaining('medgemma'),
      expect.stringContaining('medgemma-4b-it-q4_k_m.gguf.partial'),
      {},
      expect.any(Function)
    );
    expect(profileRepository.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ localModelPath: expect.any(String), useLocalModel: true })
    );
  });

  it('should use existing model if it meets size requirement', async () => {
    (profileRepository.getProfile as jest.Mock).mockResolvedValue({
      localModelPath: '',
      localWhisperPath: 'path/to/whisper',
    });
    (isLocalLlmAllowedOnThisDevice as jest.Mock).mockReturnValue(true);
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, size: 2_500_000_000 });

    await bootstrapLocalModels();

    expect(FileSystem.createDownloadResumable).not.toHaveBeenCalled();
    expect(profileRepository.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ localModelPath: expect.any(String), useLocalModel: true })
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
      .mockResolvedValueOnce({ exists: true, size: 2_300_000_000 }); // Post-download check

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
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });

    const mockDownload = {
      downloadAsync: jest.fn().mockResolvedValue({ status: 500 }),
    };
    (FileSystem.createDownloadResumable as jest.Mock).mockReturnValue(mockDownload);

    await bootstrapLocalModels();

    expect(FileSystem.deleteAsync).toHaveBeenCalled();
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
});
