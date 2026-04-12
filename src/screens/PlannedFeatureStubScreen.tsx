import React from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import LinearText from '../components/primitives/LinearText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { linearTheme as n } from '../theme/linearTheme';
import LinearSurface from '../components/primitives/LinearSurface';

type PlannedFeatureStubScreenProps = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export default function PlannedFeatureStubScreen({ title, icon }: PlannedFeatureStubScreenProps) {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ResponsiveContainer style={styles.flex}>
        <ScreenHeader title={title} showSettings />

        <LinearSurface padded={false} style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name={icon} size={28} color={n.colors.accent} />
          </View>
          <LinearText variant="meta" tone="accent" style={styles.eyebrow}>
            PLANNED FEATURE
          </LinearText>
          <LinearText variant="title" style={styles.title}>
            {title} is parked here for now.
          </LinearText>
          <LinearText variant="bodySmall" tone="secondary" style={styles.body}>
            This is a stub entry point so the menu flow is in place. The actual experience can be
            built on top of this route later.
          </LinearText>
        </LinearSurface>
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: n.colors.background,
  },
  flex: {
    flex: 1,
  },
  card: {
    marginHorizontal: 16,
    padding: 20,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: `${n.colors.accent}1A`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  eyebrow: {
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  title: {
    fontWeight: '900',
    lineHeight: 28,
  },
  body: {
    lineHeight: 21,
    marginTop: 12,
  },
});
