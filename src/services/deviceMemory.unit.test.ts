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
jest.mock('../db/repositories', () => ({
  profileRepository: {
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
  },
}));

jest.mock('../components/Toast', () => ({
  showToast: jest.fn(),
}));

import { isLocalLlmAllowedOnThisDevice, MIN_LOCAL_LLM_RAM_BYTES } from './deviceMemory';

describe('isLocalLlmAllowedOnThisDevice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTotalMemory = null;
  });

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
