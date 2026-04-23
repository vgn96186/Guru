import React from 'react';
import SettingsToggleRow from '../components/SettingsToggleRow';
import { useSettingsState } from '../../../hooks/useSettingsState';

export function DeviceSyncSection(props: any) {
  const { SectionToggle } = props;
  const [bodyDoubling, setBodyDoubling] = useSettingsState('bodyDoublingEnabled', true);

  return (
    <SectionToggle id="device_sync" title="Device Sync & Body Doubling" icon="sync" tint="#38BDF8">
      <SettingsToggleRow
        label="Guru presence during sessions"
        hint="Ambient toast messages and pulsing dot while you study. Helps with focus."
        value={bodyDoubling}
        onValueChange={setBodyDoubling}
      />
    </SectionToggle>
  );
}
