import React from 'react';
import { View, Text } from 'react-native';
import { PROVIDER_DISPLAY_NAMES } from '../../../../../types';
import type { ProviderId } from '../../../../../types';
import ProviderOrderEditor from '../../../components/ProviderOrderEditor';
import type { ImageGenState } from '../types';

const IMAGE_PROVIDERS = [
  { id: 'google', label: 'Google (Gemini)' },
  { id: 'fal', label: 'Fal AI' },
  { id: 'cloudflare', label: 'Cloudflare' },
  { id: 'openrouter', label: 'OpenRouter' },
];
const DEFAULT_IMAGE_ORDER = IMAGE_PROVIDERS.map((p) => p.id);

const TRANSCRIPTION_PROVIDERS = [
  { id: 'groq', label: 'Groq' },
  { id: 'cloudflare', label: 'Cloudflare' },
  { id: 'huggingface', label: 'Hugging Face' },
  { id: 'deepgram', label: 'Deepgram' },
  { id: 'local', label: 'Local (Whisper)' },
];
const DEFAULT_TRANSCRIPTION_ORDER = TRANSCRIPTION_PROVIDERS.map((p) => p.id);

interface Props {
  routing: {
    providerOrder: ProviderId[];
    moveProvider: (fromIndex: number, toIndex: number) => void;
    setProviderOrder: (order: ProviderId[]) => void;
  };
  DEFAULT_PROVIDER_ORDER: ProviderId[];
  sanitizeProviderOrder: (order: ProviderId[]) => ProviderId[];
  imageGen: ImageGenState;
  transcriptionOrder: string[];
  setTranscriptionOrder: (order: string[]) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  updateUserProfile: (patch: any) => Promise<void>;
  refreshProfile: () => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  styles: any;
}

export default function RoutingSection({
  routing,
  DEFAULT_PROVIDER_ORDER,
  sanitizeProviderOrder,
  imageGen,
  transcriptionOrder,
  setTranscriptionOrder,
  updateUserProfile,
  refreshProfile,
  styles,
}: Props) {
  // ── Chat Routing ──
  const { providerOrder, setProviderOrder } = routing;
  const persistChatOrder = React.useCallback(
    (order: ProviderId[]) => {
      const clean = sanitizeProviderOrder(order);
      setProviderOrder(clean);
      void updateUserProfile({ providerOrder: clean })
        .then(() => refreshProfile())
        .catch((err: unknown) => {
          if (__DEV__) console.warn('[Settings] Failed to save provider order:', err);
        });
    },
    [refreshProfile, sanitizeProviderOrder, setProviderOrder, updateUserProfile],
  );

  const chatItems = providerOrder.map((id) => ({
    id,
    label: PROVIDER_DISPLAY_NAMES[id] || id,
  }));

  // ── Image Routing ──
  const allImageIds = new Set(IMAGE_PROVIDERS.map((p) => p.id));
  const savedImage = imageGen.order.filter((id) => allImageIds.has(id));
  const missingImage = IMAGE_PROVIDERS.map((p) => p.id).filter((id) => !savedImage.includes(id));
  const effectiveImageOrder = [...savedImage, ...missingImage];
  const imageItems = effectiveImageOrder.map((id) => {
    const p = IMAGE_PROVIDERS.find((x) => x.id === id);
    return { id, label: p?.label ?? id };
  });

  // ── Transcription Routing ──
  const allTxIds = new Set(TRANSCRIPTION_PROVIDERS.map((p) => p.id));
  const savedTx = transcriptionOrder.filter((id) => allTxIds.has(id));
  const missingTx = TRANSCRIPTION_PROVIDERS.map((p) => p.id).filter((id) => !savedTx.includes(id));
  const effectiveTxOrder = [...savedTx, ...missingTx];
  const txItems = effectiveTxOrder.map((id) => {
    const p = TRANSCRIPTION_PROVIDERS.find((x) => x.id === id);
    return { id, label: p?.label ?? id };
  });

  const persistTxOrder = (next: string[]) => {
    setTranscriptionOrder(next);
    void updateUserProfile({ transcriptionOrder: next })
      .then(() => refreshProfile())
      .catch((err: unknown) => {
        if (__DEV__) console.warn('[Settings] Failed to save transcription order:', err);
      });
  };

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.hint}>Chat & Reasoning Fallback</Text>
      <ProviderOrderEditor
        items={chatItems}
        onSave={(orderedIds) => persistChatOrder(orderedIds as ProviderId[])}
        onReset={() => persistChatOrder([...DEFAULT_PROVIDER_ORDER])}
        resetLabel="Reset"
      />

      <View style={{ marginTop: 24 }}>
        <Text style={styles.hint}>Image Generation Fallback</Text>
        <ProviderOrderEditor
          items={imageItems}
          onSave={imageGen.setOrder}
          onReset={() => imageGen.setOrder([...DEFAULT_IMAGE_ORDER])}
          resetLabel="Reset"
        />
      </View>

      <View style={{ marginTop: 24 }}>
        <Text style={styles.hint}>Audio Transcription Fallback</Text>
        <ProviderOrderEditor
          items={txItems}
          onSave={persistTxOrder}
          onReset={() => persistTxOrder([...DEFAULT_TRANSCRIPTION_ORDER])}
          resetLabel="Reset"
        />
      </View>
    </View>
  );
}
