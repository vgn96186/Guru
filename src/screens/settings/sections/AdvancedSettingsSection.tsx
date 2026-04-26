import React from 'react';
import { TouchableOpacity } from 'react-native';
import LinearText from '../../../components/primitives/LinearText';
import type { SettingsSectionToggleProps } from '../components/SettingsSectionAccordion';

type AdvancedSettingsSectionProps = {
  SectionToggle: React.FC<SettingsSectionToggleProps>;
  styles: {
    testBtn: object;
    testBtnText: object;
  };
  onOpenSystemSettings: () => void;
  onOpenDevConsole: () => void;
};

export default function AdvancedSettingsSection({
  SectionToggle,
  styles,
  onOpenSystemSettings,
  onOpenDevConsole,
}: AdvancedSettingsSectionProps) {
  return (
    <SectionToggle id="adv_developer" title="Developer Options" icon="code-slash" tint="#ef4444">
      <TouchableOpacity style={styles.testBtn} onPress={onOpenSystemSettings}>
        <LinearText variant="body" style={styles.testBtnText}>
          Open System Settings
        </LinearText>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.testBtn, { marginTop: 8 }]} onPress={onOpenDevConsole}>
        <LinearText variant="body" style={styles.testBtnText}>
          Open Dev Console
        </LinearText>
      </TouchableOpacity>
    </SectionToggle>
  );
}
