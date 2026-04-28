import { render } from '@testing-library/react-native';
import { InlineMarkdownText } from './InlineMarkdownText';

describe('InlineMarkdownText', () => {
  it('strips **bold** markers from rendered output', () => {
    const { queryByText, getByText } = render(
      <InlineMarkdownText content="This is **bold** text" />,
    );
    expect(queryByText('**bold**')).toBeNull();
    expect(getByText('bold')).toBeTruthy();
  });

  it('strips *italic* markers from rendered output', () => {
    const { queryByText, getByText } = render(
      <InlineMarkdownText content="This is *italic* text" />,
    );
    expect(queryByText('*italic*')).toBeNull();
    expect(getByText('italic')).toBeTruthy();
  });

  it('preserves newlines', () => {
    const { getByText } = render(<InlineMarkdownText content={'Line 1\nLine 2'} />);
    expect(getByText(/Line 1/)).toBeTruthy();
    expect(getByText(/Line 2/)).toBeTruthy();
  });
});
