import React, { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import type { GuruChatState } from '../types';
import { buildAvailableGuruChatModels } from '../../../../../hooks/useGuruChatModels';
import { GuruChatModelSelector } from '../../../../../components/chat/GuruChatModelSelector';
import SettingsLabel from '../../../components/SettingsLabel';
import LinearText from '../../../../../components/primitives/LinearText';
import { linearTheme as n } from '../../../../../theme/linearTheme';
import { UserProfile } from '../../../../../types';

interface Props {
  profile: UserProfile;
  guruChat: GuruChatState;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  SectionToggle: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  styles: any;
}

export default function ChatModelSection({
  profile,
  guruChat,
  SectionToggle,
  styles,
}: Props) {
  const {
    models: liveGuruChatModels,
    defaultModel: guruChatDefaultModel,
    setDefaultModel: setGuruChatDefaultModel,
  } = guruChat;

  const [pickerVisible, setPickerVisible] = useState(false);

  // Derive available models strictly using API keys (same logic as GuruChat)
  const availableModels = React.useMemo(() => {
    return buildAvailableGuruChatModels(profile, liveGuruChatModels);
  }, [profile, liveGuruChatModels]);

  const selectedModel = availableModels.find((m) => m.id === guruChatDefaultModel);
  const displayLabel = selectedModel ? selectedModel.name : guruChatDefaultModel;

  return (
    <View style={{ marginBottom: 12 }}>
      <SettingsLabel text="Guru Chat Default Model" />
      <Pressable
        style={localStyles.dropdownTrigger}
        onPress={() => setPickerVisible(true)}
      >
        <View style={{ flex: 1 }}>
          <LinearText variant="body" style={localStyles.dropdownValue} numberOfLines={2}>
            {displayLabel}
          </LinearText>
          {selectedModel && selectedModel.group ? (
            <LinearText variant="caption" tone="muted" style={{ marginTop: 2 }}>
              {selectedModel.group}
            </LinearText>
          ) : null}
        </View>
        <LinearText variant="body" tone="muted" style={localStyles.dropdownArrow}>
          ▼
        </LinearText>
      </Pressable>

      <GuruChatModelSelector
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        availableModels={availableModels}
        chosenModel={guruChatDefaultModel}
        onSelectModel={(id) => {
          setGuruChatDefaultModel(id);
          setPickerVisible(false);
        }}
        localLlmWarning={null}
        hasMessages={false}
      />
    </View>
  );
}

const localStyles = StyleSheet.create({
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: n.colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: n.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 6,
    marginBottom: 8,
  },
  dropdownValue: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  dropdownArrow: { fontSize: 16, marginLeft: 8 },
});
