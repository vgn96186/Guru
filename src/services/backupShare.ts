import * as Sharing from 'expo-sharing';
import { showToast } from '../components/Toast';

export async function shareBackupFileOrAlert(
  filePath: string,
  options: {
    mimeType: string;
    dialogTitle: string;
    unavailableAlert?: {
      title: string;
      message: string;
    };
  },
): Promise<boolean> {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(filePath, options);
    return true;
  }

  if (options.unavailableAlert) {
    showToast({
      title: options.unavailableAlert.title,
      message: options.unavailableAlert.message,
      variant: options.unavailableAlert.title.toLowerCase() === 'error' ? 'error' : 'info',
    });
  } else {
    showToast({
      title: 'Backup saved',
      message: `File written to:\n${filePath}`,
      variant: 'success',
    });
  }
  return true;
}
