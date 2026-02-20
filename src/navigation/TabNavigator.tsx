import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { TabParamList, HomeStackParamList, SyllabusStackParamList } from './types';

import HomeScreen from '../screens/HomeScreen';
import SessionScreen from '../screens/SessionScreen';
import LectureModeScreen from '../screens/LectureModeScreen';
import MockTestScreen from '../screens/MockTestScreen';
import SyllabusScreen from '../screens/SyllabusScreen';
import TopicDetailScreen from '../screens/TopicDetailScreen';
import StatsScreen from '../screens/StatsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ReviewScreen from '../screens/ReviewScreen';
import NotesSearchScreen from '../screens/NotesSearchScreen';
import BossBattleScreen from '../screens/BossBattleScreen';
import InertiaScreen from '../screens/InertiaScreen';
import ManualLogScreen from '../screens/ManualLogScreen';
import StudyPlanScreen from '../screens/StudyPlanScreen';

// Navigation setup
const Tab = createBottomTabNavigator<TabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const SyllabusStack = createNativeStackNavigator<SyllabusStackParamList>();

function HomeStackNav() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="Home" component={HomeScreen} />
      <HomeStack.Screen name="Session" component={SessionScreen} />
      <HomeStack.Screen name="LectureMode" component={LectureModeScreen} />
      <HomeStack.Screen name="MockTest" component={MockTestScreen} />
      <HomeStack.Screen name="Review" component={ReviewScreen} />
      <HomeStack.Screen name="NotesSearch" component={NotesSearchScreen} />
      <HomeStack.Screen name="BossBattle" component={BossBattleScreen} />
      <HomeStack.Screen name="Inertia" component={InertiaScreen} />
      <HomeStack.Screen name="ManualLog" component={ManualLogScreen} />
      <HomeStack.Screen name="StudyPlan" component={StudyPlanScreen} />
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

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#1A1A24',
          borderTopColor: '#2A2A38',
          paddingBottom: 8,
          height: 60,
        },
        tabBarActiveTintColor: '#6C63FF',
        tabBarInactiveTintColor: '#555',
        tabBarIcon: ({ color, size, focused }) => {
          const icons: Record<string, string> = {
            HomeTab: focused ? 'play-circle' : 'play-circle-outline',
            SyllabusTab: focused ? 'grid' : 'grid-outline',
            StatsTab: focused ? 'bar-chart' : 'bar-chart-outline',
            SettingsTab: focused ? 'settings' : 'settings-outline',
          };
          return <Ionicons name={icons[route.name] as any} size={size} color={color} />;
        },
        tabBarLabel: ({ color }) => {
          const labels: Record<string, string> = {
            HomeTab: 'Study', SyllabusTab: 'Syllabus',
            StatsTab: 'Stats', SettingsTab: 'Settings',
          };
          return null; // icons only
        },
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeStackNav} />
      <Tab.Screen name="SyllabusTab" component={SyllabusStackNav} />
      <Tab.Screen name="StatsTab" component={StatsScreen} />
      <Tab.Screen name="SettingsTab" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
