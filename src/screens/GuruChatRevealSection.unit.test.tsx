import React from 'react';
import { render } from '@testing-library/react-native';
import { RevealSection } from './GuruChatRevealSection';

jest.mock('../motion/useReducedMotion', () => ({
  useReducedMotion: jest.fn(() => false),
}));

describe('RevealSection', () => {
  it('keeps children mounted when the reveal state flips', () => {
    let mountCount = 0;

    function Probe() {
      React.useEffect(() => {
        mountCount += 1;
        return () => {
          mountCount -= 1;
        };
      }, []);

      return React.createElement('Probe');
    }

    const { rerender } = render(
      <RevealSection active={false} delayMs={0}>
        <Probe />
      </RevealSection>,
    );

    expect(mountCount).toBe(1);

    rerender(
      <RevealSection active={true} delayMs={80}>
        <Probe />
      </RevealSection>,
    );

    expect(mountCount).toBe(1);
  });
});
