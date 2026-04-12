import React, { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
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

  const leftTabs = TAB_ITEMS.slice(0, 2);
  const rightTabs = TAB_ITEMS.slice(2);

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
      {leftTabs.map((tab, i) => {
        const focused = state.index === i;
        const color = focused ? n.colors.textPrimary : n.colors.textMuted;
        return (
          <Pressable
            key={tab.name}
            style={styles.tabItem}
            onPress={() => navigation.navigate(tab.name)}
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
          styles.fabSlot,
          !actionHubEnabled && styles.fabSlotDisabled,
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
      >
        <View style={styles.fabButton}>
          <Ionicons
            name={isActionHubOpen ? 'close' : 'add'}
            size={26}
            color={actionHubEnabled ? n.colors.textPrimary : n.colors.textMuted}
          />
        </View>
        <LinearText
          variant="caption"
          style={[styles.fabLabel, !actionHubEnabled && styles.fabLabelDisabled]}
        >
          Actions
        </LinearText>
      </Pressable>

      {rightTabs.map((tab, i) => {
        const tabIndex = i + 2;
        const focused = state.index === tabIndex;
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
            <Ionicons name={focused ? tab.iconFocused : tab.icon} size={24} color={color} />
            <LinearText variant="caption" style={[styles.tabLabel, { color }]}>
              {tab.label}
            </LinearText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabSlotDisabled: {
    opacity: 0.45,
  },
  fabButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: n.colors.surfaceHover,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.borderHighlight,
  },
  fabLabel: {
    ...n.typography.meta,
    color: n.colors.textSecondary,
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
  },
  tabItem: {
    flex: 1,
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
