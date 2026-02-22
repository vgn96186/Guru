import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Alert } from 'react-native';

const DB_NAME = 'study_guru.db';
const DB_DIR = `${FileSystem.documentDirectory}SQLite`;
const DB_PATH = `${DB_DIR}/${DB_NAME}`;

export async function exportDatabase() {
  try {
    const fileExists = await FileSystem.getInfoAsync(DB_PATH);
    if (!fileExists.exists) {
      Alert.alert('Error', 'Database file not found.');
      return;
    }
    
    // Copy to a temporary file with a readable name
    const tempPath = `${FileSystem.cacheDirectory}neet_study_backup_${new Date().toISOString().slice(0,10)}.db`;
    await FileSystem.copyAsync({ from: DB_PATH, to: tempPath });
    
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(tempPath, {
        mimeType: 'application/octet-stream',
        dialogTitle: 'Export Backup'
      });
    } else {
      Alert.alert('Error', 'Sharing is not available on this device');
    }
  } catch (e) {
    console.error('Backup error', e);
    Alert.alert('Error', 'Failed to export backup.');
  }
}

export async function importDatabase() {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      type: '*/*'
    });
    
    if (result.canceled) return;
    
    const asset = result.assets[0];
    
    // Verify it looks like a DB file
    if (!asset.name.endsWith('.db') && !asset.name.includes('backup')) {
      Alert.alert('Warning', 'This does not look like a backup database file.');
      return;
    }
    
    // Ensure SQLite dir exists
    const dirInfo = await FileSystem.getInfoAsync(DB_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(DB_DIR, { intermediates: true });
    }
    
    // Replace DB
    await FileSystem.copyAsync({ from: asset.uri, to: DB_PATH });
    Alert.alert('Success', 'Backup restored successfully! Please restart the app.', [
      { text: 'OK' }
    ]);
  } catch (e) {
    console.error('Import error', e);
    Alert.alert('Error', 'Failed to import backup.');
  }
}
