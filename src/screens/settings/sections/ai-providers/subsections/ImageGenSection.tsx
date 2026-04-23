import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme } from '../../../../../theme/linearTheme';
import LinearTextInput from '../../../../../components/primitives/LinearTextInput';
import SettingsModelDropdown from '../../../components/SettingsModelDropdown';
import type { ImageGenState } from '../types';

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
  clearProviderValidated: (id: any) => void;
  SectionToggle: any;
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
  const { options, model, setModel } = imageGen;

  return (
    <SectionToggle id="ai_image" title="Image Generation" icon="image" tint="#8B5CF6">
      <Text style={styles.hint}>
        Diagrams and study images. fal uses a separate API key and does not reuse ChatGPT Plus
        login.
      </Text>

      <SettingsModelDropdown
        label="Image Generation Model"
        value={model}
        onSelect={setModel}
        options={options.map((opt) => ({
          id: opt.value,
          label: opt.label,
          group: 'Image Models',
        }))}
      />

      <Text style={[styles.label, { marginTop: 16 }]}>fal API Key</Text>
      <View style={styles.apiKeyRow}>
        <LinearTextInput
          style={[
            styles.input,
            styles.apiKeyInput,
            falValidationStatus === 'ok' && styles.inputSuccess,
            falValidationStatus === 'fail' && styles.inputError,
          ]}
          placeholder="fal key"
          placeholderTextColor={linearTheme.colors.textMuted}
          value={falApiKey}
          onChangeText={(value) => {
            setFalApiKey(value);
            setFalKeyTestResult(null);
            clearProviderValidated('fal');
          }}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={[
            styles.validateBtn,
            falValidationStatus === 'ok' && styles.validateBtnOk,
            falValidationStatus === 'fail' && styles.validateBtnFail,
          ]}
          onPress={testFalKey}
          disabled={testingFalKey}
          activeOpacity={0.8}
        >
          {testingFalKey ? (
            <ActivityIndicator size="small" color={linearTheme.colors.accent} />
          ) : (
            <Ionicons
              name={
                falValidationStatus === 'ok'
                  ? 'checkmark-circle'
                  : falValidationStatus === 'fail'
                  ? 'close-circle'
                  : 'flash-outline'
              }
              size={20}
              color={
                falValidationStatus === 'ok'
                  ? linearTheme.colors.success
                  : falValidationStatus === 'fail'
                  ? linearTheme.colors.error
                  : linearTheme.colors.accent
              }
            />
          )}
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>Validate your fal API key with fal's model catalog endpoint.</Text>
    </SectionToggle>
  );
}
