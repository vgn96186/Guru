import React from 'react';
import { View, StyleSheet } from 'react-native';
import AppRecoveryScreen from './AppRecoveryScreen';

const Updates = (() => {
  try {
    return require('expo-updates') as { reloadAsync: () => Promise<void> };
  } catch {
    return null;
  }
})();

interface State {
  hasError: boolean;
  remountKey: number;
  errorMessage: string | null;
}

export default class ErrorBoundary extends React.Component<React.PropsWithChildren<{}>, State> {
  constructor(props: React.PropsWithChildren<{}>) {
    super(props);
    this.state = { hasError: false, remountKey: 0, errorMessage: null };
  }

  static getDerivedStateFromError(_error: Error): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error', error, errorInfo);
    this.setState({ errorMessage: error.message || 'Unknown rendering error' });
  }

  private resetBoundary = () => {
    this.setState({ hasError: false, remountKey: Date.now(), errorMessage: null });
  };

  private handleReload = () => {
    try {
      void Updates?.reloadAsync();
    } catch {
      this.resetBoundary();
    }
  };

  render() {
    if (this.state.hasError) {
      const canReload = !!Updates?.reloadAsync;
      const errorPreview = this.state.errorMessage?.trim();

      return (
        <View style={styles.container}>
          <AppRecoveryScreen
            title="Something went wrong"
            message="Guru hit an unexpected crash, but your progress, notes, and streak data are still safe on this device."
            detail={errorPreview}
            primaryLabel={canReload ? 'Reload App' : 'Reset View'}
            primaryAccessibilityLabel={canReload ? 'Reload app' : 'Reset view'}
            onPrimary={canReload ? this.handleReload : this.resetBoundary}
            secondaryLabel={canReload ? 'Try This Screen Again' : undefined}
            secondaryAccessibilityLabel="Reset view"
            onSecondary={canReload ? this.resetBoundary : undefined}
            tips={[
              canReload
                ? 'Reload the app for a clean restart, or retry only this view first.'
                : 'Reset this view to remount the broken screen and try again.',
              'If this keeps happening, reopen Guru and avoid the last action.',
            ]}
          />
        </View>
      );
    }

    return (
      <View key={this.state.remountKey} style={styles.childWrap}>
        {this.props.children}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  childWrap: { flex: 1 },
  container: { flex: 1 },
});
