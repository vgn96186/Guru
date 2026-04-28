jest.mock('react-native', () => ({
  StyleSheet: {
    absoluteFillObject: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
    create: (styles: Record<string, unknown>) => styles,
  },
}));

import { blackAlpha } from '../../theme/colorUtils';
import { styles } from './SessionScreen.styles';

describe('Session paused overlay styles', () => {
  it('uses a dark, non-transparent modal and a strong dimmed backdrop', () => {
    expect(styles.pausedOverlay.backgroundColor).toBe(blackAlpha['92']);
    expect(styles.pausedContent.backgroundColor).toBe('rgba(10, 12, 16, 0.98)');
  });

  it('stacks action buttons vertically to avoid overflow on phones', () => {
    expect(styles.pausedActions.flexDirection).toBe('column');
    expect(styles.resumeOverlayBtn.width).toBe('100%');
  });
});
