import React from 'react';
import SettingsToggleRow from '../components/SettingsToggleRow';
import { BentoCard } from '../../../components/settings/BentoCard';
import { useSettingsState } from '../../../hooks/useSettingsState';

export function DeviceSyncSection(props: any) {
  const [bodyDoubling, setBodyDoubling] = useSettingsState('bodyDoublingEnabled', true);

  return (
    <BentoCard title="Device Sync & Body Doubling">
      <SettingsToggleRow
        label="Guru presence during sessions"
        hint="Ambient toast messages and pulsing dot while you study. Helps with focus."
        value={bodyDoubling}
        onValueChange={setBodyDoubling}
      />
    </BentoCard>
  );
}
