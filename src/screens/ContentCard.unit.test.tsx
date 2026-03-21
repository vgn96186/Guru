import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ContentCard from './ContentCard';
import type { QuizContent } from '../types';

jest.mock('../services/aiService', () => ({
  askGuru: jest.fn(),
}));

jest.mock('../services/imageService', () => ({
  fetchWikipediaImage: () => Promise.resolve(null),
}));

jest.mock('../db/queries/aiCache', () => ({
  isContentFlagged: jest.fn().mockResolvedValue(false),
  setContentFlagged: jest.fn(),
}));

jest.mock('../components/MarkdownRender', () => ({
  MarkdownRender: ({ content }: { content: string }) => {
    const { Text } = require('react-native');
    return <Text>{content}</Text>;
  },
}));

jest.mock('../components/ErrorBoundary', () => {
  return ({ children }: React.PropsWithChildren) => children;
});

jest.mock('../components/GuruChatOverlay', () => {
  return ({ contextText }: { contextText?: string }) => {
    const { Text } = require('react-native');
    return <Text testID="guru-context">{contextText ?? ''}</Text>;
  };
});

describe('ContentCard Ask Guru context', () => {
  const quizContent: QuizContent = {
    type: 'quiz',
    topicName: 'ACS',
    questions: [
      {
        question: 'First question stem',
        options: ['A1', 'B1', 'C1', 'D1'],
        correctIndex: 0,
        explanation: 'First explanation',
      },
      {
        question: 'Second question stem',
        options: ['A2', 'B2', 'C2', 'D2'],
        correctIndex: 1,
        explanation: 'Second explanation',
      },
    ],
  };

  it('tracks the currently visible quiz question in Guru context', async () => {
    const { getByText, getByTestId } = render(
      <ContentCard content={quizContent} onDone={jest.fn()} onSkip={jest.fn()} />,
    );

    await waitFor(() => {
      expect(getByTestId('guru-context').props.children).toContain('First question stem');
      expect(getByTestId('guru-context').props.children).not.toContain('Second question stem');
    });

    fireEvent.press(getByText('A1'));
    fireEvent.press(getByText('Next Question →'));

    await waitFor(() => {
      expect(getByTestId('guru-context').props.children).toContain('Second question stem');
      expect(getByTestId('guru-context').props.children).not.toContain('First question stem');
    });
  });
});
