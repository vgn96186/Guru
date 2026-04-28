import { Pressable } from "react-native";
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme } from '../../../theme/linearTheme';
import LinearText from '../../../components/primitives/LinearText';
import SettingsField from '../components/SettingsField';
import type { SettingsSectionToggleProps } from '../components/SettingsSectionAccordion';

export default function ProfileSection({
  SectionToggle,
  styles,
  onNavigateDeviceLink,
  name,
  setName,
}: {
  SectionToggle: (props: SettingsSectionToggleProps) => React.ReactElement;
  styles: Record<string, object>;
  onNavigateDeviceLink: () => void;
  name: string;
  setName: (value: string) => void;
}) {
  return (
    <SectionToggle id="profile" title="Profile" icon="person-outline" tint="#8EC5FF">
      <Pressable
        style={[
          styles.testBtn,
          { marginTop: 0, marginBottom: 16, borderColor: `${linearTheme.colors.success}55` },
        ]}
        onPress={onNavigateDeviceLink}
      >
        <LinearText
          variant="body"
          style={[styles.testBtnText, { color: linearTheme.colors.success }]}
        >
          <Ionicons
            name="phone-portrait-outline"
            size={16}
            color={linearTheme.colors.success}
            style={{ marginRight: 6 }}
          />
          Link Another Device (Sync)
        </LinearText>
      </Pressable>
      <SettingsField
        label="Your name"
        placeholder="Dr. ..."
        placeholderTextColor={linearTheme.colors.textMuted}
        value={name}
        onChangeText={setName}
      />
    </SectionToggle>
  );
}
