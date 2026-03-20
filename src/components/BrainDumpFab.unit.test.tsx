import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import BrainDumpFab from './BrainDumpFab';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addBrainDump } from '../db/queries/brainDumps';
import { navigationRef } from '../navigation/navigationRef';

// Mock dependencies
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: jest.fn(),
}));

jest.mock('../db/queries/brainDumps', () => ({
  addBrainDump: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../navigation/navigationRef', () => ({
  navigationRef: {
    isReady: jest.fn(),
    navigate: jest.fn(),
  },
}));

describe('BrainDumpFab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useSafeAreaInsets as jest.Mock).mockReturnValue({ bottom: 20 });
  });

  it('renders the FAB with correct bottom offset', () => {
    const { getByLabelText } = render(<BrainDumpFab />);
    const fab = getByLabelText('Add quick note');
    expect(fab).toBeTruthy();
    
    // bottomOffset = Math.max(insets.bottom, 0) + 72 = 20 + 72 = 92
    // The style is applied to the TouchableOpacity
    expect(fab.props.style).toContainEqual({ bottom: 92 });
  });

  it('opens the modal when FAB is pressed', () => {
    const { getByLabelText, getByText } = render(<BrainDumpFab />);
    const fab = getByLabelText('Add quick note');
    
    fireEvent.press(fab);
    
    expect(getByText('Park a Thought 🧠')).toBeTruthy();
  });

  it('closes the modal when close button is pressed', () => {
    const { getByLabelText, queryByText } = render(<BrainDumpFab />);
    fireEvent.press(getByLabelText('Add quick note'));
    
    const closeButton = getByLabelText('Close');
    fireEvent.press(closeButton);
    
    expect(queryByText('Park a Thought 🧠')).toBeNull();
  });

  it('updates note text when typing', () => {
    const { getByLabelText, getByPlaceholderText } = render(<BrainDumpFab />);
    fireEvent.press(getByLabelText('Add quick note'));
    
    const input = getByPlaceholderText('e.g., Pay electricity bill...');
    fireEvent.changeText(input, 'Testing note');
    
    expect(input.props.value).toBe('Testing note');
  });

  it('disables save button when note is empty', () => {
    const { getByLabelText } = render(<BrainDumpFab />);
    fireEvent.press(getByLabelText('Add quick note'));
    
    const saveButton = getByLabelText('Save and park thought');
    expect(saveButton.props.disabled).toBe(true);
  });

  it('enables save button when note is entered', () => {
    const { getByLabelText, getByPlaceholderText } = render(<BrainDumpFab />);
    fireEvent.press(getByLabelText('Add quick note'));
    
    const input = getByPlaceholderText('e.g., Pay electricity bill...');
    fireEvent.changeText(input, 'New thought');
    
    const saveButton = getByLabelText('Save and park thought');
    expect(saveButton.props.disabled).toBeFalsy();
  });

  it('calls addBrainDump and closes modal when saving', async () => {
    const { getByLabelText, getByPlaceholderText, queryByText } = render(<BrainDumpFab />);
    fireEvent.press(getByLabelText('Add quick note'));
    
    const input = getByPlaceholderText('e.g., Pay electricity bill...');
    fireEvent.changeText(input, 'Valuable insight');
    
    const saveButton = getByLabelText('Save and park thought');
    await act(async () => {
      fireEvent.press(saveButton);
    });
    
    expect(addBrainDump).toHaveBeenCalledWith('Valuable insight');
    await waitFor(() => {
        expect(queryByText('Park a Thought 🧠')).toBeNull();
    }, { timeout: 5000 });
  });

  it('navigates to BrainDumpReview when review link is pressed', () => {
    (navigationRef.isReady as jest.Mock).mockReturnValue(true);
    const { getByLabelText } = render(<BrainDumpFab />);
    fireEvent.press(getByLabelText('Add quick note'));
    
    const reviewLink = getByLabelText('Review parked thoughts');
    fireEvent.press(reviewLink);
    
    expect(navigationRef.navigate).toHaveBeenCalledWith('BrainDumpReview');
  });
});
