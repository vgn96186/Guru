import * as DocumentPicker from 'expo-document-picker';

let activePickPromise: Promise<DocumentPicker.DocumentPickerResult> | null = null;

function createPickerBusyError(): Error {
  return new Error('Another document picker is already open. Please finish that selection first.');
}

export async function pickDocumentOnce(
  options: DocumentPicker.DocumentPickerOptions,
): Promise<DocumentPicker.DocumentPickerResult> {
  if (activePickPromise) {
    throw createPickerBusyError();
  }

  activePickPromise = DocumentPicker.getDocumentAsync(options);
  try {
    return await activePickPromise;
  } finally {
    activePickPromise = null;
  }
}

export function pickLocalModelDocument(): Promise<DocumentPicker.DocumentPickerResult> {
  return pickDocumentOnce({
    type: '*/*',
    copyToCacheDirectory: false,
  });
}

export function __resetDocumentPickerLockForTests() {
  activePickPromise = null;
}
