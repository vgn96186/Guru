import React, { useMemo } from 'react';
import { View } from 'react-native';
import SettingsModelDropdown from '../../../components/SettingsModelDropdown';
import { JINA_EMBEDDING_MODELS, OPENROUTER_EMBEDDING_MODELS, GEMINI_EMBEDDING_MODELS } from '../../../../../config/appConfig';

interface Props {
  provider: string;
  setProvider: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
}

export default function EmbeddingModelSection({ provider, setProvider, model, setModel }: Props) {
  const modelOptions = useMemo(() => {
    let options: string[] = [];
    if (provider === 'jina') options = [...JINA_EMBEDDING_MODELS];
    else if (provider === 'openrouter') options = [...OPENROUTER_EMBEDDING_MODELS];
    else options = [...GEMINI_EMBEDDING_MODELS]; // Default to gemini
    
    return options.map(m => ({ id: m, label: m, group: provider.toUpperCase() }));
  }, [provider]);

  return (
    <View style={{ marginBottom: 12 }}>
      <SettingsModelDropdown
        label="Embedding Provider"
        value={provider}
        onSelect={(p) => {
          setProvider(p);
          // Auto-select first model of new provider
          if (p === 'jina') setModel(JINA_EMBEDDING_MODELS[0]);
          else if (p === 'openrouter') setModel(OPENROUTER_EMBEDDING_MODELS[0]);
          else setModel(GEMINI_EMBEDDING_MODELS[0]);
        }}
        options={[
          { id: 'gemini', label: 'Gemini (AI Studio)', group: 'Providers' },
          { id: 'openrouter', label: 'OpenRouter', group: 'Providers' },
          { id: 'jina', label: 'Jina AI', group: 'Providers' },
        ]}
      />
      
      <SettingsModelDropdown
        label="Embedding Model"
        value={model}
        onSelect={setModel}
        options={modelOptions}
      />
    </View>
  );
}
