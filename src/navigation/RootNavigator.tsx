import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';
import CheckInScreen from '../screens/CheckInScreen';
import TabNavigator from './TabNavigator';
import BrainDumpReviewScreen from '../screens/BrainDumpReviewScreen';
import { useAppStore } from '../store/useAppStore';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const hasCheckedInToday = useAppStore(s => s.hasCheckedInToday);
  const alwaysAskMoodOnLaunch = useAppStore(s => s.profile?.alwaysAskMoodOnLaunch ?? true);

  return (
    <Stack.Navigator
      initialRouteName={alwaysAskMoodOnLaunch || !hasCheckedInToday ? 'CheckIn' : 'Tabs'}
      screenOptions={{ headerShown: false, animation: 'fade' }}
    >
      <Stack.Screen name="CheckIn" component={CheckInScreen} />
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen
        name="BrainDumpReview"
        component={BrainDumpReviewScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );
}
