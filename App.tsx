import React, { useState, useEffect, useLayoutEffect } from 'react';
import { View, StyleSheet, DevSettings, Text, TextInput, LogBox } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
} from '@expo-google-fonts/inter';
import RootNavigator from './src/navigation/RootNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';
import AppRecoveryScreen from './src/components/AppRecoveryScreen';
import BootTransition from './src/components/BootTransition';
import { InstallModelProgressOverlay } from './src/components/InstallModelProgressOverlay';
import { DialogHost } from './src/components/DialogHost';
import { ToastContainer } from './src/components/Toast';
import DevConsole, { installDevConsoleInterceptors } from './src/components/DevConsole';
import AppStatusBanners from './src/components/AppStatusBanners';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { enableFreeze, enableScreens } from 'react-native-screens';
import { navigationRef } from './src/navigation/navigationRef';
import { useAppInitialization } from './src/hooks/useAppInitialization';
import { useAppStore } from './src/store/useAppStore';
import { useAppBootstrap } from './src/hooks/useAppBootstrap';
import linking from './src/navigation/linking';
import { theme } from './src/constants/theme';
import { reportStartupHealth } from './src/services/startupHealth';
import { queryClient } from './src/services/queryClient';

// Install console interceptors early so all logs are captured
installDevConsoleInterceptors();
enableScreens(true);
enableFreeze(true);

const textComponent = Text as typeof Text & {
  defaultProps?: React.ComponentProps<typeof Text>;
};

const textInputComponent = TextInput as typeof TextInput & {
  defaultProps?: React.ComponentProps<typeof TextInput>;
};

const defaultInterTextStyle: NonNullable<React.ComponentProps<typeof Text>['style']> = {
  fontFamily: 'Inter_400Regular',
};

const appendDefaultTextStyle = (style: React.ComponentProps<typeof Text>['style'] | undefined) =>
  style ? [defaultInterTextStyle, style] : defaultInterTextStyle;

textComponent.defaultProps = {
  ...textComponent.defaultProps,
  ellipsizeMode: 'clip',
  style: appendDefaultTextStyle(textComponent.defaultProps?.style),
};

textInputComponent.defaultProps = {
  ...textInputComponent.defaultProps,
  style: appendDefaultTextStyle(textInputComponent.defaultProps?.style),
};

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

  useEffect(() => {
    reportStartupHealth('ui_ready', initialRoute);
  }, [initialRoute]);

  return (
    <>
      <ToastContainer />
      <DialogHost />
      <AppStatusBanners />
      <NavigationContainer
        ref={navigationRef}
        linking={linking}
        theme={{
          ...DarkTheme,
          colors: { ...DarkTheme.colors, background: '#000000', card: '#000000' },
        }}
      >
        <RootNavigator initialRoute={initialRoute} />
        <InstallModelProgressOverlay />
        <DevConsole />
      </NavigationContainer>
    </>
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
  const setBootPhase = useAppStore((s) => s.setBootPhase);

  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Inter_900Black,
  });

  const isCompletelyReady = isReady && fontsLoaded;

  // Run before paint: BootTransition sits above the navigator with zIndex 9999.
  // While bootPhase is 'booting' | 'calming', its full-screen background steals touches,
  // so CheckIn mood buttons feel dead until phase advances. Home advances calming→settling;
  // CheckIn never mounts Home, so skip the overlay entirely for CheckIn.
  useLayoutEffect(() => {
    if (!isCompletelyReady || initialRoute === null) return;
    if (initialRoute === 'CheckIn') {
      setBootPhase('done');
    } else {
      setBootPhase('calming');
    }
  }, [isCompletelyReady, initialRoute, setBootPhase]);

  if (error || fontError) {
    return (
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <KeyboardProvider>
            <BottomSheetModalProvider>
              <AppRecoveryScreen
                title="Startup error"
                message="Guru could not finish launching. Your local study data should still be safe on this device."
                detail={error || fontError?.message || 'Font loading failed'}
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
            </BottomSheetModalProvider>
          </KeyboardProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  if (!isCompletelyReady || initialRoute === null) {
    return (
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <KeyboardProvider>
            <BottomSheetModalProvider>
              <View style={styles.loadingContainer} />
              <BootTransition />
            </BottomSheetModalProvider>
          </KeyboardProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <BottomSheetModalProvider>
            <ErrorBoundary>
              <AppContent initialRoute={initialRoute} onFatalError={onFatalError} />
            </ErrorBoundary>
            <BootTransition />
          </BottomSheetModalProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
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
    reportStartupHealth('runtime_error', runtimeError);
    return (
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={styles.root}>
          <SafeAreaProvider>
            <KeyboardProvider>
              <BottomSheetModalProvider>
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
              </BottomSheetModalProvider>
            </KeyboardProvider>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AppShell
        key={appInstanceKey}
        onFatalError={setRuntimeError}
        onRetry={retryApp}
        onReload={reloadApp}
      />
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
});
