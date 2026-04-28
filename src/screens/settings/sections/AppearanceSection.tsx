import React from 'react';
import SettingsToggleRow from '../components/SettingsToggleRow';
import { ActionHubToolsPicker } from '../components/ActionHubToolsPicker';
import type { ActionHubToolId } from '../../../constants/actionHubTools';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
export function AppearanceSection(props: any) {
  const { SectionToggle, loadingOrbStyle, setLoadingOrbStyle, actionHubTools, setActionHubTools } =
    props;

  return (
    <>
      <SectionToggle id="profile_appearance" title="Appearance" icon="color-palette" tint="#EAB308">
        <SettingsToggleRow
          label="Turbulent Loading Orb"
          value={loadingOrbStyle === 'turbulent'}
          onValueChange={(val: boolean) => setLoadingOrbStyle(val ? 'turbulent' : 'classic')}
        />
      </SectionToggle>

      <SectionToggle id="action_hub" title="Action Hub" icon="apps" tint="#6D99FF">
        <ActionHubToolsPicker
          value={(actionHubTools ?? []) as ActionHubToolId[]}
          onChange={(next) => setActionHubTools(next)}
        />
      </SectionToggle>
    </>
  );
}
