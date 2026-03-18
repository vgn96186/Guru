import { registerRootComponent } from 'expo';
import { LogBox } from 'react-native';
import * as Crypto from 'expo-crypto';

// Polyfill for Web Crypto API (required for sync and unique ID generation)
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = Crypto;
}

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
]);

registerRootComponent(App);
