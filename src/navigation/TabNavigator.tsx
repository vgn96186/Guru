import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TabParamList, HomeStackParamList, SyllabusStackParamList } from './types';

import HomeScreen from '../screens/HomeScreen';
import SessionScreen from '../screens/SessionScreen';
import LectureModeScreen from '../screens/LectureModeScreen';
import GuruChatScreen from '../screens/GuruChatScreen';
import MockTestScreen from '../screens/MockTestScreen';
import SyllabusScreen from '../screens/SyllabusScreen';
import TopicDetailScreen from '../screens/TopicDetailScreen';
import StatsScreen from '../screens/StatsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ReviewScreen from '../screens/ReviewScreen';
import NotesHubScreen from '../screens/NotesHubScreen';
import NotesSearchScreen from '../screens/NotesSearchScreen';
import BossBattleScreen from '../screens/BossBattleScreen';
import InertiaScreen from '../screens/InertiaScreen';
import ManualLogScreen from '../screens/ManualLogScreen';
import StudyPlanScreen from '../screens/StudyPlanScreen';
import DailyChallengeScreen from '../screens/DailyChallengeScreen';
import FlaggedReviewScreen from '../screens/FlaggedReviewScreen';
import TranscriptHistoryScreen from '../screens/TranscriptHistoryScreen';

// Navigation setup
const Tab = createBottomTabNavigator<TabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const SyllabusStack = createNativeStackNavigator<SyllabusStackParamList>();
const NotesStack = createNativeStackNavigator<HomeStackParamList>();

function HomeStackNav() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="Home" component={HomeScreen} />
      <HomeStack.Screen name="Session" component={SessionScreen} />
      <HomeStack.Screen name="LectureMode" component={LectureModeScreen} />
      <HomeStack.Screen name="GuruChat" component={GuruChatScreen} />
      <HomeStack.Screen name="MockTest" component={MockTestScreen} />
      <HomeStack.Screen name="Review" component={ReviewScreen} />
      <HomeStack.Screen name="NotesHub" component={NotesHubScreen} />
      <HomeStack.Screen name="NotesSearch" component={NotesSearchScreen} />
      <HomeStack.Screen name="BossBattle" component={BossBattleScreen} />
      <HomeStack.Screen name="Inertia" component={InertiaScreen} />
      <HomeStack.Screen name="ManualLog" component={ManualLogScreen} />
      <HomeStack.Screen name="StudyPlan" component={StudyPlanScreen} />
      <HomeStack.Screen name="DailyChallenge" component={DailyChallengeScreen} />
      <HomeStack.Screen name="FlaggedReview" component={FlaggedReviewScreen} />
      <HomeStack.Screen name="TranscriptHistory" component={TranscriptHistoryScreen} options={{ title: 'Lecture History' }} />
    </HomeStack.Navigator>
  );
}

function SyllabusStackNav() {
  return (
    <SyllabusStack.Navigator screenOptions={{ headerShown: false }}>
      <SyllabusStack.Screen name="Syllabus" component={SyllabusScreen} />
      <SyllabusStack.Screen name="TopicDetail" component={TopicDetailScreen} />
    </SyllabusStack.Navigator>
  );
}

function NotesStackNav() {
  return (
    <NotesStack.Navigator initialRouteName="NotesHub" screenOptions={{ headerShown: false }}>
      <NotesStack.Screen name="NotesHub" component={NotesHubScreen} />
      <NotesStack.Screen name="NotesSearch" component={NotesSearchScreen} />
      <NotesStack.Screen name="TranscriptHistory" component={TranscriptHistoryScreen} options={{ title: 'Lecture History' }} />
      <NotesStack.Screen name="GuruChat" component={GuruChatScreen} />
      <NotesStack.Screen name="LectureMode" component={LectureModeScreen} />
    </NotesStack.Navigator>
  );
}

export default function TabNavigator() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          marginTop: 0,
          letterSpacing: 0.3,
        },
        tabBarStyle: {
          backgroundColor: '#1A1A24',
          borderTopColor: '#2A2A38',
          paddingBottom: bottomInset,
          height: 62 + bottomInset,
          paddingTop: 4,
        },
        tabBarActiveTintColor: '#6C63FF',
        tabBarInactiveTintColor: '#777',
        tabBarIcon: ({ color, size, focused }) => {
          const icons: Record<string, string> = {
            HomeTab: focused ? 'home' : 'home-outline',
            SyllabusTab: focused ? 'grid' : 'grid-outline',
            NotesTab: focused ? 'book' : 'book-outline',
            PlanTab: focused ? 'calendar' : 'calendar-outline',
            StatsTab: focused ? 'bar-chart' : 'bar-chart-outline',
            SettingsTab: focused ? 'settings' : 'settings-outline',
          };
          return <Ionicons name={icons[route.name] as any} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeStackNav} options={{ tabBarLabel: 'Home', tabBarButtonTestID: 'tab-home', tabBarAccessibilityLabel: 'Home tab' }} />
      <Tab.Screen name="SyllabusTab" component={SyllabusStackNav} options={{ tabBarLabel: 'Syllabus', tabBarButtonTestID: 'tab-syllabus', tabBarAccessibilityLabel: 'Syllabus tab' }} />
      <Tab.Screen name="NotesTab" component={NotesStackNav} options={{ tabBarLabel: 'Notes', tabBarButtonTestID: 'tab-notes', tabBarAccessibilityLabel: 'Notes tab' }} />
      <Tab.Screen name="PlanTab" component={StudyPlanScreen} options={{ tabBarLabel: 'Plan', tabBarButtonTestID: 'tab-plan', tabBarAccessibilityLabel: 'Study Plan tab' }} />
      <Tab.Screen name="StatsTab" component={StatsScreen} options={{ tabBarLabel: 'Stats', tabBarButtonTestID: 'tab-stats', tabBarAccessibilityLabel: 'Statistics tab' }} />
      <Tab.Screen name="SettingsTab" component={SettingsScreen} options={{ tabBarLabel: 'Settings', tabBarButtonTestID: 'tab-settings', tabBarAccessibilityLabel: 'Settings tab' }} />
    </Tab.Navigator>
  );
}
