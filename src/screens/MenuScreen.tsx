import React from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import LinearText from '../components/primitives/LinearText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MenuStackParamList, TabParamList } from '../navigation/types';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { linearTheme as n } from '../theme/linearTheme';
import BannerIconButton from '../components/BannerIconButton';
import ScreenHeader from '../components/ScreenHeader';
import LinearSurface from '../components/primitives/LinearSurface';

type Nav = NativeStackNavigationProp<MenuStackParamList, 'MenuHome'>;

const PRIMARY_DESTINATIONS: Array<{
  route: keyof Omit<MenuStackParamList, 'MenuHome'>;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
}> = [
  {
    route: 'StudyPlan',
    title: 'Study Plan',
    subtitle: 'Daily agenda, buckets, and next best moves.',
    icon: 'calendar-outline',
    tint: n.colors.accent,
  },
  {
    route: 'Stats',
    title: 'Stats',
    subtitle: 'Progress, streaks, and weekly momentum.',
    icon: 'bar-chart-outline',
    tint: n.colors.warning,
  },
  {
    route: 'Flashcards',
    title: 'Flashcards',
    subtitle: 'Spaced repetition: High-yield recall for due topics.',
    icon: 'albums-outline',
    tint: n.colors.accent,
  },
  {
    route: 'MindMap',
    title: 'Mind Map',
    subtitle: 'Stub route for your future visual concept graph.',
    icon: 'git-network-outline',
    tint: '#4FC3F7',
  },
  {
    route: 'ImageVault',
    title: 'Image Vault',
    subtitle: 'All AI-generated diagrams, charts, and visual aids.',
    icon: 'images-outline',
    tint: '#FFD166',
  },
  {
    route: 'NotesVault',
    title: 'Notes Vault',
    subtitle: 'Clean AI study notes — processed and ready to review.',
    icon: 'library-outline',
    tint: '#7ED6A7',
  },
  {
    route: 'TranscriptVault',
    title: 'Transcript Vault',
    subtitle: 'Backed-up transcript files from Documents/Guru.',
    icon: 'document-text-outline',
    tint: '#64B5F6',
  },
  {
    route: 'RecordingVault',
    title: 'Recording Vault',
    subtitle: 'Browse lecture audio files and re-process them.',
    icon: 'mic-outline',
    tint: '#FF7043',
  },
  {
    route: 'QuestionBank',
    title: 'Question Bank',
    subtitle: 'All your MCQs — practice, review, and master.',
    icon: 'help-circle-outline',
    tint: '#E040FB',
  },
];

export default function MenuScreen() {
  const navigation = useNavigation<Nav>();
  const tabsNavigation = navigation.getParent<NavigationProp<TabParamList>>();
  const destinationCount = PRIMARY_DESTINATIONS.length;

  return (
    <SafeAreaView style={styles.safe} testID="menu-screen">
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ResponsiveContainer style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ScreenHeader
            title="Menu"
            subtitle="Use this hub for planning, stats, notes, and deeper configuration. Fast actions live in the center Action Hub."
            showBack
            onBackPress={() => tabsNavigation?.navigate('HomeTab')}
            rightElement={
              <BannerIconButton
                onPress={() => navigation.navigate('Settings' as never)}
                accessibilityRole="button"
                accessibilityLabel="Open settings"
              >
                <Ionicons name="settings-sharp" size={18} color={n.colors.textSecondary} />
              </BannerIconButton>
            }
          />

          <LinearSurface compact style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryCopy}>
                <LinearText variant="meta" tone="accent" style={styles.summaryEyebrow}>
                  ROUTE MAP
                </LinearText>
                <LinearText variant="sectionTitle" style={styles.summaryTitle}>
                  {destinationCount} focused destinations
                </LinearText>
                <LinearText variant="bodySmall" tone="secondary" style={styles.summaryText}>
                  Planning, vaults, practice, and setup now live in one calmer navigation hub.
                </LinearText>
              </View>
              <View style={styles.summaryPill}>
                <LinearText variant="chip" tone="accent">
                  Fast access
                </LinearText>
              </View>
            </View>
          </LinearSurface>

          <View style={styles.destinations}>
            <LinearText variant="meta" tone="muted" style={styles.destinationsLabel}>
              DESTINATIONS
            </LinearText>
            <View style={styles.grid}>
              {PRIMARY_DESTINATIONS.map((item) => (
                <Pressable
                  key={item.route}
                  style={({ pressed }) => [pressed && styles.cardPressed]}
                  android_ripple={{ color: `${item.tint}22` }}
                  onPress={() => navigation.navigate(item.route as never)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}. ${item.subtitle}`}
                >
                  <LinearSurface compact padded={false} style={styles.listItemSurface}>
                    <View style={styles.listItem}>
                      <View
                        style={[
                          styles.listIconWrap,
                          { backgroundColor: `${item.tint}18`, borderColor: `${item.tint}55` },
                        ]}
                      >
                        <Ionicons name={item.icon} size={22} color={item.tint} />
                      </View>
                      <View style={styles.listTextContent}>
                        <LinearText variant="label" style={styles.listTitle}>
                          {item.title}
                        </LinearText>
                        <LinearText
                          variant="bodySmall"
                          tone="secondary"
                          style={styles.listSubtitle}
                        >
                          {item.subtitle}
                        </LinearText>
                      </View>
                      <View style={styles.chevronWrap}>
                        <Ionicons name="chevron-forward" size={18} color={n.colors.textMuted} />
                      </View>
                    </View>
                  </LinearSurface>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>
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
  content: {
    paddingHorizontal: n.spacing.md,
    paddingTop: n.spacing.sm,
    paddingBottom: 56,
    gap: n.spacing.lg,
  },
  summaryCard: {
    borderColor: n.colors.borderHighlight,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: n.spacing.md,
  },
  summaryCopy: {
    flex: 1,
    gap: 4,
  },
  summaryEyebrow: {
    letterSpacing: 1.2,
  },
  summaryTitle: {
    color: n.colors.textPrimary,
  },
  summaryText: {
    lineHeight: 20,
  },
  summaryPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: n.spacing.sm,
    paddingVertical: n.spacing.xs,
    borderRadius: n.radius.full,
    backgroundColor: n.colors.primaryTintSoft,
    borderWidth: 1,
    borderColor: `${n.colors.accent}44`,
  },
  destinations: {
    gap: n.spacing.sm,
  },
  destinationsLabel: {
    letterSpacing: 1.4,
    paddingHorizontal: 2,
  },
  grid: {
    gap: n.spacing.sm,
  },
  cardPressed: {
    opacity: n.alpha.pressed,
  },
  listItemSurface: {
    borderColor: n.colors.border,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  listIconWrap: {
    width: 42,
    height: 42,
    borderRadius: n.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  listTextContent: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  listTitle: {
    color: n.colors.textPrimary,
  },
  listSubtitle: {
    lineHeight: 19,
  },
  chevronWrap: {
    alignSelf: 'center',
    paddingLeft: 4,
  },
});
