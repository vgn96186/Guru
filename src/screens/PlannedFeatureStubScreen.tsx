import React from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../components/ScreenHeader';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { linearTheme as n } from '../theme/linearTheme';
import LinearSurface from '../components/primitives/LinearSurface';

type PlannedFeatureStubScreenProps = {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export default function PlannedFeatureStubScreen({
  title,
  subtitle,
  icon,
}: PlannedFeatureStubScreenProps) {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ResponsiveContainer style={styles.flex}>
        <ScreenHeader title={title} subtitle={subtitle} />

        <LinearSurface padded={false} style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name={icon} size={28} color={n.colors.accent} />
          </View>
          <Text style={styles.eyebrow}>PLANNED FEATURE</Text>
          <Text style={styles.title}>{title} is parked here for now.</Text>
          <Text style={styles.body}>
            This is a stub entry point so the menu flow is in place. The actual experience can be
            built on top of this route later.
          </Text>
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
    color: n.colors.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  title: {
    color: n.colors.textPrimary,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
  },
  body: {
    color: n.colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },
});
