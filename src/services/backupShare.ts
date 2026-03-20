import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

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
    Alert.alert(options.unavailableAlert.title, options.unavailableAlert.message);
  } else {
    Alert.alert('Backup saved', `File written to:\n${filePath}`);
  }
  return true;
}
