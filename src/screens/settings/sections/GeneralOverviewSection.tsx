import React from 'react';
import { linearTheme } from '../../../theme/linearTheme';
import SettingsField from '../components/SettingsField';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
export function GeneralOverviewSection(props: any) {
  const { SectionToggle, name, setName } = props;

  return (
    <>
      <SectionToggle id="profile_identity" title="Identity" icon="person" tint="#8EC5FF">
        <SettingsField
          label="Your name"
          placeholder="Dr. ..."
          placeholderTextColor={linearTheme.colors.textMuted}
          value={name}
          onChangeText={setName}
        />
      </SectionToggle>
    </>
  );
}
