import React from 'react';
import { render } from '@testing-library/react-native';
import VisualTimer from './VisualTimer';

describe('VisualTimer', () => {
  it('formats remaining time as m:ss', () => {
    const { getByText } = render(
      <VisualTimer totalSeconds={600} remainingSeconds={125} size={100} strokeWidth={8} />,
    );
    expect(getByText('2:05')).toBeTruthy();
  });

  it('shows 0:00 when no time remains', () => {
    const { getByText } = render(<VisualTimer totalSeconds={60} remainingSeconds={0} />);
    expect(getByText('0:00')).toBeTruthy();
  });
});
