import React from 'react';
import { View, TouchableOpacity, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme } from '../../../../../theme/linearTheme';
import LinearTextInput from '../../../../../components/primitives/LinearTextInput';
import LinearText from '../../../../../components/primitives/LinearText';
import { SettingsStatusPill } from '../../../components/SettingsStatusPill';
import type { VertexKeyField } from '../types';

type AuthMode = 'apiKey' | 'serviceAccount';

interface Props extends VertexKeyField {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  styles: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  clearProviderValidated?: (id: any) => void;
  providerId?: string;
}

export default function VertexKeyRow({
  project,
  setProject,
  location,
  setLocation,
  token,
  setToken,
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

  // Infer initial mode: if project+location are set, assume service account
  const [authMode, setAuthMode] = React.useState<AuthMode>(
    project.trim() && location.trim() ? 'serviceAccount' : 'apiKey',
  );

  const hasCredentials =
    authMode === 'apiKey'
      ? Boolean(token.trim())
      : Boolean(project.trim() && location.trim() && token.trim());

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

  const clearValidation = () => {
    setTestResult(null);
    if (clearProviderValidated && providerId) {
      clearProviderValidated(providerId);
    }
  };

  const switchMode = (mode: AuthMode) => {
    if (mode === authMode) return;
    setAuthMode(mode);
    // Clear project/location when switching to API key mode
    if (mode === 'apiKey') {
      setProject('');
      setLocation('');
    }
    clearValidation();
  };

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
              name="prism-outline"
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
              Vertex AI
            </LinearText>
            <LinearText variant="caption" tone="muted" style={{ marginTop: 1 }}>
              {authMode === 'apiKey'
                ? 'Google AI API key authentication'
                : 'Google Cloud project credentials'}
            </LinearText>
          </View>
        </View>
        <SettingsStatusPill label={statusLabel} tone={statusTone} />
      </View>

      {/* ── Auth mode toggle ────────────────── */}
      <View style={modeToggleStyles.row}>
        {(['apiKey', 'serviceAccount'] as const).map((mode) => {
          const active = authMode === mode;
          return (
            <TouchableOpacity
              key={mode}
              style={[modeToggleStyles.chip, active && modeToggleStyles.chipActive]}
              onPress={() => switchMode(mode)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={mode === 'apiKey' ? 'key-outline' : 'server-outline'}
                size={12}
                color={active ? linearTheme.colors.accent : linearTheme.colors.textMuted}
              />
              <LinearText
                variant="caption"
                style={{
                  fontWeight: active ? '700' : '500',
                  color: active ? linearTheme.colors.accent : linearTheme.colors.textMuted,
                }}
              >
                {mode === 'apiKey' ? 'API Key' : 'Service Account'}
              </LinearText>
            </TouchableOpacity>
          );
        })}
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
          {authMode === 'serviceAccount' && (
            <>
              <LinearTextInput
                containerStyle={[styles.apiKeyInput, { width: '100%' }]}
                placeholder="Project ID (e.g. my-gcp-project)"
                placeholderTextColor={linearTheme.colors.textMuted}
                value={project}
                onChangeText={(value) => {
                  setProject(value);
                  clearValidation();
                }}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <LinearTextInput
                containerStyle={[styles.apiKeyInput, { width: '100%' }]}
                placeholder="Location (e.g. us-central1)"
                placeholderTextColor={linearTheme.colors.textMuted}
                value={location}
                onChangeText={(value) => {
                  setLocation(value);
                  clearValidation();
                }}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </>
          )}
          <LinearTextInput
            containerStyle={[styles.apiKeyInput, { width: '100%' }]}
            placeholder={
              authMode === 'apiKey' ? 'API Key (AIzaSy...)' : 'Access Token / Service Account JSON'
            }
            placeholderTextColor={linearTheme.colors.textMuted}
            value={token}
            onChangeText={(value) => {
              setToken(value);
              clearValidation();
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

const modeToggleStyles = {
  row: {
    flexDirection: 'row' as const,
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: linearTheme.colors.border,
    backgroundColor: linearTheme.colors.background,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: {
    borderColor: linearTheme.colors.borderHighlight,
    backgroundColor: linearTheme.colors.primaryTintSoft,
  },
};
