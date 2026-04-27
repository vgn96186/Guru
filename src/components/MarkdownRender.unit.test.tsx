import { render } from '@testing-library/react-native';
import { MarkdownRender } from './MarkdownRender';

// Mocking the Markdown component from react-native-markdown-display
// since we don't want to test the library itself, but our component's integration.
jest.mock('react-native-markdown-display', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return (props: any) => {
    return <Text testID="mock-markdown">{props.children}</Text>;
  };
});

describe('MarkdownRender', () => {
  it('renders content correctly', () => {
    const content = '# Hello World';
    const { getByText } = render(<MarkdownRender content={content} />);
    expect(getByText(content)).toBeTruthy();
  });

  it('renders with compact=true', () => {
    const content = 'Compact text';
    const { getByText } = render(<MarkdownRender content={content} compact={true} />);
    expect(getByText(content)).toBeTruthy();
  });

  it('renders empty content', () => {
    const { getByTestId } = render(<MarkdownRender content="" />);
    expect(getByTestId('mock-markdown')).toBeTruthy();
  });
});
