import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';
import { canDrawOverlays, requestOverlayPermission } from '../../../modules/app-launcher';

export const OVERLAY_STARTUP_PROMPT_KEY = 'overlay_startup_prompt_shown_v1';

export async function maybePromptOverlayPermissionOnStartup(): Promise<void> {
  if (Platform.OS !== 'android') return;

  const hasPermission = await canDrawOverlays();
  if (hasPermission) return;

  const promptShown = await AsyncStorage.getItem(OVERLAY_STARTUP_PROMPT_KEY);
  if (promptShown === 'shown') return;

  await AsyncStorage.setItem(OVERLAY_STARTUP_PROMPT_KEY, 'shown');

  Alert.alert(
    'Enable Lecture Bubble',
    'Guru needs the "draw over other apps" permission so the lecture recording bubble can stay visible while you watch classes.',
    [
      { text: 'Later', style: 'cancel' },
      {
        text: 'Enable',
        onPress: () => {
          void requestOverlayPermission();
        },
      },
    ],
  );
}
