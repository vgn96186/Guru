import React from 'react';
import SettingsToggleRow from '../components/SettingsToggleRow';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
export function AppearanceSection(props: any) {
  const { SectionToggle, loadingOrbStyle, setLoadingOrbStyle } = props;

  return (
    <>
      <SectionToggle id="profile_appearance" title="Appearance" icon="color-palette" tint="#EAB308">
        <SettingsToggleRow
          label="Turbulent Loading Orb"
          hint="Use the hyper-smooth fluid dynamics orb instead of the classic rings."
          value={loadingOrbStyle === 'turbulent'}
          onValueChange={(val: boolean) => setLoadingOrbStyle(val ? 'turbulent' : 'classic')}
        />
      </SectionToggle>
    </>
  );
}
