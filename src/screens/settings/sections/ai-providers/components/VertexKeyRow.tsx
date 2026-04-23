import React from 'react';
import { View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme } from '../../../../../theme/linearTheme';
import LinearTextInput from '../../../../../components/primitives/LinearTextInput';
import SettingsLabel from '../../../components/SettingsLabel';
import type { VertexKeyField } from '../types';

interface Props extends VertexKeyField {
  styles: any;
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
  return (
    <>
      <SettingsLabel text="Vertex AI" />
      <View style={styles.apiKeyRow}>
        <View style={{ flex: 1, gap: 8 }}>
          <LinearTextInput
            style={[styles.input, styles.apiKeyInput, { width: '100%' }]}
            placeholder="Project ID (e.g. my-gcp-project)"
            placeholderTextColor={linearTheme.colors.textMuted}
            value={project}
            onChangeText={(value) => {
              setProject(value);
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
            placeholder="Location (e.g. us-central1)"
            placeholderTextColor={linearTheme.colors.textMuted}
            value={location}
            onChangeText={(value) => {
              setLocation(value);
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
            placeholder="Access Token / Service Account JSON"
            placeholderTextColor={linearTheme.colors.textMuted}
            value={token}
            onChangeText={(value) => {
              setToken(value);
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
