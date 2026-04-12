import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ApiKeySection from './ApiKeySection';

describe('ApiKeySection', () => {
  const defaultProps = {
    groqKey: 'test-groq-key',
    onGroqKeyChange: jest.fn(),
    openRouterKey: 'test-openrouter-key',
    onOpenRouterKeyChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with default props', () => {
    const { getByText, getByPlaceholderText } = render(<ApiKeySection {...defaultProps} />);

    expect(getByText('AI API KEYS')).toBeTruthy();
    expect(getByText('Groq API Key (Fastest)')).toBeTruthy();
    expect(getByText('OpenRouter API Key (Fallback)')).toBeTruthy();

    expect(getByPlaceholderText('gsk_...')).toBeTruthy();
    expect(getByPlaceholderText('sk-or-v1-...')).toBeTruthy();
  });

  it('displays the provided API keys', () => {
    const { getByPlaceholderText } = render(<ApiKeySection {...defaultProps} />);

    const groqInput = getByPlaceholderText('gsk_...');
    const openRouterInput = getByPlaceholderText('sk-or-v1-...');

    expect(groqInput.props.value).toBe('test-groq-key');
    expect(openRouterInput.props.value).toBe('test-openrouter-key');
  });

  it('triggers onGroqKeyChange when Groq API key is changed', () => {
    const { getByPlaceholderText } = render(<ApiKeySection {...defaultProps} />);
    const groqInput = getByPlaceholderText('gsk_...');

    fireEvent.changeText(groqInput, 'new-groq-key');
    expect(defaultProps.onGroqKeyChange).toHaveBeenCalledWith('new-groq-key');
  });

  it('triggers onOpenRouterKeyChange when OpenRouter API key is changed', () => {
    const { getByPlaceholderText } = render(<ApiKeySection {...defaultProps} />);
    const openRouterInput = getByPlaceholderText('sk-or-v1-...');

    fireEvent.changeText(openRouterInput, 'new-openrouter-key');
    expect(defaultProps.onOpenRouterKeyChange).toHaveBeenCalledWith('new-openrouter-key');
  });

  it('uses secureTextEntry for both inputs', () => {
    const { getByPlaceholderText } = render(<ApiKeySection {...defaultProps} />);

    const groqInput = getByPlaceholderText('gsk_...');
    const openRouterInput = getByPlaceholderText('sk-or-v1-...');

    expect(groqInput.props.secureTextEntry).toBe(true);
    expect(openRouterInput.props.secureTextEntry).toBe(true);
  });
});
