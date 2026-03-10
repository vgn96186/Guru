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
import { useAppStore } from '../store/useAppStore';
import { checkinToday, updateUserProfile } from '../db/queries/progress';
import { invalidatePlanCache } from '../services/studyPlanner';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const hasCheckedInToday = useAppStore(s => s.hasCheckedInToday);
  const profile = useAppStore(s => s.profile);
  const refreshProfile = useAppStore(s => s.refreshProfile);
  const setDailyAvailability = useAppStore(s => s.setDailyAvailability);

  // Auto-skip check-in for repeat Quick Start users (≥3 consecutive)
  const shouldAutoSkip = !hasCheckedInToday && (profile?.quickStartStreak ?? 0) >= 3;

  React.useEffect(() => {
    if (shouldAutoSkip) {
      checkinToday('good');
      setDailyAvailability(30);
      updateUserProfile({ quickStartStreak: (profile?.quickStartStreak ?? 0) + 1 });
      invalidatePlanCache();
      refreshProfile();
    }
  }, [shouldAutoSkip]);

  return (
    <Stack.Navigator
      initialRouteName={(hasCheckedInToday || shouldAutoSkip) ? 'Tabs' : 'CheckIn'}
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
    </Stack.Navigator>
  );
}
