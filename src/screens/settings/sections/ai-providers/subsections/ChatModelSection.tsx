import React from 'react';
import { View } from 'react-native';
import SettingsModelDropdown from '../../../components/SettingsModelDropdown';
import type { GuruChatState } from '../types';

interface Props {
  guruChat: GuruChatState;
  useLocalModel: boolean;
  localModelPath: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  SectionToggle: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  styles: any;
}

export default function ChatModelSection({
  guruChat,
  useLocalModel,
  localModelPath,
  SectionToggle,
  styles,
}: Props) {
  const {
    models: liveGuruChatModels,
    formatModelChipLabel: formatGuruChatModelChipLabel,
    defaultModel: guruChatDefaultModel,
    setDefaultModel: setGuruChatDefaultModel,
  } = guruChat;

  return (
    <View style={{ marginBottom: 12 }}>
      <SettingsModelDropdown
        label="Guru Chat"
        value={guruChatDefaultModel}
        onSelect={setGuruChatDefaultModel}
        options={[
          { id: 'auto', label: formatGuruChatModelChipLabel('auto'), group: 'General' },
          ...(useLocalModel && localModelPath
            ? [{ id: 'local', label: formatGuruChatModelChipLabel('local'), group: 'General' }]
            : []),
          ...(liveGuruChatModels.chatgpt || []).map((m: string) => ({
            id: `chatgpt/${m}`,
            label: formatGuruChatModelChipLabel(`chatgpt/${m}`),
            group: 'ChatGPT Codex',
          })),
          ...(liveGuruChatModels.groq || []).map((m: string) => ({
            id: `groq/${m}`,
            label: formatGuruChatModelChipLabel(`groq/${m}`),
            group: 'Groq',
          })),
          ...(liveGuruChatModels.github || []).map((m: string) => ({
            id: `github/${m}`,
            label: formatGuruChatModelChipLabel(`github/${m}`),
            group: 'GitHub Models',
          })),
          ...(liveGuruChatModels.githubCopilot || []).map((m: string) => ({
            id: `github_copilot/${m}`,
            label: formatGuruChatModelChipLabel(`github_copilot/${m}`),
            group: 'GitHub Copilot',
          })),
          ...(liveGuruChatModels.gitlabDuo || []).map((m: string) => ({
            id: `gitlab_duo/${m}`,
            label: formatGuruChatModelChipLabel(`gitlab_duo/${m}`),
            group: 'GitLab Duo',
          })),
          ...(liveGuruChatModels.poe || []).map((m: string) => ({
            id: `poe/${m}`,
            label: formatGuruChatModelChipLabel(`poe/${m}`),
            group: 'Poe',
          })),
          ...(liveGuruChatModels.kilo || []).map((m: string) => ({
            id: `kilo/${m}`,
            label: formatGuruChatModelChipLabel(`kilo/${m}`),
            group: 'Kilo',
          })),
          ...(liveGuruChatModels.deepseek || []).map((m: string) => ({
            id: `deepseek/${m}`,
            label: formatGuruChatModelChipLabel(`deepseek/${m}`),
            group: 'DeepSeek',
          })),
          ...(liveGuruChatModels.agentrouter || []).map((m: string) => ({
            id: `ar/${m}`,
            label: formatGuruChatModelChipLabel(`ar/${m}`),
            group: 'AgentRouter',
          })),
          ...(liveGuruChatModels.openrouter || []).map((m: string) => ({
            id: m,
            label: formatGuruChatModelChipLabel(m),
            group: 'OpenRouter (free)',
          })),
          ...(liveGuruChatModels.gemini || []).map((m: string) => ({
            id: `gemini/${m}`,
            label: formatGuruChatModelChipLabel(`gemini/${m}`),
            group: 'Gemini',
          })),
          ...(liveGuruChatModels.cloudflare || []).map((m: string) => ({
            id: `cf/${m}`,
            label: formatGuruChatModelChipLabel(`cf/${m}`),
            group: 'Cloudflare',
          })),
        ]}
      />
    </View>
  );
}
