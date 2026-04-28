import React from 'react';
import { View, ActivityIndicator, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme } from '../../../../../theme/linearTheme';
import LinearTextInput from '../../../../../components/primitives/LinearTextInput';
import SettingsModelDropdown from '../../../components/SettingsModelDropdown';
import OAuthCard from '../components/OAuthCard';
import GitlabPasteModal from './GitlabPasteModal';
import { GITLAB_DUO_MODELS } from '../../../../../config/appConfig';
import type { GitLabDuoState } from '../types';

interface Props {
  gitlabDuo: GitLabDuoState;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  styles: any;
}

export default function GitlabDuoSection({ gitlabDuo, styles }: Props) {
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
    <View style={{ marginBottom: 16 }}>
      <OAuthCard
        title="GitLab Duo"
        purpose="Connect your GitLab account to use GitLab Duo models. Requires a Pro/Enterprise subscription."
        iconName="logo-gitlab"
        slot={{
          connecting,
          connected,
          deviceCode: null, // GitLab doesn't use device code flow here, it opens browser and pastes
          connect,
          disconnect,
        }}
        styles={styles}
      >
        <View
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: 'rgba(255,255,255,0.05)',
          }}
        >
          {!connected ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <LinearTextInput
                containerStyle={{ flex: 1, marginBottom: 8 }}
                placeholder="Client ID"
                placeholderTextColor={linearTheme.colors.textMuted}
                value={clientId}
                onChangeText={setClientId}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <LinearTextInput
                containerStyle={{ flex: 1, marginBottom: 8 }}
                placeholder="Client Secret"
                placeholderTextColor={linearTheme.colors.textMuted}
                value={clientSecret}
                onChangeText={setClientSecret}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          ) : (
            <View>
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
                <Pressable
                  style={[
                    styles.validateBtn,
                    { minWidth: 140, paddingHorizontal: 16 },
                    testResult === true && styles.validateBtnOk,
                    testResult === false && styles.validateBtnFail,
                  ]}
                  onPress={validateConnection}
                  disabled={testingOAuth}
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
                </Pressable>
                <Text style={styles.hint}>Verifies API access with current token</Text>
              </View>
            </View>
          )}
        </View>
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
    </View>
  );
}
