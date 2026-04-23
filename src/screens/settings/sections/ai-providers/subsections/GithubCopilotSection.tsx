import React from 'react';
import { View, Text } from 'react-native';
import OAuthCard from '../components/OAuthCard';
import SettingsModelDropdown from '../../../components/SettingsModelDropdown';
import { GITHUB_COPILOT_MODELS } from '../../../../../config/appConfig';
import type { CopilotState } from '../types';

interface Props {
  githubCopilot: CopilotState;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  SectionToggle: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  styles: any;
}

export default function GithubCopilotSection({ githubCopilot, SectionToggle, styles }: Props) {
  const { connected, preferredModel, setPreferredModel } = githubCopilot;

  return (
    <SectionToggle id="github_copilot_oauth" title="GITHUB COPILOT">
      <Text style={styles.hint}>
        Connect your GitHub Copilot account. Requires an active Copilot subscription.
      </Text>
      <OAuthCard title="Copilot Account" slot={githubCopilot} styles={styles}>
        {connected ? (
          <View style={{ marginTop: 12 }}>
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
    </SectionToggle>
  );
}
