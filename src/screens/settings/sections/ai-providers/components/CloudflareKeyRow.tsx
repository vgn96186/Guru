import React from 'react';
import { View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme } from '../../../../../theme/linearTheme';
import LinearTextInput from '../../../../../components/primitives/LinearTextInput';
import SettingsLabel from '../../../components/SettingsLabel';
import type { CloudflareKeyField } from '../types';

interface Props extends CloudflareKeyField {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  styles: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  clearProviderValidated?: (id: any) => void;
  providerId?: string;
}

export default function CloudflareKeyRow({
  accountId,
  setAccountId,
  apiToken,
  setApiToken,
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
      <SettingsLabel text="Cloudflare AI" />
      <View style={styles.apiKeyRow}>
        <View style={{ flex: 1, gap: 8 }}>
          <LinearTextInput
            style={[styles.input, styles.apiKeyInput, { width: '100%' }]}
            placeholder="Account ID"
            placeholderTextColor={linearTheme.colors.textMuted}
            value={accountId}
            onChangeText={(value) => {
              setAccountId(value);
              setTestResult(null);
              if (clearProviderValidated && providerId) {
                clearProviderValidated(providerId);
              }
            }}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <LinearTextInput
            style={[styles.input, styles.apiKeyInput, { width: '100%' }]}
            placeholder="API Token (Workers AI Read)"
            placeholderTextColor={linearTheme.colors.textMuted}
            value={apiToken}
            onChangeText={(value) => {
              setApiToken(value);
              setTestResult(null);
              if (clearProviderValidated && providerId) {
                clearProviderValidated(providerId);
              }
            }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <TouchableOpacity
          style={[
            styles.validateBtn,
            validationStatus === 'valid' && styles.validateBtnOk,
            validationStatus === 'invalid' && styles.validateBtnFail,
            { alignSelf: 'stretch', height: 'auto', minHeight: 44 },
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
    </>
  );
}
