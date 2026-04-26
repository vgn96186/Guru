import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import SettingsToggleRow from '../../../components/SettingsToggleRow';
import { linearTheme as n } from '../../../../../theme/linearTheme';
import type { LocalAiState } from '../types';

interface Props {
  localAi: LocalAiState;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  profile: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  updateUserProfile: (p: any) => Promise<void>;
  refreshProfile: () => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  SectionToggle: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  styles: any;
}

export default function LocalAiSection({
  localAi,
  profile,
  updateUserProfile,
  refreshProfile,
  SectionToggle,
}: Props) {
  const navigation = useNavigation<any>();
  const { llmReady, llmFileName, whisperReady, whisperFileName, llmAllowed, llmWarning, useNano } =
    localAi;

  const updateLocalAiPreference = async (patch: {
    useNano?: boolean;
    useLocalModel?: boolean;
    useLocalWhisper?: boolean;
  }) => {
    await updateUserProfile(patch);
    await refreshProfile();
  };

  return (
    <SectionToggle id="ai_local" title="Local Inference" icon="hardware-chip" tint="#6366F1">
      <SettingsToggleRow
        label="Gemini Nano"
        hint="~256 token output · No download"
        value={useNano}
        onValueChange={(val: boolean) => updateLocalAiPreference({ useNano: val })}
        labelIcon={<Ionicons name="sparkles" size={16} color="#4285F4" />}
      />

      <SettingsToggleRow
        label="Local LLM"
        hint={!llmAllowed ? 'Incompatible' : !llmReady ? 'Missing model' : llmFileName || 'Ready'}
        value={!!profile?.useLocalModel}
        onValueChange={(val: boolean) => updateLocalAiPreference({ useLocalModel: val })}
        disabled={!llmReady}
        labelIcon={<Ionicons name="hardware-chip" size={16} color="#F59E0B" />}
      />

      <SettingsToggleRow
        label="Local Whisper"
        hint={!whisperReady ? 'Missing model' : whisperFileName || 'Ready'}
        value={!!profile?.useLocalWhisper}
        onValueChange={(val: boolean) => updateLocalAiPreference({ useLocalWhisper: val })}
        disabled={!whisperReady}
        labelIcon={<Ionicons name="mic" size={16} color="#10B981" />}
      />

      <TouchableOpacity
        style={localStyles.manageBtn}
        onPress={() => navigation.navigate('LocalModel')}
      >
        <Ionicons name="folder-open-outline" size={16} color={n.colors.accent} />
        <Text style={localStyles.manageBtnText}>Manage On-Device Models</Text>
      </TouchableOpacity>

      {llmWarning ? (
        <View style={localStyles.localAiWarning}>
          <Ionicons name="warning" size={18} color="#F59E0B" />
          <Text style={localStyles.localAiWarningText}>{llmWarning}</Text>
        </View>
      ) : null}
    </SectionToggle>
  );
}

const localStyles = {
  manageBtn: {
    marginTop: 12,
    backgroundColor: 'rgba(94, 106, 210, 0.05)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(94, 106, 210, 0.15)',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
  },
  manageBtnText: {
    color: n.colors.accent,
    fontWeight: '700' as const,
    fontSize: 13,
  },
  localAiWarning: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
    padding: 12,
    borderRadius: 12,
    marginTop: 12,
    gap: 10,
  },
  localAiWarningText: {
    color: '#F59E0B',
    fontSize: 12,
    flex: 1,
    lineHeight: 18,
  },
};
