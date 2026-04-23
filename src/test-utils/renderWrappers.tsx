import React, { type ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Disable retries and caching for tests
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

const mockSafeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/**
 * A standard wrapper that provides the React Query, Navigation,
 * Safe Area, and Gesture Handler contexts required by most components.
 */
export function AllTheProviders({ children }: { children: React.ReactNode }) {
  const testQueryClient = createTestQueryClient();

  return (
    <QueryClientProvider client={testQueryClient}>
      <SafeAreaProvider initialMetrics={mockSafeAreaMetrics}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <BottomSheetModalProvider>
            <NavigationContainer>{children}</NavigationContainer>
          </BottomSheetModalProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

/**
 * Custom render function that wraps the UI in all standard app providers.
 * Replaces `render(ui)` from @testing-library/react-native.
 */
export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: AllTheProviders, ...options });
}

// Re-export everything from testing-library so this file can be used as a drop-in replacement
export * from '@testing-library/react-native';
