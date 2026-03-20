import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ContentPreferencesSection from './ContentPreferencesSection';
import { ContentType, Subject } from '../../types';

describe('ContentPreferencesSection', () => {
  const subjects: Subject[] = [
    { id: 1, name: 'Anatomy', shortCode: 'ANA', colorHex: '#FF0000', icon: 'human' },
    { id: 2, name: 'Physiology', shortCode: 'PHY', colorHex: '#00FF00', icon: 'heart' },
  ];

  const allContentTypes: { type: ContentType; label: string }[] = [
    { type: 'keypoints', label: 'Key Points' },
    { type: 'mcq', label: 'Multiple Choice' },
    { type: 'flashcard', label: 'Flashcards' },
  ];

  const defaultProps = {
    subjects,
    focusSubjectIds: [1],
    onFocusSubjectToggle: jest.fn(),
    onClearFocus: jest.fn(),
    allContentTypes,
    blockedTypes: ['mcq'] as ContentType[],
    onContentTypeToggle: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with default props', () => {
    const { getByText } = render(<ContentPreferencesSection {...defaultProps} />);
    
    expect(getByText('Focus Subjects')).toBeTruthy();
    expect(getByText('Card Type Preferences')).toBeTruthy();
    
    expect(getByText('ANA')).toBeTruthy();
    expect(getByText('PHY')).toBeTruthy();
    
    expect(getByText('Key Points')).toBeTruthy();
    expect(getByText('Multiple Choice')).toBeTruthy();
    expect(getByText('Flashcards')).toBeTruthy();
    
    expect(getByText('Clear focus (study all)')).toBeTruthy();
  });

  it('triggers onFocusSubjectToggle when a subject chip is pressed', () => {
    const { getByText } = render(<ContentPreferencesSection {...defaultProps} />);
    fireEvent.press(getByText('PHY'));
    expect(defaultProps.onFocusSubjectToggle).toHaveBeenCalledWith(2);
  });

  it('triggers onClearFocus when Clear focus button is pressed', () => {
    const { getByText } = render(<ContentPreferencesSection {...defaultProps} />);
    fireEvent.press(getByText('Clear focus (study all)'));
    expect(defaultProps.onClearFocus).toHaveBeenCalled();
  });

  it('does not show Clear focus button if no subjects are focused', () => {
    const { queryByText } = render(
      <ContentPreferencesSection {...defaultProps} focusSubjectIds={[]} />
    );
    expect(queryByText('Clear focus (study all)')).toBeNull();
  });

  it('triggers onContentTypeToggle when a non-locked content type chip is pressed', () => {
    const { getByText } = render(<ContentPreferencesSection {...defaultProps} />);
    fireEvent.press(getByText('Flashcards'));
    expect(defaultProps.onContentTypeToggle).toHaveBeenCalledWith('flashcard');
  });

  it('does not trigger onContentTypeToggle when a locked content type (keypoints) is pressed', () => {
    const { getByText } = render(<ContentPreferencesSection {...defaultProps} />);
    fireEvent.press(getByText('Key Points'));
    expect(defaultProps.onContentTypeToggle).not.toHaveBeenCalled();
  });

  it('displays blocked content types with an X', () => {
    const { getByText } = render(<ContentPreferencesSection {...defaultProps} />);
    // "Multiple Choice" is blocked in defaultProps
    expect(getByText('✕')).toBeTruthy();
  });
});
