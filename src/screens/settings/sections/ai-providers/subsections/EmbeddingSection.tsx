import React, { useMemo } from 'react';
import { View } from 'react-native';
import SettingsModelDropdown from '../../../components/SettingsModelDropdown';
import type { UserProfile } from '../../../../../types';
import {
  GEMINI_EMBEDDING_MODELS,
  OPENROUTER_EMBEDDING_MODELS,
  JINA_EMBEDDING_MODELS,
} from '../../../../../config/appConfig';

interface Props {
  profile: UserProfile;
  updateUserProfile: (patch: Partial<UserProfile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export default function EmbeddingSection({ profile, updateUserProfile, refreshProfile }: Props) {
  const currentProvider = profile.embeddingProvider || 'gemini';
  const currentModel = profile.embeddingModel || 'models/gemini-embedding-001';
  const currentValue = `${currentProvider}|${currentModel}`;

  const options = useMemo(() => {
    const list: { id: string; label: string; group: string }[] = [];

    GEMINI_EMBEDDING_MODELS.forEach((m) => {
      list.push({ id: `gemini|${m}`, label: m, group: 'Gemini (AI Studio)' });
    });

    OPENROUTER_EMBEDDING_MODELS.forEach((m) => {
      list.push({ id: `openrouter|${m}`, label: m.replace('openai/', ''), group: 'OpenRouter' });
    });

    JINA_EMBEDDING_MODELS.forEach((m) => {
      list.push({ id: `jina|${m}`, label: m, group: 'Jina AI' });
    });

    return list;
  }, []);

  const handleSelect = async (val: string) => {
    const [provider, ...modelParts] = val.split('|');
    const model = modelParts.join('|');
    await updateUserProfile({
      embeddingProvider: provider,
      embeddingModel: model,
    });
    await refreshProfile();
  };

  return (
    <View style={{ marginBottom: 12 }}>
      <SettingsModelDropdown
        label="Embedding Model"
        value={currentValue}
        onSelect={handleSelect}
        options={options}
      />
    </View>
  );
}
