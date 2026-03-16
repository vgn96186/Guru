import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../constants/theme';

const Updates = (() => {
  try {
    return require('expo-updates') as { reloadAsync: () => Promise<void> };
  } catch {
    return null;
  }
})();

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends React.Component<React.PropsWithChildren<{}>, State> {
  constructor(props: React.PropsWithChildren<{}>) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // In a real app, you'd log this to an error reporting service like Sentry
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const canReload = !!Updates?.reloadAsync;
      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>💥</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.sub}>
            A critical error occurred. {canReload ? 'Please restart the app.' : 'The view has been reset.'}
            If this keeps happening, try clearing app data.
          </Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => {
              this.setState({ hasError: false });
              if (canReload) {
                try {
                  void Updates.reloadAsync();
                } catch {
                  // Fallback to state reset
                }
              }
            }}
          >
            <Text style={styles.retryText}>{canReload ? 'Reload App' : 'Reset View'}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 24,
  },
  title: {
    color: theme.colors.error,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
  },
  sub: {
    color: theme.colors.textMuted,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  retryBtn: {
    marginTop: 24,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
});
