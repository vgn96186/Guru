import React from 'react';
import { View, Platform } from 'react-native';
import SettingsPermissionRow from '../components/SettingsPermissionRow';
import LinearText from '../../../components/primitives/LinearText';
import { useProfileQuery } from '../../../hooks/queries/useProfile';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
export function AppIntegrationsSection(props: any) {
  const {
    SectionToggle,
    permStatus,
    onRequestNotifications,
    onRequestMic,
    onRequestLocalFiles,
    onRequestOverlay,
  } = props;
  const { data: profile } = useProfileQuery();

  return (
    <>
      <SectionToggle id="integ_links" title="Integrations & Links" icon="link" tint="#10B981">
        {/* Placeholder for DBMCI/BTR links/Drive Sync like in mockup */}
        <View className="mb-2 p-3 rounded-lg border border-[rgba(255, 255, 255, 0.08)] bg-[rgba(255, 255, 255, 0.03)]">
          <LinearText variant="body" tone="primary">
            {profile?.dbmciClassStartDate
              ? `DBMCI One (Linked: ${profile.dbmciClassStartDate})`
              : 'DBMCI One (Not linked)'}
          </LinearText>
        </View>
        <View className="p-3 rounded-lg border border-[rgba(255, 255, 255, 0.08)] bg-[rgba(255, 255, 255, 0.03)]">
          <LinearText variant="body" tone="primary">
            {profile?.btrStartDate
              ? `BTR App (Linked: ${profile.btrStartDate})`
              : 'BTR App (Not linked)'}
          </LinearText>
        </View>
      </SectionToggle>

      <SectionToggle
        id="integ_permissions"
        title="Permissions & Diagnostics"
        icon="key"
        tint="#FBBF24"
      >
        <SettingsPermissionRow
          label="Notifications"
          status={permStatus.notifs}
          onFix={onRequestNotifications}
        />
        <SettingsPermissionRow
          label="Microphone (Audio)"
          status={permStatus.mic}
          onFix={onRequestMic}
        />
        {Platform.OS === 'android' && (
          <SettingsPermissionRow
            label="Local File Access (Audio Imports)"
            status={permStatus.localFiles}
            onFix={onRequestLocalFiles}
          />
        )}
        {Platform.OS === 'android' && (
          <SettingsPermissionRow
            label="Draw Over Apps (Break Overlay)"
            status={permStatus.overlay}
            onFix={onRequestOverlay}
          />
        )}
      </SectionToggle>
    </>
  );
}
