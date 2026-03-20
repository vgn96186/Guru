import React from 'react';
import { render } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import TopicPillRow from './TopicPillRow';

describe('TopicPillRow', () => {
  it('renders null when topics array is empty', () => {
    const { queryByText } = render(<TopicPillRow topics={[]} />);
    expect(queryByText(/./)).toBeNull();
  });

  it('renders multiple topics', () => {
    const topics = ['React Native', 'Jest', 'Testing'];
    const { getByText } = render(<TopicPillRow topics={topics} />);
    
    topics.forEach(topic => {
      expect(getByText(topic)).toBeTruthy();
    });
  });

  it('renders in a ScrollView by default (wrap=false)', () => {
    const topics = ['Topic 1'];
    const { UNSAFE_getByType } = render(<TopicPillRow topics={topics} />);
    
    expect(UNSAFE_getByType(ScrollView)).toBeTruthy();
  });

  it('renders in a View when wrap is true', () => {
    const topics = ['Topic 1'];
    const { UNSAFE_queryByType } = render(<TopicPillRow topics={topics} wrap={true} />);
    
    expect(UNSAFE_queryByType(ScrollView)).toBeNull();
  });
});
