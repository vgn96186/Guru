import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import type { Ionicons } from '@expo/vector-icons';
import { linearTheme } from '../../../theme/linearTheme';
import LinearTextInput from '../../../components/primitives/LinearTextInput';
import SettingsLabel from '../components/SettingsLabel';

type SectionToggleProps = {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  children: React.ReactNode;
};

export default function ProfileSection({
  SectionToggle,
  styles,
  onNavigateDeviceLink,
  name,
  setName,
}: {
  SectionToggle: (props: SectionToggleProps) => React.ReactElement;
  styles: any;
  onNavigateDeviceLink: () => void;
  name: string;
  setName: (value: string) => void;
}) {
  return (
    <SectionToggle id="profile" title="Profile" icon="person-outline" tint="#8EC5FF">
      <TouchableOpacity
        style={[
          styles.testBtn,
          { marginTop: 0, marginBottom: 16, borderColor: `${linearTheme.colors.success}55` },
        ]}
        onPress={onNavigateDeviceLink}
        activeOpacity={0.8}
      >
        <Text style={[styles.testBtnText, { color: linearTheme.colors.success }]}>
          📱 Link Another Device (Sync)
        </Text>
      </TouchableOpacity>
      <SettingsLabel text="Your name" />
      <LinearTextInput
        style={styles.input}
        placeholder="Dr. ..."
        placeholderTextColor={linearTheme.colors.textMuted}
        value={name}
        onChangeText={setName}
      />
    </SectionToggle>
  );
}
