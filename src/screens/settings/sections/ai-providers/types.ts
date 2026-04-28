import { FC } from 'react';
import type { UserProfile, ChatGptAccountSlot, ProviderId } from '../../../../types';
import type { ValidationProviderId } from '../../types';

export interface OAuthSlot {
  connecting: boolean;
  deviceCode: {
    verification_uri?: string;
    user_code: string;
    verification_uri_complete?: string;
  } | null;
  connected: boolean;
  connect: () => void;
  disconnect: () => void;
}

export interface ApiKeyField {
  value: string;
  setValue: (v: string) => void;
  setTestResult:
    | React.Dispatch<React.SetStateAction<'ok' | 'fail' | null>>
    | ((r: unknown) => void);
  validationStatus: 'idle' | 'testing' | 'valid' | 'invalid';
  test: () => void;
  testing: boolean;
}

export interface CloudflareKeyField {
  accountId: string;
  setAccountId: (id: string) => void;
  apiToken: string;
  setApiToken: (token: string) => void;
  setTestResult:
    | React.Dispatch<React.SetStateAction<'ok' | 'fail' | null>>
    | ((r: unknown) => void);
  validationStatus: 'idle' | 'testing' | 'valid' | 'invalid';
  test: () => void;
  testing: boolean;
}

export interface VertexKeyField {
  project: string;
  setProject: (v: string) => void;
  location: string;
  setLocation: (v: string) => void;
  token: string;
  setToken: (v: string) => void;
  setTestResult:
    | React.Dispatch<React.SetStateAction<'ok' | 'fail' | null>>
    | ((r: unknown) => void);
  validationStatus: 'idle' | 'testing' | 'valid' | 'invalid';
  test: () => void;
  testing: boolean;
}

export interface ChatGptSlotState {
  connectingSlot: 'primary' | 'secondary' | null;
  deviceCode: {
    verification_uri?: string;
    user_code: string;
    verification_uri_complete?: string;
  } | null;
  accounts: Record<ChatGptAccountSlot, { enabled: boolean; connected: boolean }>;
  setAccounts: React.Dispatch<
    React.SetStateAction<Record<ChatGptAccountSlot, { enabled: boolean; connected: boolean }>>
  >;
  connect: (slot: 'primary' | 'secondary') => void;
  disconnect: (slot: 'primary' | 'secondary') => void;
}

export interface CopilotState {
  connecting: boolean;
  deviceCode: {
    verification_uri?: string;
    user_code: string;
    verification_uri_complete?: string;
  } | null;
  connected: boolean;
  connect: () => void;
  disconnect: () => void;
  testResult: unknown;
  validateConnection: () => void;
  testingOAuth: boolean;
  preferredModel: string;
  setPreferredModel: (v: string) => void;
}

export interface GitLabDuoState {
  connecting: boolean;
  connected: boolean;
  connect: () => void;
  disconnect: () => void;
  clientId: string;
  setClientId: (v: string) => void;
  clientSecret: string;
  setClientSecret: (v: string) => void;
  testResult: unknown;
  validateConnection: () => void;
  testingOAuth: boolean;
  preferredModel: string;
  setPreferredModel: (v: string) => void;
  pasteModalVisible: boolean;
  setPasteModalVisible: (v: boolean) => void;
  pasteUrl: string;
  setPasteUrl: (v: string) => void;
  submitPasteUrl: () => void;
  pasteSubmitting: boolean;
}

export interface ImageGenState {
  options: { label: string; value: string }[];
  model: string;
  setModel: (m: string) => void;
  order: string[];
  setOrder: (order: string[]) => void;
}

export interface LocalAiState {
  enabled: boolean;
  llmReady: boolean;
  llmFileName: string;
  whisperReady: boolean;
  whisperFileName: string;
  llmAllowed: boolean;
  llmWarning: string;
  useNano: boolean;
}

export interface GuruChatState {
  models: Record<string, readonly string[]> & { loading?: boolean; refresh?: () => void };
  defaultModel: string;
  setDefaultModel: (m: string) => void;
  formatModelChipLabel: (val: string) => string;
}

export interface AiProvidersProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  styles: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  SectionToggle: FC<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  SubSectionToggle: FC<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  navigation: any;
  profile: UserProfile;

  guruChat: GuruChatState;
  guruMemory: { notes: string; setNotes: (s: string) => void };

  chatgpt: ChatGptSlotState;
  githubCopilot: CopilotState;
  gitlabDuo: GitLabDuoState;
  poe: OAuthSlot;
  qwen: OAuthSlot;

  apiKeys: {
    groq: ApiKeyField;
    githubModelsPat: ApiKeyField;
    openrouter: ApiKeyField;
    kilo: ApiKeyField;
    deepseek: ApiKeyField;
    agentRouter: ApiKeyField;
    gemini: ApiKeyField;
    vertex: VertexKeyField;
    deepgram: ApiKeyField;
    huggingface: ApiKeyField;
    cloudflare: CloudflareKeyField;
    fal: ApiKeyField;
    jina: ApiKeyField;
    braveSearch: ApiKeyField;
  };

  gemini: { preferStructuredJson: boolean; setPrefer: (b: boolean) => void };

  routing: {
    providerOrder: ProviderId[];
    moveProvider: (fromIndex: number, toIndex: number) => void;
    setProviderOrder: (order: ProviderId[]) => void;
  };
  imageGen: ImageGenState;
  transcriptionOrder: string[];
  setTranscriptionOrder: (order: string[]) => void;
  transcriptionProvider: string;
  setTranscriptionProvider: (v: string) => void;
  localAi: LocalAiState;

  updateUserProfile: (patch: Partial<UserProfile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearProviderValidated: (id: ValidationProviderId) => void;
}
