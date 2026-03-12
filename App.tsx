import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import RootNavigator from './src/navigation/RootNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';
import LoadingOrb from './src/components/LoadingOrb';
import { ToastContainer } from './src/components/Toast';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { navigationRef } from './src/navigation/navigationRef';
import { useAppInitialization } from './src/hooks/useAppInitialization';
import { useAppBootstrap } from './src/hooks/useAppBootstrap';
import linking from './src/navigation/linking';

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

function AppContent({ initialRoute }: { initialRoute: 'Tabs' | 'CheckIn' }) {
  useAppBootstrap();

  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      <RootNavigator initialRoute={initialRoute} />
      <ToastContainer />
    </NavigationContainer>
  );
}

export default function App() {
  const { isReady, initialRoute, error } = useAppInitialization();

  if (error) {
    return (
      <SafeAreaProvider>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Startup Error</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
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
        <AppContent initialRoute={initialRoute} />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0F0F14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#0F0F14',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  errorTitle: { color: '#F44336', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  errorText: { color: '#9E9E9E', fontSize: 14, textAlign: 'center' },
});
