import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';
import CheckInScreen from '../screens/CheckInScreen';
import TabNavigator from './TabNavigator';
import { useAppStore } from '../store/useAppStore';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const hasCheckedInToday = useAppStore(s => s.hasCheckedInToday);

  return (
    <Stack.Navigator
      initialRouteName={hasCheckedInToday ? 'Tabs' : 'CheckIn'}
      screenOptions={{ headerShown: false, animation: 'fade' }}
    >
      <Stack.Screen name="CheckIn" component={CheckInScreen} />
      <Stack.Screen name="Tabs" component={TabNavigator} />
    </Stack.Navigator>
  );
}
