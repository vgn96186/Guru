import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';
import CheckInScreen from '../screens/CheckInScreen';
import TabNavigator from './TabNavigator';
import LockdownScreen from '../screens/LockdownScreen';
import DoomscrollGuideScreen from '../screens/DoomscrollGuideScreen';
import DeviceLinkScreen from '../screens/DeviceLinkScreen';
import BreakEnforcerScreen from '../screens/BreakEnforcerScreen';
import BrainDumpReviewScreen from '../screens/BrainDumpReviewScreen';
import SleepModeScreen from '../screens/SleepModeScreen';
import WakeUpScreen from '../screens/WakeUpScreen';
import BedLockScreen from '../screens/BedLockScreen';
import PunishmentMode from '../screens/PunishmentMode';
import DoomscrollInterceptor from '../screens/DoomscrollInterceptor';
import LocalModelScreen from '../screens/LocalModelScreen';
import ManualNoteCreationScreen from '../screens/ManualNoteCreationScreen';
import PomodoroQuizScreen from '../screens/PomodoroQuizScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator({ initialRoute }: { initialRoute: 'Tabs' | 'CheckIn' }) {
  return (
    <Stack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{ headerShown: false, animation: 'fade' }}
    >
      <Stack.Screen name="CheckIn" component={CheckInScreen} />
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen name="Lockdown" component={LockdownScreen} options={{ gestureEnabled: false, presentation: 'fullScreenModal' }} />
      <Stack.Screen name="DoomscrollGuide" component={DoomscrollGuideScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="DeviceLink" component={DeviceLinkScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="BreakEnforcer" component={BreakEnforcerScreen} options={{ gestureEnabled: false, presentation: 'fullScreenModal' }} />
      <Stack.Screen name="BrainDumpReview" component={BrainDumpReviewScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="SleepMode" component={SleepModeScreen} options={{ gestureEnabled: false, presentation: 'fullScreenModal' }} />
      <Stack.Screen name="WakeUp" component={WakeUpScreen} options={{ gestureEnabled: false, presentation: 'fullScreenModal' }} />
      <Stack.Screen name="PunishmentMode" component={PunishmentMode} options={{ gestureEnabled: false, presentation: 'fullScreenModal' }} />
      <Stack.Screen name="BedLock" component={BedLockScreen} options={{ gestureEnabled: false, presentation: 'fullScreenModal' }} />
      <Stack.Screen name="DoomscrollInterceptor" component={DoomscrollInterceptor} options={{ gestureEnabled: false, presentation: 'fullScreenModal' }} />
      <Stack.Screen name="LocalModel" component={LocalModelScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="ManualNoteCreation" component={ManualNoteCreationScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="PomodoroQuiz" component={PomodoroQuizScreen} options={{ presentation: 'fullScreenModal' }} />
    </Stack.Navigator>
  );
}
