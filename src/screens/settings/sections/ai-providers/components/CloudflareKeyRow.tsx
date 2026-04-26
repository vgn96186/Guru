import React from 'react';
import { View, TouchableOpacity, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme } from '../../../../../theme/linearTheme';
import LinearTextInput from '../../../../../components/primitives/LinearTextInput';
import LinearText from '../../../../../components/primitives/LinearText';
import { SettingsStatusPill } from '../../../components/SettingsStatusPill';
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
  const { width } = useWindowDimensions();
  const stackValidate = width < 520;
  const hasCredentials = accountId.trim() && apiToken.trim();
  const statusLabel =
    validationStatus === 'valid'
      ? 'Validated'
      : validationStatus === 'invalid'
        ? 'Failed'
        : hasCredentials
          ? 'Needs test'
          : 'Not set';
  const statusTone =
    validationStatus === 'valid'
      ? 'success'
      : validationStatus === 'invalid'
        ? 'error'
        : hasCredentials
          ? 'warning'
          : 'muted';

  return (
    <View style={styles.apiKeyCard}>
      {/* ── Header ──────────────────────────── */}
      <View style={styles.apiKeyCardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, gap: 10 }}>
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor:
                validationStatus === 'valid'
                  ? linearTheme.colors.success + '18'
                  : hasCredentials
                    ? linearTheme.colors.accent + '18'
                    : 'rgba(255,255,255,0.04)',
            }}
          >
            <Ionicons
              name="cloudy-outline"
              size={15}
              color={
                validationStatus === 'valid'
                  ? linearTheme.colors.success
                  : hasCredentials
                    ? linearTheme.colors.accent
                    : linearTheme.colors.textMuted
              }
            />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <LinearText variant="label" style={{ fontWeight: '700' }}>
              Cloudflare AI
            </LinearText>
            <LinearText variant="caption" tone="muted" style={{ marginTop: 1 }}>
              Workers AI account and token
            </LinearText>
          </View>
        </View>
        <SettingsStatusPill label={statusLabel} tone={statusTone} />
      </View>

      {/* ── Inputs ──────────────────────────── */}
      <View
        style={[
          styles.apiKeyRow,
          stackValidate && styles.apiKeyRowStacked,
          { alignItems: 'flex-end' },
        ]}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
          <LinearTextInput
            containerStyle={[styles.apiKeyInput, { width: '100%' }]}
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
            containerStyle={[styles.apiKeyInput, { width: '100%' }]}
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
            stackValidate && styles.validateBtnWide,
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
    </View>
  );
}
