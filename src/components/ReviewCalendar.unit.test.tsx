import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { TouchableOpacity } from 'react-native';
import ReviewCalendar from './ReviewCalendar';
import { getReviewCalendarData } from '../db/queries/topics';

// Mock the database query
jest.mock('../db/queries/topics', () => ({
  getReviewCalendarData: jest.fn(),
}));

// Mock Ionicons
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

const mockReviewData = [
  {
    date: '2023-10-15',
    count: 2,
    topics: [
      { name: 'Topic 1', confidence: 3 },
      { name: 'Topic 2', confidence: 1 },
    ],
  },
  {
    date: '2023-10-20',
    count: 99,
    topics: Array(99).fill({ name: 'Bulk Topic', confidence: 2 }),
  },
];

describe('ReviewCalendar', () => {
  const now = new Date(2023, 9, 15); // Oct 15, 2023

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (getReviewCalendarData as jest.Mock).mockResolvedValue([]);
  });

  it('renders current month and year correctly', async () => {
    const { getByText } = render(<ReviewCalendar />);

    await waitFor(() => {
      expect(getByText('October 2023')).toBeTruthy();
    });

    expect(getReviewCalendarData).toHaveBeenCalledWith(2023, 9);
  });

  it('navigates to previous month', async () => {
    const { getByText, UNSAFE_getAllByType } = render(<ReviewCalendar />);

    // Find the back button - it's the first TouchableOpacity in the header
    const buttons = UNSAFE_getAllByType(TouchableOpacity);
    const backBtn = buttons[0];

    await act(async () => {
      fireEvent.press(backBtn);
    });

    await waitFor(() => {
      expect(getByText('September 2023')).toBeTruthy();
    });

    expect(getReviewCalendarData).toHaveBeenCalledWith(2023, 8);
  });

  it('navigates to next month', async () => {
    const { getByText, UNSAFE_getAllByType } = render(<ReviewCalendar />);

    const buttons = UNSAFE_getAllByType(TouchableOpacity);
    const nextBtn = buttons[1];

    await act(async () => {
      fireEvent.press(nextBtn);
    });

    await waitFor(() => {
      expect(getByText('November 2023')).toBeTruthy();
    });

    expect(getReviewCalendarData).toHaveBeenCalledWith(2023, 10);
  });

  it('displays review data correctly', async () => {
    (getReviewCalendarData as jest.Mock).mockResolvedValue(mockReviewData);

    const { getByText, getByLabelText } = render(<ReviewCalendar />);

    await waitFor(() => {
      expect(getByText('101 reviews scheduled')).toBeTruthy();
    });

    // Check for day 15 (mocked data has 2 reviews)
    const day15 = getByLabelText('15 October, 2 reviews scheduled');
    expect(day15).toBeTruthy();

    // Check for day 20 (mocked data has 99 reviews, should show count)
    const day20 = getByLabelText('20 October, 99 reviews scheduled');
    expect(day20).toBeTruthy();
    expect(getByText('99')).toBeTruthy();
  });

  it('shows details when a day with reviews is selected', async () => {
    (getReviewCalendarData as jest.Mock).mockResolvedValue(mockReviewData);

    const { getByLabelText, getByText, queryByText } = render(<ReviewCalendar />);

    await waitFor(() => {
      expect(getByText('101 reviews scheduled')).toBeTruthy();
    });

    const day15 = getByLabelText('15 October, 2 reviews scheduled');

    await act(async () => {
      fireEvent.press(day15);
    });

    expect(getByText(/Topic 1/)).toBeTruthy();
    expect(getByText(/Topic 2/)).toBeTruthy();

    // Selecting again should close details
    await act(async () => {
      fireEvent.press(day15);
    });

    expect(queryByText(/Topic 1/)).toBeNull();
  });

  it('correctly transitions year when changing months', async () => {
    const { UNSAFE_getAllByType, getByText } = render(<ReviewCalendar />);
    const buttons = UNSAFE_getAllByType(TouchableOpacity);
    const backBtn = buttons[0];

    // Press back 10 times from Oct 2023 to Dec 2022
    for (let i = 0; i < 10; i++) {
      await act(async () => {
        fireEvent.press(backBtn);
      });
    }

    await waitFor(() => {
      expect(getByText('December 2022')).toBeTruthy();
    });
  }, 20_000);
});
