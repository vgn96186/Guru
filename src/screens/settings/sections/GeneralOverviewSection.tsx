import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme } from '../../../theme/linearTheme';
import LinearText from '../../../components/primitives/LinearText';
import SettingsField from '../components/SettingsField';
import SettingsToggleRow from '../components/SettingsToggleRow';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
export function GeneralOverviewSection(props: any) {
  const { styles, SectionToggle, navigation, name, setName, loadingOrbStyle, setLoadingOrbStyle } =
    props;

  return (
    <>
      <SectionToggle id="profile_identity" title="Identity" icon="person" tint="#8EC5FF">
        <TouchableOpacity
          style={[
            styles.testBtn,
            { marginTop: 0, marginBottom: 16, borderColor: `${linearTheme.colors.success}55` },
          ]}
          onPress={() => navigation.navigate('DeviceLink')}
          activeOpacity={0.8}
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
        </TouchableOpacity>
        <SettingsField
          label="Your name"
          placeholder="Dr. ..."
          placeholderTextColor={linearTheme.colors.textMuted}
          value={name}
          onChangeText={setName}
        />
      </SectionToggle>

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
