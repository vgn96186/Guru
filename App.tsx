import React, { useState } from 'react';
import { View, StyleSheet, DevSettings } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import RootNavigator from './src/navigation/RootNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';
import AppRecoveryScreen from './src/components/AppRecoveryScreen';
import LoadingOrb from './src/components/LoadingOrb';
import { InstallModelProgressOverlay } from './src/components/InstallModelProgressOverlay';
import { ToastContainer } from './src/components/Toast';
import DevConsole, { installDevConsoleInterceptors } from './src/components/DevConsole';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { enableFreeze, enableScreens } from 'react-native-screens';
import { navigationRef } from './src/navigation/navigationRef';
import { useAppInitialization } from './src/hooks/useAppInitialization';
import { useAppBootstrap } from './src/hooks/useAppBootstrap';
import linking from './src/navigation/linking';
import { theme } from './src/constants/theme';

// Install console interceptors early so all logs are captured
installDevConsoleInterceptors();
enableScreens(true);
enableFreeze(true);

export { navigationRef };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function AppContent({
  initialRoute,
  onFatalError,
}: {
  initialRoute: 'Tabs' | 'CheckIn';
  onFatalError: (message: string) => void;
}) {
  useAppBootstrap(onFatalError);

  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      <RootNavigator initialRoute={initialRoute} />
      <InstallModelProgressOverlay />
      <ToastContainer />
      <DevConsole />
    </NavigationContainer>
  );
}

function AppShell({
  onFatalError,
  onRetry,
  onReload,
}: {
  onFatalError: (message: string) => void;
  onRetry: () => void;
  onReload: () => void;
}) {
  const { isReady, initialRoute, error } = useAppInitialization();

  if (error) {
    return (
      <SafeAreaProvider>
        <AppRecoveryScreen
          title="Startup error"
          message="Guru could not finish launching. Your local study data should still be safe on this device."
          detail={error}
          statusLabel="Startup recovery"
          primaryLabel="Reload App"
          primaryAccessibilityLabel="Reload app"
          onPrimary={onReload}
          secondaryLabel="Try Launch Again"
          secondaryAccessibilityLabel="Retry startup"
          onSecondary={onRetry}
          tips={[
            'Reload the app for a clean restart, or retry launch without leaving the app.',
            'If this keeps happening, the failure is likely in startup setup rather than your saved notes or progress.',
          ]}
        />
      </SafeAreaProvider>
    );
  }

  if (!isReady || initialRoute === null) {
    return (
      <SafeAreaProvider>
        <View style={styles.loadingContainer}>
          <LoadingOrb message="Guru is waking up..." />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <AppContent initialRoute={initialRoute} onFatalError={onFatalError} />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

export default function App() {
  const [appInstanceKey, setAppInstanceKey] = useState(0);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  const retryApp = () => {
    setRuntimeError(null);
    setAppInstanceKey((current) => current + 1);
  };

  const reloadApp = () => {
    try {
      // `expo-updates` is optional in this project; fall back to DevSettings in dev.
      const dynamicRequire = globalThis.eval?.('require') as
        | ((id: string) => { reloadAsync?: () => Promise<void> })
        | undefined;
      const updatesModule = dynamicRequire?.('expo-updates');
      if (updatesModule?.reloadAsync) {
        void updatesModule.reloadAsync();
        return;
      }
      if (__DEV__) {
        DevSettings.reload();
        return;
      }
      retryApp();
    } catch {
      retryApp();
    }
  };

  if (runtimeError) {
    return (
      <SafeAreaProvider>
        <AppRecoveryScreen
          title="Something went wrong"
          message="Guru hit a startup task failure outside the render tree, so the usual crash boundary could not show first."
          detail={runtimeError}
          statusLabel="App recovery"
          primaryLabel="Reload App"
          primaryAccessibilityLabel="Reload app"
          onPrimary={reloadApp}
          secondaryLabel="Try App Again"
          secondaryAccessibilityLabel="Retry app"
          onSecondary={retryApp}
          tips={[
            'Reload the app for a clean restart, or remount the app once without leaving this screen.',
            'This path now surfaces async startup failures instead of letting them disappear as silent crashes.',
          ]}
        />
      </SafeAreaProvider>
    );
  }

  return (
    <AppShell
      key={appInstanceKey}
      onFatalError={setRuntimeError}
      onRetry={retryApp}
      onReload={reloadApp}
    />
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
