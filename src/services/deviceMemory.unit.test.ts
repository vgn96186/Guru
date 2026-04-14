// `expo-device` is mocked in jest.setup.js via `global.__EXPO_DEVICE_TOTAL_MEMORY__`.

declare global {
  var __EXPO_DEVICE_TOTAL_MEMORY__: number | null | undefined;
}

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
    global.__EXPO_DEVICE_TOTAL_MEMORY__ = null;
  });

  describe('getTotalDeviceMemoryBytes', () => {
    it('returns null if totalMemory is null or undefined', () => {
      global.__EXPO_DEVICE_TOTAL_MEMORY__ = null;
      expect(getTotalDeviceMemoryBytes()).toBeNull();

      global.__EXPO_DEVICE_TOTAL_MEMORY__ = undefined as any;
      expect(getTotalDeviceMemoryBytes()).toBeNull();
    });

    it('returns null if totalMemory is NaN or Infinity', () => {
      global.__EXPO_DEVICE_TOTAL_MEMORY__ = NaN;
      expect(getTotalDeviceMemoryBytes()).toBeNull();

      global.__EXPO_DEVICE_TOTAL_MEMORY__ = Infinity;
      expect(getTotalDeviceMemoryBytes()).toBeNull();
    });

    it('returns null if totalMemory is <= 0', () => {
      global.__EXPO_DEVICE_TOTAL_MEMORY__ = 0;
      expect(getTotalDeviceMemoryBytes()).toBeNull();

      global.__EXPO_DEVICE_TOTAL_MEMORY__ = -1024;
      expect(getTotalDeviceMemoryBytes()).toBeNull();
    });

    it('returns the exact memory if valid', () => {
      const eightGb = 8 * 1024 * 1024 * 1024;
      global.__EXPO_DEVICE_TOTAL_MEMORY__ = eightGb;
      expect(getTotalDeviceMemoryBytes()).toBe(eightGb);
    });
  });

  describe('isLocalLlmAllowedOnThisDevice', () => {
    it('returns true when totalMemory is null (unknown memory)', () => {
      global.__EXPO_DEVICE_TOTAL_MEMORY__ = null;
      expect(isLocalLlmAllowedOnThisDevice()).toBe(true);
    });

    it('returns true when totalMemory is exactly MIN_LOCAL_LLM_RAM_BYTES', () => {
      global.__EXPO_DEVICE_TOTAL_MEMORY__ = MIN_LOCAL_LLM_RAM_BYTES;
      expect(isLocalLlmAllowedOnThisDevice()).toBe(true);
    });

    it('returns true when totalMemory is greater than MIN_LOCAL_LLM_RAM_BYTES', () => {
      global.__EXPO_DEVICE_TOTAL_MEMORY__ = MIN_LOCAL_LLM_RAM_BYTES + 1024;
      expect(isLocalLlmAllowedOnThisDevice()).toBe(true);
    });

    it('returns false when totalMemory is less than MIN_LOCAL_LLM_RAM_BYTES and > 0', () => {
      global.__EXPO_DEVICE_TOTAL_MEMORY__ = MIN_LOCAL_LLM_RAM_BYTES - 1024;
      expect(isLocalLlmAllowedOnThisDevice()).toBe(false);
    });

    it('returns true when totalMemory is <= 0 (invalid memory)', () => {
      global.__EXPO_DEVICE_TOTAL_MEMORY__ = 0;
      expect(isLocalLlmAllowedOnThisDevice()).toBe(true);

      global.__EXPO_DEVICE_TOTAL_MEMORY__ = -1;
      expect(isLocalLlmAllowedOnThisDevice()).toBe(true);
    });
  });

  describe('getLocalLlmRamWarning', () => {
    it('returns null if memory is unknown (allowed)', () => {
      global.__EXPO_DEVICE_TOTAL_MEMORY__ = null;
      expect(getLocalLlmRamWarning()).toBeNull();
    });

    it('returns null if memory is >= MIN_LOCAL_LLM_RAM_BYTES', () => {
      global.__EXPO_DEVICE_TOTAL_MEMORY__ = MIN_LOCAL_LLM_RAM_BYTES;
      expect(getLocalLlmRamWarning()).toBeNull();
    });

    it('returns formatted warning string if memory is < MIN_LOCAL_LLM_RAM_BYTES', () => {
      // 3.5 GB
      global.__EXPO_DEVICE_TOTAL_MEMORY__ = 3.5 * 1024 * 1024 * 1024;
      expect(getLocalLlmRamWarning()).toBe(
        'This device has 3.5 GB RAM. Guru disables on-device text AI below 6.0 GB for Gemma 4 to avoid crashes.',
      );
    });
  });

  describe('isLocalLlmUsable', () => {
    const validProfile = { useLocalModel: true, localModelPath: '/path/to/model' } as UserProfile;

    it('returns false if profile is null or undefined', () => {
      global.__EXPO_DEVICE_TOTAL_MEMORY__ = MIN_LOCAL_LLM_RAM_BYTES;
      expect(isLocalLlmUsable(null)).toBe(false);
      expect(isLocalLlmUsable(undefined)).toBe(false);
    });

    it('returns false if useLocalModel is false', () => {
      global.__EXPO_DEVICE_TOTAL_MEMORY__ = MIN_LOCAL_LLM_RAM_BYTES;
      expect(isLocalLlmUsable({ ...validProfile, useLocalModel: false })).toBe(false);
    });

    it('returns false if localModelPath is missing', () => {
      global.__EXPO_DEVICE_TOTAL_MEMORY__ = MIN_LOCAL_LLM_RAM_BYTES;
      expect(isLocalLlmUsable({ ...validProfile, localModelPath: undefined as any })).toBe(false);
      expect(isLocalLlmUsable({ ...validProfile, localModelPath: '' })).toBe(false);
    });

    it('returns false if device memory is too low', () => {
      global.__EXPO_DEVICE_TOTAL_MEMORY__ = MIN_LOCAL_LLM_RAM_BYTES - 1; // Disallowed
      expect(isLocalLlmUsable(validProfile)).toBe(false);
    });

    it('returns true if profile wants local, has path, and device allows it', () => {
      global.__EXPO_DEVICE_TOTAL_MEMORY__ = MIN_LOCAL_LLM_RAM_BYTES;
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
      global.__EXPO_DEVICE_TOTAL_MEMORY__ = MIN_LOCAL_LLM_RAM_BYTES;

      const result = await enforceLocalLlmRamGuard(true);

      expect(result).toBe(true);
      expect(profileRepository.updateProfile).not.toHaveBeenCalled();
      expect(showToast).not.toHaveBeenCalled();
    });

    it('returns false and updates profile if memory is insufficient', async () => {
      (profileRepository.getProfile as jest.Mock).mockResolvedValue({ useLocalModel: true });
      global.__EXPO_DEVICE_TOTAL_MEMORY__ = 2 * 1024 * 1024 * 1024; // 2 GB

      const result = await enforceLocalLlmRamGuard(false); // No notify

      expect(result).toBe(false);
      expect(profileRepository.updateProfile).toHaveBeenCalledWith({
        useLocalModel: false,
        localModelPath: null,
      });
      expect(showToast).not.toHaveBeenCalled();
    });

    it('shows toast with specific warning if notify=true and memory is insufficient', async () => {
      (profileRepository.getProfile as jest.Mock).mockResolvedValue({ useLocalModel: true });
      global.__EXPO_DEVICE_TOTAL_MEMORY__ = 3 * 1024 * 1024 * 1024; // 3 GB

      await enforceLocalLlmRamGuard(true);

      expect(showToast).toHaveBeenCalledWith(
        'This device has 3.0 GB RAM. Guru disables on-device text AI below 6.0 GB for Gemma 4 to avoid crashes.',
        'warning',
      );
    });
  });
});
