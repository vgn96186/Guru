import { registerRootComponent } from 'expo';
import { LogBox, Text, TextInput, Platform } from 'react-native';
import * as Crypto from 'expo-crypto';

// Polyfill for Web Crypto API (required for sync and unique ID generation)
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = Crypto;
}

// Fix for Android text truncation bug (missing last words)
interface ComponentWithDefaultProps extends React.ComponentClass {
  defaultProps?: any;
}
const CustomText = Text as unknown as ComponentWithDefaultProps;
if (!CustomText.defaultProps) {
  CustomText.defaultProps = {};
}
if (Platform.OS === 'android') {
  CustomText.defaultProps.textBreakStrategy = 'simple';
}
CustomText.defaultProps.includeFontPadding = false;

const CustomTextInput = TextInput as unknown as ComponentWithDefaultProps;
if (!CustomTextInput.defaultProps) {
  CustomTextInput.defaultProps = {};
}
CustomTextInput.defaultProps.includeFontPadding = false;

import App from './App';

// Catch any uncaught JS errors so the app doesn't silently crash
if (!__DEV__) {
  const originalHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    console.error('[Guru] Uncaught error:', error);
    if (originalHandler) originalHandler(error, isFatal);
  });
}

LogBox.ignoreLogs([
  'Setting a timer',
  'AsyncStorage has been extracted',
  'ProgressBarAndroid has been extracted',
  'SafeAreaView has been deprecated',
  'Clipboard has been extracted',
  'PushNotificationIOS has been extracted',
]);

registerRootComponent(App);
