let mockTotalMemory: number | null = null;

jest.mock(
  'expo-device',
  () => {
    return {
      get totalMemory() {
        return mockTotalMemory;
      },
    };
  },
  { virtual: true },
);

// Mock repositories and components to avoid native module errors
import { profileRepository } from '../db/repositories';
import { showToast } from '../components/Toast';

jest.mock('../db/repositories', () => ({
  profileRepository: {
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
  },
}));

jest.mock('../components/Toast', () => ({
  showToast: jest.fn(),
}));

import {
  getTotalDeviceMemoryBytes,
  isLocalLlmAllowedOnThisDevice,
  getLocalLlmRamWarning,
  isLocalLlmUsable,
  enforceLocalLlmRamGuard,
  MIN_LOCAL_LLM_RAM_BYTES,
} from './deviceMemory';
import type { UserProfile } from '../types';

describe('deviceMemory service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTotalMemory = null;
  });

  describe('getTotalDeviceMemoryBytes', () => {
    it('returns null if totalMemory is null or undefined', () => {
      mockTotalMemory = null;
      expect(getTotalDeviceMemoryBytes()).toBeNull();
      
      mockTotalMemory = undefined as any;
      expect(getTotalDeviceMemoryBytes()).toBeNull();
    });

    it('returns null if totalMemory is NaN or Infinity', () => {
      mockTotalMemory = NaN;
      expect(getTotalDeviceMemoryBytes()).toBeNull();
      
      mockTotalMemory = Infinity;
      expect(getTotalDeviceMemoryBytes()).toBeNull();
    });

    it('returns null if totalMemory is <= 0', () => {
      mockTotalMemory = 0;
      expect(getTotalDeviceMemoryBytes()).toBeNull();
      
      mockTotalMemory = -1024;
      expect(getTotalDeviceMemoryBytes()).toBeNull();
    });

    it('returns the exact memory if valid', () => {
      mockTotalMemory = 8 * 1024 * 1024 * 1024;
      expect(getTotalDeviceMemoryBytes()).toBe(mockTotalMemory);
    });
  });

  describe('isLocalLlmAllowedOnThisDevice', () => {
    it('returns true when totalMemory is null (unknown memory)', () => {
      mockTotalMemory = null;
      expect(isLocalLlmAllowedOnThisDevice()).toBe(true);
    });

    it('returns true when totalMemory is exactly MIN_LOCAL_LLM_RAM_BYTES', () => {
      mockTotalMemory = MIN_LOCAL_LLM_RAM_BYTES;
      expect(isLocalLlmAllowedOnThisDevice()).toBe(true);
    });

    it('returns true when totalMemory is greater than MIN_LOCAL_LLM_RAM_BYTES', () => {
      mockTotalMemory = MIN_LOCAL_LLM_RAM_BYTES + 1024;
      expect(isLocalLlmAllowedOnThisDevice()).toBe(true);
    });

    it('returns false when totalMemory is less than MIN_LOCAL_LLM_RAM_BYTES and > 0', () => {
      mockTotalMemory = MIN_LOCAL_LLM_RAM_BYTES - 1024;
      expect(isLocalLlmAllowedOnThisDevice()).toBe(false);
    });

    it('returns true when totalMemory is <= 0 (invalid memory)', () => {
      mockTotalMemory = 0;
      expect(isLocalLlmAllowedOnThisDevice()).toBe(true);
  
      mockTotalMemory = -1;
      expect(isLocalLlmAllowedOnThisDevice()).toBe(true);
    });
  });

  describe('getLocalLlmRamWarning', () => {
    it('returns null if memory is unknown (allowed)', () => {
      mockTotalMemory = null;
      expect(getLocalLlmRamWarning()).toBeNull();
    });

    it('returns null if memory is >= MIN_LOCAL_LLM_RAM_BYTES', () => {
      mockTotalMemory = MIN_LOCAL_LLM_RAM_BYTES;
      expect(getLocalLlmRamWarning()).toBeNull();
    });

    it('returns formatted warning string if memory is < MIN_LOCAL_LLM_RAM_BYTES', () => {
      // 3.5 GB
      mockTotalMemory = 3.5 * 1024 * 1024 * 1024;
      expect(getLocalLlmRamWarning()).toBe(
        'This device has 3.5 GB RAM. Guru disables on-device text AI below 4.0 GB to avoid crashes.'
      );
    });
  });

  describe('isLocalLlmUsable', () => {
    const validProfile = { useLocalModel: true, localModelPath: '/path/to/model' } as UserProfile;

    it('returns false if profile is null or undefined', () => {
      mockTotalMemory = MIN_LOCAL_LLM_RAM_BYTES;
      expect(isLocalLlmUsable(null)).toBe(false);
      expect(isLocalLlmUsable(undefined)).toBe(false);
    });

    it('returns false if useLocalModel is false', () => {
      mockTotalMemory = MIN_LOCAL_LLM_RAM_BYTES;
      expect(isLocalLlmUsable({ ...validProfile, useLocalModel: false })).toBe(false);
    });

    it('returns false if localModelPath is missing', () => {
      mockTotalMemory = MIN_LOCAL_LLM_RAM_BYTES;
      expect(isLocalLlmUsable({ ...validProfile, localModelPath: undefined as any })).toBe(false);
      expect(isLocalLlmUsable({ ...validProfile, localModelPath: '' })).toBe(false);
    });

    it('returns false if device memory is too low', () => {
      mockTotalMemory = MIN_LOCAL_LLM_RAM_BYTES - 1; // Disallowed
      expect(isLocalLlmUsable(validProfile)).toBe(false);
    });

    it('returns true if profile wants local, has path, and device allows it', () => {
      mockTotalMemory = MIN_LOCAL_LLM_RAM_BYTES;
      expect(isLocalLlmUsable(validProfile)).toBe(true);
    });
  });

  describe('enforceLocalLlmRamGuard', () => {
    beforeEach(() => {
      (profileRepository.updateProfile as jest.Mock).mockResolvedValue(undefined);
    });

    it('returns true and does nothing if profile useLocalModel is false', async () => {
      (profileRepository.getProfile as jest.Mock).mockResolvedValue({ useLocalModel: false });
      
      const result = await enforceLocalLlmRamGuard(true);
      
      expect(result).toBe(true);
      expect(profileRepository.updateProfile).not.toHaveBeenCalled();
      expect(showToast).not.toHaveBeenCalled();
    });

    it('returns true and does nothing if memory is sufficient', async () => {
      (profileRepository.getProfile as jest.Mock).mockResolvedValue({ useLocalModel: true });
      mockTotalMemory = MIN_LOCAL_LLM_RAM_BYTES;
      
      const result = await enforceLocalLlmRamGuard(true);
      
      expect(result).toBe(true);
      expect(profileRepository.updateProfile).not.toHaveBeenCalled();
      expect(showToast).not.toHaveBeenCalled();
    });

    it('returns false and updates profile if memory is insufficient', async () => {
      (profileRepository.getProfile as jest.Mock).mockResolvedValue({ useLocalModel: true });
      mockTotalMemory = 2 * 1024 * 1024 * 1024; // 2 GB
      
      const result = await enforceLocalLlmRamGuard(false); // No notify
      
      expect(result).toBe(false);
      expect(profileRepository.updateProfile).toHaveBeenCalledWith({ useLocalModel: false });
      expect(showToast).not.toHaveBeenCalled();
    });

    it('shows toast with specific warning if notify=true and memory is insufficient', async () => {
      (profileRepository.getProfile as jest.Mock).mockResolvedValue({ useLocalModel: true });
      mockTotalMemory = 3 * 1024 * 1024 * 1024; // 3 GB
      
      await enforceLocalLlmRamGuard(true);
      
      expect(showToast).toHaveBeenCalledWith(
        'This device has 3.0 GB RAM. Guru disables on-device text AI below 4.0 GB to avoid crashes.',
        'warning'
      );
    });
  });
});
