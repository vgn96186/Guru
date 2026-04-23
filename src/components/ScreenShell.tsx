import React from 'react';
import { View, ScrollView, StyleSheet, type ViewProps, type ScrollViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { linearTheme } from '../theme/linearTheme';

export interface ScreenShellProps extends ViewProps {
  children: React.ReactNode;
  /** Whether the content should be scrollable (default: true) */
  scrollable?: boolean;
  /** Pass custom ScrollView props if scrollable is true */
  scrollViewProps?: ScrollViewProps;
  /** Whether to constrain content width on tablets (default: true) */
  responsive?: boolean;
  /** Edges to apply SafeAreaView padding to (default: ['top', 'bottom', 'left', 'right']) */
  edges?: Edge[];
  /** Optional custom background color, overrides the theme default */
  backgroundColor?: string;
  testID?: string;
}

export default function ScreenShell({
  children,
  scrollable = true,
  scrollViewProps,
  responsive = true,
  edges,
  backgroundColor,
  style,
  testID,
  ...rest
}: ScreenShellProps) {
  const content = scrollable ? (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, responsive && styles.scrollResponsive]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      {...scrollViewProps}
    >
      {responsive ? <ResponsiveContainer>{children}</ResponsiveContainer> : children}
    </ScrollView>
  ) : (
    <View style={styles.fixedContent}>
      {responsive ? <ResponsiveContainer>{children}</ResponsiveContainer> : children}
    </View>
  );

  return (
    <SafeAreaView
      edges={edges}
      style={[
        styles.safeArea,
        { backgroundColor: backgroundColor ?? linearTheme.colors.background },
        style,
      ]}
      testID={testID}
      {...rest}
    >
      {content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  scrollResponsive: {
    alignItems: 'center', // Centers the ResponsiveContainer on wide screens
  },
  fixedContent: {
    flex: 1,
    alignItems: 'center', // Centers the ResponsiveContainer on wide screens if responsive=true
    width: '100%',
  },
});
