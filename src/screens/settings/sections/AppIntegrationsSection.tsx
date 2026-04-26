import React from 'react';
import { Platform } from 'react-native';
import SettingsPermissionRow from '../components/SettingsPermissionRow';
import SettingsLinkedAppRow from '../components/SettingsLinkedAppRow';
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
      <SectionToggle id="integ_links" title="External Study Apps" icon="link" tint="#10B981">
        <SettingsLinkedAppRow
          label="DBMCI One"
          linked={Boolean(profile?.dbmciClassStartDate)}
          since={profile?.dbmciClassStartDate}
        />
        <SettingsLinkedAppRow
          label="BTR App"
          linked={Boolean(profile?.btrStartDate)}
          since={profile?.btrStartDate}
        />
      </SectionToggle>

      <SectionToggle id="integ_permissions" title="Permissions" icon="key" tint="#FBBF24">
        <SettingsPermissionRow
          label="Notifications"
          icon="notifications-outline"
          status={permStatus.notifs}
          onFix={onRequestNotifications}
        />
        <SettingsPermissionRow
          label="Microphone"
          icon="mic-outline"
          status={permStatus.mic}
          onFix={onRequestMic}
        />
        {Platform.OS === 'android' && (
          <SettingsPermissionRow
            label="File Access"
            icon="folder-open-outline"
            status={permStatus.localFiles}
            onFix={onRequestLocalFiles}
          />
        )}
        {Platform.OS === 'android' && (
          <SettingsPermissionRow
            label="Draw Over Apps"
            icon="albums-outline"
            status={permStatus.overlay}
            onFix={onRequestOverlay}
          />
        )}
      </SectionToggle>
    </>
  );
}
