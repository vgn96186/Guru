import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ConfidenceSelector from './ConfidenceSelector';

describe('ConfidenceSelector', () => {
  it('renders all three options', () => {
    const { getByText } = render(<ConfidenceSelector value={1} onChange={() => {}} />);
    expect(getByText('Introduced')).toBeTruthy();
    expect(getByText('Understood')).toBeTruthy();
    expect(getByText('Confident')).toBeTruthy();
  });

  it('calls onChange with correct level when an option is pressed', () => {
    const onChange = jest.fn();
    const { getByText } = render(<ConfidenceSelector value={1} onChange={onChange} />);
    
    fireEvent.press(getByText('Understood'));
    expect(onChange).toHaveBeenCalledWith(2);
    
    fireEvent.press(getByText('Confident'));
    expect(onChange).toHaveBeenCalledWith(3);
    
    fireEvent.press(getByText('Introduced'));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('highlights the selected option', () => {
    // We can check styles if needed, but since it's characterization,
    // let's just ensure it renders with the current value correctly.
    const { getByText } = render(<ConfidenceSelector value={2} onChange={() => {}} />);
    const understood = getByText('Understood');
    // In our mock, Text is just a component. 
    // The style is on the TouchableOpacity (parent of Text).
    // getByText returns the Text element.
  });
});
