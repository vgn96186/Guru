import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import SubjectCard from './SubjectCard';
import type { Subject } from '../types';
import { useReducedMotion } from '../motion/useReducedMotion';

jest.mock('../motion/useReducedMotion', () => ({
  useReducedMotion: jest.fn(() => false),
}));

const subject: Subject = {
  id: 1,
  name: 'Anatomy',
  shortCode: 'AN',
  colorHex: '#E91E63',
  inicetWeight: 1,
  neetWeight: 1,
  displayOrder: 1,
};

describe('SubjectCard', () => {
  const onPress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useReducedMotion as jest.Mock).mockReturnValue(false);
  });

  it('renders subject name and coverage', () => {
    const { getByText } = render(
      <SubjectCard subject={subject} coverage={{ total: 100, seen: 40 }} onPress={onPress} />,
    );
    expect(getByText('Anatomy')).toBeTruthy();
    expect(getByText('40%')).toBeTruthy();
  });

  it('calls onPress and triggers light haptic', () => {
    const { getByLabelText } = render(
      <SubjectCard subject={subject} coverage={{ total: 10, seen: 5 }} onPress={onPress} />,
    );
    fireEvent.press(getByLabelText('Anatomy subject'));
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('keeps native tap feedback visible when reduced motion is enabled', () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);

    const { getByLabelText } = render(
      <SubjectCard subject={subject} coverage={{ total: 10, seen: 5 }} onPress={onPress} />,
    );

    expect(getByLabelText('Anatomy subject').props.activeOpacity).toBe(0.82);

    fireEvent.press(getByLabelText('Anatomy subject'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
