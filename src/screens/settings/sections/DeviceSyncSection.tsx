import React from 'react';
import SettingsToggleRow from '../components/SettingsToggleRow';
import { useSettingsState } from '../../../hooks/useSettingsState';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
export function DeviceSyncSection(props: any) {
  const { SectionToggle } = props;
  const [bodyDoubling, setBodyDoubling] = useSettingsState('bodyDoublingEnabled', true);

  return (
    <SectionToggle id="device_sync" title="Device Sync & Body Doubling" icon="sync" tint="#38BDF8">
      <SettingsToggleRow
        label="Body doubling"
        value={bodyDoubling}
        onValueChange={setBodyDoubling}
      />
    </SectionToggle>
  );
}
