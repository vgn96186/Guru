import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme } from '../../../../../theme/linearTheme';
import LinearTextInput from '../../../../../components/primitives/LinearTextInput';
import SettingsLabel from '../../../components/SettingsLabel';
import SettingsModelDropdown from '../../../components/SettingsModelDropdown';
import OAuthCard from '../components/OAuthCard';
import GitlabPasteModal from './GitlabPasteModal';
import { GITLAB_DUO_MODELS } from '../../../../../config/appConfig';
import type { GitLabDuoState } from '../types';

interface Props {
  gitlabDuo: GitLabDuoState;
  SubSectionToggle: any;
  styles: any;
}

export default function GitlabDuoSection({ gitlabDuo, SubSectionToggle, styles }: Props) {
  const {
    connecting,
    connected,
    connect,
    disconnect,
    clientId,
    setClientId,
    clientSecret,
    setClientSecret,
    testResult,
    validateConnection,
    testingOAuth,
    preferredModel,
    setPreferredModel,
    pasteModalVisible,
    setPasteModalVisible,
    pasteUrl,
    setPasteUrl,
    submitPasteUrl,
    pasteSubmitting,
  } = gitlabDuo;

  return (
    <SubSectionToggle id="gitlab_duo_oauth" title="GITLAB DUO (OAUTH)">
      <Text style={styles.hint}>
        Connect your GitLab account to use GitLab Duo models. Requires a GitLab Duo Pro or
        Enterprise subscription.
      </Text>

      {!connected ? (
        <View style={{ marginTop: 8 }}>
          <SettingsLabel text="GitLab Client ID" />
          <LinearTextInput
            style={[styles.input, { marginBottom: 12 }]}
            placeholder="Client ID from GitLab Application"
            placeholderTextColor={linearTheme.colors.textMuted}
            value={clientId}
            onChangeText={setClientId}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <SettingsLabel text="GitLab Client Secret" />
          <LinearTextInput
            style={[styles.input, { marginBottom: 16 }]}
            placeholder="Client Secret from GitLab Application"
            placeholderTextColor={linearTheme.colors.textMuted}
            value={clientSecret}
            onChangeText={setClientSecret}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      ) : null}

      <OAuthCard
        title="GitLab Duo Account"
        slot={{
          connecting,
          connected,
          deviceCode: null, // GitLab doesn't use device code flow here, it opens browser and pastes
          connect,
          disconnect,
        }}
        styles={styles}
      >
        {connected ? (
          <View style={{ marginTop: 12 }}>
            <SettingsModelDropdown
              label="Preferred Duo Model"
              value={preferredModel}
              onSelect={setPreferredModel}
              options={(GITLAB_DUO_MODELS as readonly string[]).map((m: string) => ({
                id: m,
                label: m,
                group: 'GitLab Duo',
              }))}
            />
            <View
              style={[
                styles.apiKeyRow,
                { marginTop: 12, justifyContent: 'flex-start', flexWrap: 'wrap' },
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.validateBtn,
                  { minWidth: 140, paddingHorizontal: 16 },
                  testResult === true && styles.validateBtnOk,
                  testResult === false && styles.validateBtnFail,
                ]}
                onPress={validateConnection}
                disabled={testingOAuth}
                activeOpacity={0.8}
              >
                {testingOAuth ? (
                  <ActivityIndicator size="small" color={linearTheme.colors.accent} />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons
                      name={
                        testResult === true
                          ? 'checkmark-circle'
                          : testResult === false
                            ? 'close-circle'
                            : 'flash-outline'
                      }
                      size={18}
                      color={
                        testResult === true
                          ? linearTheme.colors.success
                          : testResult === false
                            ? linearTheme.colors.error
                            : linearTheme.colors.accent
                      }
                    />
                    <Text
                      style={{
                        color:
                          testResult === true
                            ? linearTheme.colors.success
                            : testResult === false
                              ? linearTheme.colors.error
                              : linearTheme.colors.accent,
                        fontWeight: '600',
                        fontSize: 13,
                      }}
                    >
                      {testResult === true
                        ? 'Valid'
                        : testResult === false
                          ? 'Invalid'
                          : 'Test Connection'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <Text style={styles.hint}>Verifies API access with current token</Text>
            </View>
          </View>
        ) : null}
      </OAuthCard>

      <GitlabPasteModal
        visible={pasteModalVisible}
        onClose={() => setPasteModalVisible(false)}
        pasteUrl={pasteUrl}
        setPasteUrl={setPasteUrl}
        onSubmit={submitPasteUrl}
        submitting={pasteSubmitting}
        styles={styles}
      />
    </SubSectionToggle>
  );
}
