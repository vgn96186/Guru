import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import DailyAgendaSection from './DailyAgendaSection';
import type { TodayTask } from '../../services/studyPlanner';

describe('DailyAgendaSection', () => {
  const mockTasks: TodayTask[] = [
    {
      topic: {
        id: '1',
        name: 'Task 1',
        subjectId: 's1',
        subjectName: 'Subject 1',
      } as unknown as TodayTask['topic'],
      timeLabel: '10:00 AM - 11:00 AM',
      type: 'review',
      duration: 30,
    },
    {
      topic: {
        id: '2',
        name: 'Task 2',
        subjectId: 's2',
        subjectName: 'Subject 2',
      } as unknown as TodayTask['topic'],
      timeLabel: '11:00 AM - 12:00 PM',
      type: 'deep_dive',
      duration: 45,
    },
    {
      topic: {
        id: '3',
        name: 'Task 3',
        subjectId: 's3',
        subjectName: 'Subject 3',
      } as unknown as TodayTask['topic'],
      timeLabel: '12:00 PM - 01:00 PM',
      type: 'study',
      duration: 30,
    },
  ];

  const defaultProps = {
    todayTasks: [],
    hasNewTopics: false,
    onStartSession: jest.fn(),
  };

  it('renders empty state when no tasks and hasNewTopics is false', () => {
    const { getByText, queryByText } = render(<DailyAgendaSection {...defaultProps} />);

    expect(getByText('All caught up!')).toBeTruthy();
    expect(getByText(/Great work! You've covered your due reviews/i)).toBeTruthy();
    expect(queryByText('Start New Topic')).toBeNull();
  });

  it('renders empty state when no tasks and hasNewTopics is true', () => {
    const { getByText } = render(<DailyAgendaSection {...defaultProps} hasNewTopics={true} />);

    expect(getByText('Ready to learn something new!')).toBeTruthy();
    expect(getByText(/You have new topics to explore/i)).toBeTruthy();
    expect(getByText('Start New Topic')).toBeTruthy();
  });

  it('calls onStartSession when button is pressed in empty state', () => {
    const onStartSession = jest.fn();
    const { getByText } = render(
      <DailyAgendaSection {...defaultProps} hasNewTopics={true} onStartSession={onStartSession} />,
    );

    fireEvent.press(getByText('Start New Topic'));
    expect(onStartSession).toHaveBeenCalled();
  });

  it('renders list of tasks when todayTasks is not empty', () => {
    const { getByText } = render(<DailyAgendaSection {...defaultProps} todayTasks={mockTasks} />);

    expect(getByText("📅 Today's Agenda")).toBeTruthy();

    expect(getByText('Task 1')).toBeTruthy();
    expect(getByText(/REL · Subject 1/i)).toBeTruthy();
    expect(getByText('10:00 AM')).toBeTruthy();

    expect(getByText('Task 2')).toBeTruthy();
    expect(getByText(/DEEP · Subject 2/i)).toBeTruthy();
    expect(getByText('11:00 AM')).toBeTruthy();

    expect(getByText('Task 3')).toBeTruthy();
    expect(getByText('12:00 PM')).toBeTruthy();
  });
});
