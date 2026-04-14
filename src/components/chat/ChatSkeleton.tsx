import React from 'react';
import { StyleSheet, View } from 'react-native';
import { linearTheme as n } from '../../theme/linearTheme';

export function ChatSkeleton() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerBar} />
        <View style={styles.headerBarSmall} />
      </View>
      <View style={styles.body}>
        <View style={styles.bubble} />
        <View style={[styles.bubble, styles.bubbleRight]} />
        <View style={styles.bubble} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: n.colors.background },
  header: { paddingHorizontal: 16, paddingTop: 16, gap: 6 },
  headerBar: {
    width: '40%',
    height: 12,
    borderRadius: 4,
    backgroundColor: n.colors.border,
    opacity: 0.5,
  },
  headerBarSmall: {
    width: '25%',
    height: 8,
    borderRadius: 3,
    backgroundColor: n.colors.border,
    opacity: 0.3,
  },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 32, gap: 16 },
  bubble: {
    width: '65%',
    height: 48,
    borderRadius: 12,
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.border,
    opacity: 0.5,
  },
  bubbleRight: { alignSelf: 'flex-end', width: '50%', height: 32 },
});
