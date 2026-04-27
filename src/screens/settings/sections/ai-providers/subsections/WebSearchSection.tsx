import React, { useCallback, useMemo } from 'react';
import { View, Switch } from 'react-native';
import { LinearText } from '../../../../../components/primitives/LinearText';
import ProviderOrderEditor from '../../../components/ProviderOrderEditor';
import { DEFAULT_WEB_SEARCH_ORDER, WEB_SEARCH_DISPLAY_NAMES } from '../../../../../types';
import type { WebSearchProviderId, UserProfile } from '../../../../../types';

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  styles: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SectionToggle: React.FC<any>;
  profile: UserProfile;
  updateUserProfile: (patch: Partial<UserProfile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export default function WebSearchSection({
  styles,
  SectionToggle,
  profile,
  updateUserProfile,
  refreshProfile,
}: Props) {
  const order = useMemo<WebSearchProviderId[]>(
    () => (profile.webSearchOrder?.length ? profile.webSearchOrder : [...DEFAULT_WEB_SEARCH_ORDER]),
    [profile.webSearchOrder],
  );
  const disabled = useMemo<WebSearchProviderId[]>(
    () => profile.disabledWebSearchProviders ?? [],
    [profile.disabledWebSearchProviders],
  );

  const persistOrder = useCallback(
    (next: WebSearchProviderId[]) => {
      void updateUserProfile({ webSearchOrder: next }).then(() => refreshProfile());
    },
    [updateUserProfile, refreshProfile],
  );

  const toggleProvider = useCallback(
    (id: WebSearchProviderId, isDisabled: boolean) => {
      const next = isDisabled ? [...disabled, id] : disabled.filter((d) => d !== id);
      void updateUserProfile({ disabledWebSearchProviders: next }).then(() => refreshProfile());
    },
    [disabled, updateUserProfile, refreshProfile],
  );

  const disabledSet = new Set(disabled);
  const enabledItems = order
    .filter((id) => !disabledSet.has(id))
    .map((id) => ({ id, label: WEB_SEARCH_DISPLAY_NAMES[id] ?? id }));

  const keyLabel = (id: WebSearchProviderId): string => {
    if (id === 'brave') return 'Brave API key';
    if (id === 'gemini_grounding') return 'Gemini API key';
    if (id === 'deepseek_web') return 'DeepSeek API key';
    return 'No key needed';
  };

  return (
    <SectionToggle id="web_search" title="Web Search Providers" icon="search" tint="#4FC3F7">
      <LinearText variant="caption" tone="muted" style={styles.sectionDescription}>
        Order in which web search providers are tried. Toggle off to skip. Providers missing an API
        key are skipped automatically.
      </LinearText>

      {DEFAULT_WEB_SEARCH_ORDER.map((id) => (
        <View
          key={id}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 8,
            opacity: disabledSet.has(id) ? 0.4 : 1,
          }}
        >
          <View style={{ flex: 1 }}>
            <LinearText variant="body">{WEB_SEARCH_DISPLAY_NAMES[id]}</LinearText>
            <LinearText variant="caption" tone="muted">
              {keyLabel(id)}
            </LinearText>
          </View>
          <Switch value={!disabledSet.has(id)} onValueChange={(val) => toggleProvider(id, !val)} />
        </View>
      ))}

      <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#333', paddingTop: 12 }}>
        <LinearText variant="caption" tone="muted" style={{ marginBottom: 8 }}>
          Drag to reorder:
        </LinearText>
        <ProviderOrderEditor
          items={enabledItems}
          onSave={(orderedIds) => persistOrder(orderedIds as WebSearchProviderId[])}
          onReset={() => persistOrder([...DEFAULT_WEB_SEARCH_ORDER])}
          resetLabel="Reset to Default"
        />
      </View>
    </SectionToggle>
  );
}
