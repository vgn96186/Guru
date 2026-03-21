import React from 'react';
import { StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  HomeStackParamList,
  TreeStackParamList,
  VaultStackParamList,
  TabParamList,
} from './types';
import HomeScreen from '../screens/HomeScreen';
import SessionScreen from '../screens/SessionScreen';
import LectureModeScreen from '../screens/LectureModeScreen';
import MockTestScreen from '../screens/MockTestScreen';
import ReviewScreen from '../screens/ReviewScreen';
import BossBattleScreen from '../screens/BossBattleScreen';
import InertiaScreen from '../screens/InertiaScreen';
import ManualLogScreen from '../screens/ManualLogScreen';
import StudyPlanScreen from '../screens/StudyPlanScreen';
import DailyChallengeScreen from '../screens/DailyChallengeScreen';
import FlaggedReviewScreen from '../screens/FlaggedReviewScreen';
import GlobalTopicSearchScreen from '../screens/GlobalTopicSearchScreen';
import KnowledgeTreeScreen from '../screens/KnowledgeTreeScreen';
import SyllabusScreen from '../screens/SyllabusScreen';
import TopicDetailScreen from '../screens/TopicDetailScreen';
import VaultScreen from '../screens/VaultScreen';
import MenuScreen from '../screens/MenuScreen';
import NotesHubScreen from '../screens/NotesHubScreen';
import NotesSearchScreen from '../screens/NotesSearchScreen';
import ManualNoteCreationScreen from '../screens/ManualNoteCreationScreen';
import TranscriptHistoryScreen from '../screens/TranscriptHistoryScreen';
import DeviceLinkScreen from '../screens/DeviceLinkScreen';
import SettingsScreen from '../screens/SettingsScreen';
import StatsScreen from '../screens/StatsScreen';
import { theme } from '../constants/theme';

const Tab = createBottomTabNavigator<TabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const TreeStack = createNativeStackNavigator<TreeStackParamList>();
const VaultStack = createNativeStackNavigator<VaultStackParamList>();

function HomeStackNav() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="Home" component={HomeScreen} />
      <HomeStack.Screen name="Session" component={SessionScreen} />
      <HomeStack.Screen name="LectureMode" component={LectureModeScreen} />
      <HomeStack.Screen name="MockTest" component={MockTestScreen} />
      <HomeStack.Screen name="Review" component={ReviewScreen} />
      <HomeStack.Screen name="BossBattle" component={BossBattleScreen} />
      <HomeStack.Screen name="Inertia" component={InertiaScreen} />
      <HomeStack.Screen name="ManualLog" component={ManualLogScreen} />
      <HomeStack.Screen name="StudyPlan" component={StudyPlanScreen} />
      <HomeStack.Screen name="DailyChallenge" component={DailyChallengeScreen} />
      <HomeStack.Screen name="FlaggedReview" component={FlaggedReviewScreen} />
      <HomeStack.Screen name="GlobalTopicSearch" component={GlobalTopicSearchScreen} />
    </HomeStack.Navigator>
  );
}

function TreeStackNav() {
  return (
    <TreeStack.Navigator initialRouteName="KnowledgeTree" screenOptions={{ headerShown: false }}>
      <TreeStack.Screen name="KnowledgeTree" component={KnowledgeTreeScreen} />
      <TreeStack.Screen name="Syllabus" component={SyllabusScreen} />
      <TreeStack.Screen name="TopicDetail" component={TopicDetailScreen} />
    </TreeStack.Navigator>
  );
}

function VaultStackNav() {
  return (
    <VaultStack.Navigator initialRouteName="VaultHome" screenOptions={{ headerShown: false }}>
      <VaultStack.Screen name="VaultHome" component={VaultScreen} />
      <VaultStack.Screen name="MenuHome" component={MenuScreen} />
      <VaultStack.Screen name="NotesHub" component={NotesHubScreen} />
      <VaultStack.Screen name="NotesSearch" component={NotesSearchScreen} />
      <VaultStack.Screen name="ManualNoteCreation" component={ManualNoteCreationScreen} />
      <VaultStack.Screen name="TranscriptHistory" component={TranscriptHistoryScreen} />
      <VaultStack.Screen name="StudyPlan" component={StudyPlanScreen} />
      <VaultStack.Screen name="Settings" component={SettingsScreen} />
      <VaultStack.Screen name="DeviceLink" component={DeviceLinkScreen} />
    </VaultStack.Navigator>
  );
}

function tabIcon(name: keyof typeof Ionicons.glyphMap) {
  return ({ color, size }: { color: string; size: number }) => (
    <Ionicons name={name} size={size} color={color} />
  );
}

export default function TabNavigator() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <View style={styles.flex}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarHideOnKeyboard: true,
          tabBarShowLabel: true,
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '700',
            marginTop: 0,
            letterSpacing: 0.3,
          },
          tabBarItemStyle: {
            paddingTop: 2,
          },
          tabBarStyle: {
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border,
            paddingBottom: bottomInset,
            height: 66 + bottomInset,
            paddingTop: 4,
          },
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.textMuted,
        }}
      >
        <Tab.Screen
          name="HomeTab"
          component={HomeStackNav}
          options={{
            tabBarLabel: 'Home',
            tabBarButtonTestID: 'tab-home',
            tabBarAccessibilityLabel: 'Home tab',
            tabBarIcon: tabIcon('home'),
          }}
        />
        <Tab.Screen
          name="TreeTab"
          component={TreeStackNav}
          options={{
            tabBarLabel: 'Tree',
            tabBarButtonTestID: 'tab-tree',
            tabBarAccessibilityLabel: 'Tree tab',
            tabBarIcon: tabIcon('leaf'),
          }}
        />
        <Tab.Screen
          name="VaultTab"
          component={VaultStackNav}
          options={{
            tabBarLabel: 'Vault',
            tabBarButtonTestID: 'tab-vault',
            tabBarAccessibilityLabel: 'Vault tab',
            tabBarIcon: tabIcon('archive'),
          }}
        />
        <Tab.Screen
          name="StatsTab"
          component={StatsScreen}
          options={{
            tabBarLabel: 'Stats',
            tabBarButtonTestID: 'tab-stats',
            tabBarAccessibilityLabel: 'Stats tab',
            tabBarIcon: tabIcon('bar-chart'),
          }}
        />
      </Tab.Navigator>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
