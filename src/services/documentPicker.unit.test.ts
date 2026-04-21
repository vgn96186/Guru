import * as DocumentPicker from 'expo-document-picker';
import {
  pickDocumentOnce,
  pickLocalModelDocument,
  __resetDocumentPickerLockForTests,
} from './documentPicker';

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

describe('documentPicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetDocumentPickerLockForTests();
  });

  it('rejects overlapping document picker requests with a friendly error', async () => {
    let resolveFirst!: (value: DocumentPicker.DocumentPickerResult) => void;
    (DocumentPicker.getDocumentAsync as jest.Mock).mockImplementationOnce(
      () =>
        new Promise<DocumentPicker.DocumentPickerResult>((resolve) => {
          resolveFirst = resolve;
        }),
    );

    const firstPick = pickDocumentOnce({ type: '*/*' });
    const secondPick = pickDocumentOnce({ type: '*/*' });

    await expect(secondPick).rejects.toThrow(
      'Another document picker is already open. Please finish that selection first.',
    );

    resolveFirst({ canceled: true, assets: null as never });
    await expect(firstPick).resolves.toEqual({ canceled: true, assets: null });
    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledTimes(1);
  });

  it('releases the picker lock after the active request completes', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock)
      .mockResolvedValueOnce({ canceled: true, assets: null })
      .mockResolvedValueOnce({ canceled: true, assets: null });

    await expect(pickDocumentOnce({ type: '*/*' })).resolves.toEqual({
      canceled: true,
      assets: null,
    });
    await expect(pickDocumentOnce({ type: '*/*' })).resolves.toEqual({
      canceled: true,
      assets: null,
    });

    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledTimes(2);
  });

  it('uses direct file access for local model imports to avoid an extra cache copy', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: true,
      assets: null,
    });

    await pickLocalModelDocument();

    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith({
      type: '*/*',
      copyToCacheDirectory: false,
    });
  });
});
