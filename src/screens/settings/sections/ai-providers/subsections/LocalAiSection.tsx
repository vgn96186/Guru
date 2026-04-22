import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LocalAiCard from '../components/LocalAiCard';
import type { LocalAiState } from '../types';

interface Props {
  localAi: LocalAiState;
  profile: any;
  updateUserProfile: (p: any) => Promise<void>;
  SubSectionToggle: any;
  styles: any;
}

export default function LocalAiSection({
  localAi,
  profile,
  updateUserProfile,
  SubSectionToggle,
  styles,
}: Props) {
  const { llmReady, llmFileName, whisperReady, whisperFileName, llmAllowed, llmWarning, useNano } =
    localAi;

  return (
    <SubSectionToggle id="ai_local_ai" title="LOCAL AI">
      {/* ── Gemini Nano (AICore) ── */}
      <LocalAiCard
        title="Gemini Nano"
        iconName="sparkles"
        iconColor="#4285F4"
        isActive={useNano}
        onToggle={(val) => updateUserProfile({ useNano: val })}
        hint="~256 token output · No model file needed"
        styles={styles}
      />

      <View style={{ height: 16 }} />

      {/* ── Local LLM ── */}
      <LocalAiCard
        title="Local LLM"
        iconName="cpu"
        iconColor="#F59E0B"
        isActive={!!profile?.useLocalModel}
        onToggle={(val) => updateUserProfile({ useLocalModel: val })}
        disableToggle={!llmReady}
        hint={
          !llmAllowed
            ? 'Device incompatible'
            : !llmReady
              ? 'Model not downloaded'
              : llmFileName
                ? llmFileName
                : 'Ready'
        }
        styles={styles}
      />

      <View style={{ height: 16 }} />

      {/* ── Local Whisper ── */}
      <LocalAiCard
        title="Local Whisper"
        iconName="mic"
        iconColor="#10B981"
        isActive={!!profile?.useLocalWhisper}
        onToggle={(val) => updateUserProfile({ useLocalWhisper: val })}
        disableToggle={!whisperReady}
        hint={!whisperReady ? 'Model not downloaded' : whisperFileName ? whisperFileName : 'Ready'}
        styles={styles}
      />

      {llmWarning ? (
        <View style={styles.localAiWarning}>
          <Ionicons name="warning" size={18} color="#F59E0B" />
          <Text style={styles.localAiWarningText}>{llmWarning}</Text>
        </View>
      ) : null}

      <Text style={[styles.hint, { marginTop: 16 }]}>
        To download or change models, open Guru Chat and tap the model chip.
      </Text>
    </SubSectionToggle>
  );
}
