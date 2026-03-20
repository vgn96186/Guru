import React from 'react';
import { render } from '@testing-library/react-native';
import RootNavigator from './RootNavigator';

// Mock navigation
jest.mock('@react-navigation/native-stack', () => {
  const React = require('react');
  return {
    createNativeStackNavigator: jest.fn(() => ({
      Navigator: ({ children }: any) => React.createElement('Navigator', {}, children),
      Screen: ({ name }: any) => React.createElement('Screen', { name }),
    })),
  };
});

// Mock screens to avoid complex imports
jest.mock('../screens/CheckInScreen', () => () => null);
jest.mock('./TabNavigator', () => () => null);
jest.mock('../screens/LockdownScreen', () => () => null);
jest.mock('../screens/DoomscrollGuideScreen', () => () => null);
jest.mock('../screens/BreakEnforcerScreen', () => () => null);
jest.mock('../screens/BrainDumpReviewScreen', () => () => null);
jest.mock('../screens/SleepModeScreen', () => () => null);
jest.mock('../screens/WakeUpScreen', () => () => null);
jest.mock('../screens/BedLockScreen', () => () => null);
jest.mock('../screens/PunishmentMode', () => () => null);
jest.mock('../screens/DoomscrollInterceptor', () => () => null);
jest.mock('../screens/LocalModelScreen', () => () => null);
jest.mock('../screens/PomodoroQuizScreen', () => () => null);

describe('RootNavigator', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<RootNavigator initialRoute="CheckIn" />);
    expect(toJSON()).toBeDefined();
  });
});
