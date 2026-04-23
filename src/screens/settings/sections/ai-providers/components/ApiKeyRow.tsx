import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme } from '../../../../../theme/linearTheme';
import LinearTextInput from '../../../../../components/primitives/LinearTextInput';
import SettingsLabel from '../../../components/SettingsLabel';
import type { ApiKeyField } from '../types';

interface Props extends ApiKeyField {
  label: string;
  placeholder: string;
  hint?: string;
  styles: any;
  clearProviderValidated?: (id: any) => void;
  providerId?: string;
}

export default function ApiKeyRow({
  label,
  placeholder,
  hint,
  value,
  setValue,
  setTestResult,
  validationStatus,
  test,
  testing,
  styles,
  clearProviderValidated,
  providerId,
}: Props) {
  return (
    <>
      <SettingsLabel text={label} />
      <View style={styles.apiKeyRow}>
        <LinearTextInput
          style={[styles.input, styles.apiKeyInput]}
          placeholder={placeholder}
          placeholderTextColor={linearTheme.colors.textMuted}
          value={value}
          onChangeText={(v) => {
            setValue(v);
            setTestResult(null);
            if (clearProviderValidated && providerId) {
              clearProviderValidated(providerId);
            }
          }}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={[
            styles.validateBtn,
            validationStatus === 'valid' && styles.validateBtnOk,
            validationStatus === 'invalid' && styles.validateBtnFail,
          ]}
          onPress={test}
          disabled={testing}
          activeOpacity={0.8}
        >
          {testing ? (
            <ActivityIndicator size="small" color={linearTheme.colors.accent} />
          ) : (
            <Ionicons
              name={
                validationStatus === 'valid'
                  ? 'checkmark-circle'
                  : validationStatus === 'invalid'
                  ? 'close-circle'
                  : 'flash-outline'
              }
              size={20}
              color={
                validationStatus === 'valid'
                  ? linearTheme.colors.success
                  : validationStatus === 'invalid'
                  ? linearTheme.colors.error
                  : linearTheme.colors.accent
              }
            />
          )}
        </TouchableOpacity>
      </View>
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </>
  );
}
