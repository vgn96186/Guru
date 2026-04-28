import React, { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import Svg, { Path } from 'react-native-svg';
import LinearText from '../components/primitives/LinearText';
import { linearTheme as n } from '../theme/linearTheme';
import type { TabParamList } from './types';
import { getDeepestFocusedRouteName, isActionHubAllowedForRoute } from './tabUiVisibility';

export const TAB_ITEMS: Array<{
  name: keyof TabParamList;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconFocused: keyof typeof Ionicons.glyphMap;
  testID: string;
}> = [
  { name: 'HomeTab', label: 'Home', icon: 'home-outline', iconFocused: 'home', testID: 'tab-home' },
  {
    name: 'SyllabusTab',
    label: 'Syllabus',
    icon: 'grid-outline',
    iconFocused: 'grid',
    testID: 'tab-syllabus',
  },
  {
    name: 'ChatTab',
    label: 'Chat',
    icon: 'chatbubbles-outline',
    iconFocused: 'chatbubbles',
    testID: 'tab-chat',
  },
  { name: 'MenuTab', label: 'Menu', icon: 'menu-outline', iconFocused: 'menu', testID: 'tab-menu' },
];

const FAB_SIZE = 52;
const FAB_HITBOX_WIDTH = 84;

function TesseractGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Path
        d="M18 20h26v26H18V20Z"
        stroke={color}
        strokeOpacity={0.96}
        strokeWidth={3.6}
        strokeLinejoin="round"
      />
      <Path
        d="M26 14h26v26H26V14Z"
        stroke={color}
        strokeOpacity={0.62}
        strokeWidth={3.6}
        strokeLinejoin="round"
      />
      <Path
        d="M18 20l8-6"
        stroke={color}
        strokeOpacity={0.62}
        strokeWidth={3.6}
        strokeLinecap="round"
      />
      <Path
        d="M44 20l8-6"
        stroke={color}
        strokeOpacity={0.62}
        strokeWidth={3.6}
        strokeLinecap="round"
      />
      <Path
        d="M44 46l8-6"
        stroke={color}
        strokeOpacity={0.62}
        strokeWidth={3.6}
        strokeLinecap="round"
      />
      <Path
        d="M18 46l8-6"
        stroke={color}
        strokeOpacity={0.62}
        strokeWidth={3.6}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * Custom tab bar that replicates the bottom-tabs design + center FAB.
 * Driven by material-top-tabs state for native ViewPager transitions.
 */
export function CustomTabBar({
  tabBarProps,
  dueCount,
  isActionHubOpen,
  onToggleActionHub,
  onCloseActionHub,
  bottomInset,
}: {
  tabBarProps: MaterialTopTabBarProps;
  dueCount: number;
  isActionHubOpen: boolean;
  onToggleActionHub: () => void;
  onCloseActionHub: () => void;
  bottomInset: number;
}) {
  const { state, navigation } = tabBarProps;
  const activeLeafRouteName = useMemo(() => getDeepestFocusedRouteName(state), [state]);
  const actionHubEnabled = isActionHubAllowedForRoute(activeLeafRouteName);

  useEffect(() => {
    if (!actionHubEnabled && isActionHubOpen) {
      onCloseActionHub();
    }
  }, [actionHubEnabled, isActionHubOpen, onCloseActionHub]);

  const handleTabPress = (tabName: keyof TabParamList, isFocused: boolean) => {
    if (isFocused) {
      if (tabName === 'HomeTab') navigation.navigate('HomeTab', { screen: 'Home' });
      else if (tabName === 'SyllabusTab')
        navigation.navigate('SyllabusTab', { screen: 'Syllabus' });
      else if (tabName === 'ChatTab') navigation.navigate('ChatTab', { screen: 'GuruChat' });
      else if (tabName === 'MenuTab') navigation.navigate('MenuTab', { screen: 'MenuHome' });
    } else {
      navigation.navigate(tabName);
    }
  };

  const leftTabs = TAB_ITEMS.slice(0, 2);
  const rightTabs = TAB_ITEMS.slice(2);

  return (
    <View
      style={[
        styles.customTabBar,
        {
          paddingBottom: bottomInset + 4,
          height: 60 + bottomInset,
        },
      ]}
    >
      <View style={styles.tabsRow}>
        {leftTabs.map((tab, i) => {
          const focused = state.index === i;
          const color = focused ? n.colors.textPrimary : n.colors.textMuted;
          return (
            <Pressable
              key={tab.name}
              style={styles.tabItem}
              onPress={() => handleTabPress(tab.name, focused)}
              testID={tab.testID}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={`${tab.label} tab`}
            >
              <View>
                <Ionicons name={focused ? tab.iconFocused : tab.icon} size={24} color={color} />
                {tab.name === 'SyllabusTab' && dueCount > 0 && (
                  <View style={styles.badge}>
                    <LinearText variant="caption" style={styles.badgeText}>
                      {dueCount > 99 ? '99+' : dueCount}
                    </LinearText>
                  </View>
                )}
              </View>
              <LinearText variant="caption" style={[styles.tabLabel, { color }]}>
                {tab.label}
              </LinearText>
            </Pressable>
          );
        })}

        <Pressable
          style={({ pressed }) => [
            styles.tabItem,
            pressed && actionHubEnabled && styles.actionPressed,
          ]}
          onPress={actionHubEnabled ? onToggleActionHub : undefined}
          disabled={!actionHubEnabled}
          testID="action-hub-toggle"
          accessibilityRole="button"
          accessibilityLabel={actionHubEnabled ? 'Open action hub' : 'Action hub unavailable here'}
          accessibilityHint={
            actionHubEnabled
              ? 'Opens the quick actions sheet'
              : 'Return to a main tab screen to use quick actions'
          }
          accessibilityState={{ disabled: !actionHubEnabled }}
          hitSlop={{ top: 18, bottom: 8, left: 10, right: 10 }}
        >
          <View style={[styles.fabSlot, !actionHubEnabled && styles.fabSlotDisabled]}>
            <View
              style={[
                styles.fabButton,
                isActionHubOpen && styles.fabButtonOpen,
                !actionHubEnabled && styles.fabButtonDisabled,
              ]}
            >
              {isActionHubOpen ? (
                <Ionicons
                  name="close"
                  size={30}
                  color={actionHubEnabled ? n.colors.roles.brand : n.colors.textMuted}
                />
              ) : (
                <TesseractGlyph
                  size={32}
                  color={actionHubEnabled ? n.colors.roles.brand : n.colors.textMuted}
                />
              )}
            </View>
            <LinearText
              variant="caption"
              style={[styles.fabLabel, !actionHubEnabled && styles.fabLabelDisabled]}
            >
              Actions
            </LinearText>
          </View>
        </Pressable>

        {rightTabs.map((tab, i) => {
          const stateIndex = i + leftTabs.length;
          const focused = state.index === stateIndex;
          const color = focused ? n.colors.textPrimary : n.colors.textMuted;
          return (
            <Pressable
              key={tab.name}
              style={styles.tabItem}
              onPress={() => handleTabPress(tab.name, focused)}
              testID={tab.testID}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={`${tab.label} tab`}
            >
              <View>
                <Ionicons name={focused ? tab.iconFocused : tab.icon} size={24} color={color} />
              </View>
              <LinearText variant="caption" style={[styles.tabLabel, { color }]}>
                {tab.label}
              </LinearText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fabSlot: {
    width: FAB_HITBOX_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabSlotDisabled: {
    opacity: 0.45,
  },
  fabButton: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: 18,
    backgroundColor: n.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    transform: [{ translateY: -12 }],
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  fabButtonOpen: {
    borderColor: 'rgba(94, 106, 210, 0.28)',
  },
  fabButtonDisabled: {
    opacity: 0.72,
  },
  fabLabel: {
    ...n.typography.meta,
    color: n.colors.roles.brand,
    fontSize: 10,
    marginTop: 4,
    letterSpacing: 0,
  },
  fabLabelDisabled: {
    color: n.colors.textMuted,
  },
  customTabBar: {
    flexDirection: 'row',
    backgroundColor: n.colors.background,
    borderTopColor: n.colors.borderHighlight,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 0,
    elevation: 0,
    alignItems: 'center',
    position: 'relative',
  },
  tabsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabItem: {
    flexGrow: 1,
    flexBasis: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
  },
  tabLabel: {
    ...n.typography.caption,
    fontSize: 10,
    marginTop: 4,
    letterSpacing: 0,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: n.colors.error,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: n.colors.textPrimary,
    fontSize: 10,
    fontWeight: '700',
  },
  actionPressed: {
    opacity: n.alpha.pressed,
    transform: [{ scale: 0.98 }],
  },
});
