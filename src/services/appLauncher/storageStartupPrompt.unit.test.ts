import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  __resetStorageStartupPromptForTests,
  maybeHandleStorageAccessOnStartup,
  STORAGE_MODEL_TOAST_KEY,
  STORAGE_STARTUP_PROMPT_KEY,
} from './storageStartupPrompt';
import {
  findLocalModelFiles,
  hasAllFilesAccess,
  requestAllFilesAccess,
} from '../../../modules/app-launcher';
import { showToast } from '../../components/Toast';
import { showDialog } from '../../components/dialogService';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('../../../modules/app-launcher', () => ({
  findLocalModelFiles: jest.fn(),
  hasAllFilesAccess: jest.fn(),
  requestAllFilesAccess: jest.fn(),
}));

jest.mock('../../components/Toast', () => ({
  showToast: jest.fn(),
}));

jest.mock('../../components/dialogService', () => ({
  showDialog: jest.fn(),
}));

describe('storageStartupPrompt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetStorageStartupPromptForTests();
    (Platform as any).OS = 'android';
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    (hasAllFilesAccess as jest.Mock).mockResolvedValue(false);
    (findLocalModelFiles as jest.Mock).mockResolvedValue([]);
    (requestAllFilesAccess as jest.Mock).mockResolvedValue(true);
    (showDialog as jest.Mock).mockResolvedValue('later');
  });

  it('prompts once when storage access is missing', async () => {
    await maybeHandleStorageAccessOnStartup();

    expect(showDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Allow Model Import',
        variant: 'focus',
      }),
    );
  });

  it('does not prompt twice in the same session when access is still missing', async () => {
    await maybeHandleStorageAccessOnStartup();
    await maybeHandleStorageAccessOnStartup();

    expect(showDialog).toHaveBeenCalledTimes(1);
  });

  it('opens settings when the user taps Allow', async () => {
    (showDialog as jest.Mock).mockResolvedValue('allow');

    await maybeHandleStorageAccessOnStartup();

    expect(requestAllFilesAccess).toHaveBeenCalledTimes(1);
  });

  it('shows a toast once when storage access exists and model files are found', async () => {
    (hasAllFilesAccess as jest.Mock).mockResolvedValue(true);
    (findLocalModelFiles as jest.Mock).mockResolvedValue([
      { path: '/storage/emulated/0/Download/gemma-4-E4B-it.litertlm' },
    ]);

    await maybeHandleStorageAccessOnStartup();

    expect(AsyncStorage.getItem).toHaveBeenCalledWith(STORAGE_MODEL_TOAST_KEY);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      STORAGE_MODEL_TOAST_KEY,
      '/storage/emulated/0/Download/gemma-4-E4B-it.litertlm',
    );
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'On-device AI found',
      }),
    );
  });

  it('does not repeat the same model-import toast', async () => {
    (hasAllFilesAccess as jest.Mock).mockResolvedValue(true);
    (findLocalModelFiles as jest.Mock).mockResolvedValue([
      { path: '/storage/emulated/0/Download/gemma-4-E4B-it.litertlm' },
    ]);
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
      key === STORAGE_MODEL_TOAST_KEY
        ? '/storage/emulated/0/Download/gemma-4-E4B-it.litertlm'
        : null,
    );

    await maybeHandleStorageAccessOnStartup();

    expect(showToast).not.toHaveBeenCalled();
  });
});
