import React from 'react';
import { render } from '@testing-library/react-native';
import { AiStatusIndicator } from '../components/home/AiStatusIndicator';

jest.mock('../hooks/useAiRuntimeStatus', () => ({
  useAiRuntimeStatus: jest.fn(),
}));

jest.mock('../services/ai/config', () => ({
  getApiKeys: jest.fn(),
}));

jest.mock('../services/deviceMemory', () => ({
  isLocalLlmUsable: jest.fn(),
}));

const { useAiRuntimeStatus } = jest.requireMock('../hooks/useAiRuntimeStatus') as {
  useAiRuntimeStatus: jest.Mock;
};
const { getApiKeys } = jest.requireMock('../services/ai/config') as {
  getApiKeys: jest.Mock;
};
const { isLocalLlmUsable } = jest.requireMock('../services/deviceMemory') as {
  isLocalLlmUsable: jest.Mock;
};

describe('AiStatusIndicator', () => {
  const profile = {
    huggingFaceToken: '',
    useLocalWhisper: false,
    localWhisperPath: '',
  } as any;

  beforeEach(() => {
    useAiRuntimeStatus.mockReturnValue({
      activeCount: 0,
      active: [],
      lastCompletedAt: null,
      lastModelUsed: null,
      lastBackend: null,
      lastKind: null,
      lastError: 'No AI backend available',
    });
    getApiKeys.mockReturnValue({
      chatgptConnected: false,
      githubCopilotConnected: false,
      gitlabDuoConnected: false,
      poeConnected: false,
      groqKey: undefined,
      geminiKey: undefined,
      orKey: undefined,
      deepseekKey: undefined,
      agentRouterKey: undefined,
      githubModelsPat: undefined,
    });
    isLocalLlmUsable.mockReturnValue(false);
  });

  it('hides the active banner when no AI request is running', () => {
    const { queryByText, getByText } = render(<AiStatusIndicator profile={profile} />);

    expect(queryByText('Err: No AI backend available')).toBeNull();
    expect(getByText('No AI')).toBeTruthy();
  });
});
