import React from 'react';
import { View } from 'react-native';
import OAuthCard from '../components/OAuthCard';
import SettingsModelDropdown from '../../../components/SettingsModelDropdown';
import { GITHUB_COPILOT_MODELS } from '../../../../../config/appConfig';
import type { CopilotState } from '../types';

interface Props {
  githubCopilot: CopilotState;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  styles: any;
}

export default function GithubCopilotSection({ githubCopilot, styles }: Props) {
  const { connected, preferredModel, setPreferredModel } = githubCopilot;

  return (
    <View style={{ marginBottom: 16 }}>
      <OAuthCard
        title="GitHub Copilot"
        purpose="Connect your GitHub Copilot account. Requires an active Copilot subscription."
        iconName="logo-github"
        slot={githubCopilot}
        styles={styles}
      >
        {connected ? (
          <View
            style={{
              marginTop: 12,
              paddingTop: 12,
              borderTopWidth: 1,
              borderTopColor: 'rgba(255,255,255,0.05)',
            }}
          >
            <SettingsModelDropdown
              label="Preferred Copilot Model"
              value={preferredModel}
              onSelect={setPreferredModel}
              options={(GITHUB_COPILOT_MODELS as readonly string[]).map((m: string) => ({
                id: m,
                label: m,
                group: 'GitHub Copilot',
              }))}
            />
          </View>
        ) : null}
      </OAuthCard>
    </View>
  );
}
