import React, { useEffect, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import LinearText from '../components/primitives/LinearText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MenuStackParamList, TabParamList } from '../navigation/types';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { linearTheme as n } from '../theme/linearTheme';
import ScreenHeader from '../components/ScreenHeader';
import LinearSurface from '../components/primitives/LinearSurface';

type Nav = NativeStackNavigationProp<MenuStackParamList, 'MenuHome'>;

const PRIMARY_DESTINATIONS: Array<{
  route: keyof Omit<MenuStackParamList, 'MenuHome'>;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
}> = [
  { route: 'StudyPlan', title: 'Study Plan', icon: 'calendar-outline', tint: n.colors.accent },
  { route: 'Stats', title: 'Stats', icon: 'bar-chart-outline', tint: n.colors.warning },
  { route: 'Flashcards', title: 'Flashcards', icon: 'albums-outline', tint: n.colors.accent },
  { route: 'ImageVault', title: 'Image Vault', icon: 'images-outline', tint: '#FFD166' },
  { route: 'NotesVault', title: 'Notes Vault', icon: 'library-outline', tint: '#7ED6A7' },
  {
    route: 'TranscriptVault',
    title: 'Transcript Vault',
    icon: 'document-text-outline',
    tint: '#64B5F6',
  },
  { route: 'RecordingVault', title: 'Recording Vault', icon: 'mic-outline', tint: '#FF7043' },
  { route: 'QuestionBank', title: 'Question Bank', icon: 'help-circle-outline', tint: '#E040FB' },
  { route: 'NotesHub', title: 'Notes Hub', icon: 'create-outline', tint: n.colors.accent },
  { route: 'NotesSearch', title: 'Notes Search', icon: 'search-outline', tint: '#7ED6A7' },
  { route: 'ManualNoteCreation', title: 'Manual Note', icon: 'pencil-outline', tint: '#FF7043' },
  {
    route: 'TranscriptHistory',
    title: 'Transcript History',
    icon: 'time-outline',
    tint: '#64B5F6',
  },
  {
    route: 'FlaggedContent',
    title: 'Flagged Content',
    icon: 'flag-outline',
    tint: n.colors.warning,
  },
  { route: 'DeviceLink', title: 'Device Link', icon: 'link-outline', tint: '#4FC3F7' },
];

const TABLET_BREAKPOINT = 600;

export default function MenuScreen() {
  const navigation = useNavigation<Nav>();
  const tabsNavigation = navigation.getParent<NavigationProp<TabParamList>>();
  const [isTablet, setIsTablet] = useState(() => {
    const { width, height } = Dimensions.get('window');
    return Math.min(width, height) >= TABLET_BREAKPOINT;
  });

  useEffect(() => {
    const updateDimensions = () => {
      const { width, height } = Dimensions.get('window');
      setIsTablet(Math.min(width, height) >= TABLET_BREAKPOINT);
    };
    const subscription = Dimensions.addEventListener('change', updateDimensions);
    return () => subscription?.remove();
  }, []);

  return (
    <SafeAreaView style={styles.safe} testID="menu-screen">
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ResponsiveContainer style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ScreenHeader
            title="Menu"
            showBack
            onBackPress={() => tabsNavigation?.navigate('HomeTab')}
            showSettings
          />

          <View style={styles.destinations}>
            <LinearText variant="meta" tone="muted" style={styles.destinationsLabel}>
              DESTINATIONS
            </LinearText>
            <View style={[styles.grid, isTablet && styles.gridTwoColumn]}>
              {PRIMARY_DESTINATIONS.map((item) => (
                <Pressable
                  key={item.route}
                  style={({ pressed }) => [
                    pressed && styles.cardPressed,
                    isTablet && styles.gridItem,
                  ]}
                  android_ripple={{ color: `${item.tint}22` }}
                  onPress={() => navigation.navigate(item.route as never)}
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
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
    gap: n.spacing.md,
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
  gridTwoColumn: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridItem: {
    width: '49%',
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
  chevronWrap: {
    alignSelf: 'center',
    paddingLeft: 4,
  },
});
