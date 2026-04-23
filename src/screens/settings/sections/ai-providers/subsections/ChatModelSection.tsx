import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { linearTheme } from '../../../../../theme/linearTheme';
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
    <SectionToggle id="ai_chat_model" title="Chat Model" icon="chatbubbles" tint="#6C63FF">
      <Text style={styles.hint}>Default model for Guru Chat (changeable per session).</Text>
      <View style={styles.liveModelsRefreshRow}>
        <TouchableOpacity
          style={[styles.testBtn, { marginBottom: 0, flexShrink: 1 }]}
          onPress={liveGuruChatModels.refresh}
          disabled={liveGuruChatModels.loading}
          activeOpacity={0.8}
        >
          <Text style={styles.testBtnText}>
            {liveGuruChatModels.loading ? 'Loading live models…' : 'Refresh live model lists'}
          </Text>
        </TouchableOpacity>
        {liveGuruChatModels.loading && (
          <ActivityIndicator size="small" color={linearTheme.colors.accent} />
        )}
      </View>
      <SettingsModelDropdown
        label="Guru Chat — default model"
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
    </SectionToggle>
  );
}
