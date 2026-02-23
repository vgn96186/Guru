import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

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
      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>💥</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.sub}>
            A critical error occurred. Please restart the app.
            If this keeps happening, try clearing app data or restoring from a backup.
          </Text>
          {/* In a real app, you might have a "Reload App" button here */}
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F14',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 24,
  },
  title: {
    color: '#F44336',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
  },
  sub: {
    color: '#9E9E9E',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
});
