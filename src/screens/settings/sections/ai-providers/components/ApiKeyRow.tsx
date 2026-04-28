import React from 'react';
import { View, Text, ActivityIndicator, useWindowDimensions, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme } from '../../../../../theme/linearTheme';
import LinearTextInput from '../../../../../components/primitives/LinearTextInput';
import LinearText from '../../../../../components/primitives/LinearText';
import { SettingsStatusPill } from '../../../components/SettingsStatusPill';
import type { ApiKeyField } from '../types';

interface Props extends ApiKeyField {
  label: string;
  placeholder: string;
  purpose?: string;
  hint?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  styles: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  clearProviderValidated?: (id: any) => void;
  providerId?: string;
}

/** Maps provider labels to icon names for visual distinction */
const PROVIDER_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Groq: 'flash-outline',
  'AI Studio': 'diamond-outline',
  OpenRouter: 'git-network-outline',
  DeepSeek: 'telescope-outline',
  'GitHub Models': 'logo-github',
  Deepgram: 'mic-outline',
  'fal.ai': 'image-outline',
  'Brave Search': 'compass-outline',
  Kilo: 'cube-outline',
  AgentRouter: 'shuffle-outline',
};

export default function ApiKeyRow({
  label,
  placeholder,
  purpose,
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
  const { width } = useWindowDimensions();
  const stackValidate = width < 520;
  const hasValue = value.trim().length > 0;

  const statusLabel =
    validationStatus === 'valid'
      ? 'Validated'
      : validationStatus === 'invalid'
        ? 'Failed'
        : hasValue
          ? 'Needs test'
          : 'Not set';
  const statusTone =
    validationStatus === 'valid'
      ? 'success'
      : validationStatus === 'invalid'
        ? 'error'
        : hasValue
          ? 'warning'
          : 'muted';

  const iconName = PROVIDER_ICONS[label] || 'key-outline';

  return (
    <View style={styles.apiKeyCard}>
      {/* ── Header: icon + label + status ───── */}
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
                  : hasValue
                    ? linearTheme.colors.accent + '18'
                    : 'rgba(255,255,255,0.04)',
            }}
          >
            <Ionicons
              name={iconName}
              size={15}
              color={
                validationStatus === 'valid'
                  ? linearTheme.colors.success
                  : hasValue
                    ? linearTheme.colors.accent
                    : linearTheme.colors.textMuted
              }
            />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <LinearText variant="label" style={{ fontWeight: '700' }}>
              {label}
            </LinearText>
            {purpose ? (
              <LinearText variant="caption" tone="muted" style={{ marginTop: 1 }}>
                {purpose}
              </LinearText>
            ) : null}
          </View>
        </View>
        <SettingsStatusPill label={statusLabel} tone={statusTone} />
      </View>

      {/* ── Hint ───────────────────────────── */}
      {hint ? (
        <LinearText variant="caption" tone="muted" style={{ marginBottom: 8 }}>
          {hint}
        </LinearText>
      ) : null}

      {/* ── Input + validate button ────────── */}
      <View style={[styles.apiKeyRow, stackValidate && styles.apiKeyRowStacked]}>
        <LinearTextInput
          containerStyle={styles.apiKeyInput}
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
        <Pressable
          style={[
            styles.validateBtn,
            stackValidate && styles.validateBtnWide,
            validationStatus === 'valid' && styles.validateBtnOk,
            validationStatus === 'invalid' && styles.validateBtnFail,
          ]}
          onPress={test}
          disabled={testing}
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
        </Pressable>
      </View>

      {/* ── Validation error ───────────────── */}
      {validationStatus === 'invalid' ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginTop: 8,
            paddingHorizontal: 2,
          }}
        >
          <Ionicons name="alert-circle" size={14} color={linearTheme.colors.error} />
          <Text style={[styles.hint, { color: linearTheme.colors.error, marginBottom: 0 }]}>
            Validation failed. Check the key and try again.
          </Text>
        </View>
      ) : null}
    </View>
  );
}
