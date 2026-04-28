import React from 'react';
import { act, render } from '@testing-library/react-native';

jest.mock('./home/components/HomeSkeleton', () => ({
  HomeSkeleton: () => {
    const React = require('react');
    const { Text } = require('react-native');
    return <Text>home-skeleton</Text>;
  },
}));

jest.mock('../components/home/NextLectureSection', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../store/useSessionStore', () => ({
  useSessionStore: {
    getState: () => ({
      resetSession: jest.fn(),
    }),
  },
}));

jest.mock('./home/hooks/useHomeDashboardController', () => ({
  useHomeDashboardController: () => ({
    isLoading: true,
    isProfilePending: false,
    profile: null,
    levelInfo: null,
  }),
}));

describe('HomeScreen loading', () => {
  it('keeps showing the skeleton after the interaction gate while data is loading', async () => {
    const HomeScreen = require('./HomeScreen').default as React.ComponentType;
    const { getByText } = render(<HomeScreen />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(getByText('home-skeleton')).toBeTruthy();
  });
});
