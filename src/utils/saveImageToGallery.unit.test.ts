import { saveImageToDeviceGallery } from './saveImageToGallery';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  downloadAsync: jest.fn(),
}));

jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn(),
  saveToLibraryAsync: jest.fn(),
}));

describe('saveImageToDeviceGallery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (MediaLibrary.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (MediaLibrary.saveToLibraryAsync as jest.Mock).mockResolvedValue(undefined);
  });

  it('saves local file URI directly', async () => {
    const uri = 'file:///data/user/0/x/image.png';
    await saveImageToDeviceGallery(uri);
    expect(MediaLibrary.saveToLibraryAsync).toHaveBeenCalledWith(uri);
    expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
  });

  it('downloads https URIs then saves', async () => {
    (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({
      uri: 'file:///cache/guru_save_1.png',
    });
    await saveImageToDeviceGallery('https://example.com/a.png');
    expect(FileSystem.downloadAsync).toHaveBeenCalled();
    expect(MediaLibrary.saveToLibraryAsync).toHaveBeenCalledWith('file:///cache/guru_save_1.png');
  });

  it('throws when permission denied', async () => {
    (MediaLibrary.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    await expect(saveImageToDeviceGallery('file:///x.png')).rejects.toThrow(/permission/i);
  });
});
