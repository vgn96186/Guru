import React from 'react';
import { View } from 'react-native';
import SettingsModelDropdown from '../../../components/SettingsModelDropdown';
import type { ImageGenState } from '../types';

const IMAGE_PROVIDERS = [
  { id: 'google', label: 'Google (Gemini)' },
  { id: 'fal', label: 'Fal AI' },
  { id: 'cloudflare', label: 'Cloudflare' },
  { id: 'openrouter', label: 'OpenRouter' },
];

const DEFAULT_IMAGE_ORDER = IMAGE_PROVIDERS.map((p) => p.id);

interface Props {
  imageGen: ImageGenState;
  falValidationStatus: string | null;
  falApiKey: string;
  setFalApiKey: (v: string) => void;
  setFalKeyTestResult:
    | React.Dispatch<React.SetStateAction<'ok' | 'fail' | null>>
    | ((r: unknown) => void);
  testFalKey: () => void;
  testingFalKey: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  clearProviderValidated: (id: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  SectionToggle: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  styles: any;
}

export default function ImageGenSection({
  imageGen,
  falValidationStatus,
  falApiKey,
  setFalApiKey,
  setFalKeyTestResult,
  testFalKey,
  testingFalKey,
  clearProviderValidated,
  SectionToggle,
  styles,
}: Props) {
  const { options, model, setModel, order, setOrder } = imageGen;

  const allIds = new Set(IMAGE_PROVIDERS.map((p) => p.id));
  const saved = order.filter((id) => allIds.has(id));
  const missing = IMAGE_PROVIDERS.map((p) => p.id).filter((id) => !saved.includes(id));
  const effectiveOrder = [...saved, ...missing];

  const items = effectiveOrder.map((id) => {
    const p = IMAGE_PROVIDERS.find((x) => x.id === id);
    return { id, label: p?.label ?? id };
  });

  return (
    <View style={{ marginBottom: 12 }}>
      <SettingsModelDropdown
        label="Image Generation"
        value={model}
        onSelect={setModel}
        options={options.map((opt) => {
          let group = 'Other';
          if (opt.label.includes('Google')) group = 'Google';
          else if (opt.label.includes('Cloudflare')) group = 'Cloudflare';
          else if (opt.label.includes('fal')) group = 'Fal AI';
          else if (opt.label.includes('OpenRouter')) group = 'OpenRouter';
          else if (opt.label.includes('Auto')) group = 'General';

          return {
            id: opt.value,
            label: opt.label,
            group,
          };
        })}
      />
    </View>
  );
}
