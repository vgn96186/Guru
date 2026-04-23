import React from 'react';
import { View, TouchableOpacity, Platform } from 'react-native';
import SettingsPermissionRow from '../components/SettingsPermissionRow';
import LinearText from '../../../components/primitives/LinearText';
import { BentoCard } from '../../../components/settings/BentoCard';
import { useProfileQuery } from '../../../hooks/queries/useProfile';

export function AppIntegrationsSection(props: any) {
  const {
    styles,
    permStatus,
    onRequestNotifications,
    onRequestMic,
    onRequestLocalFiles,
    onRequestOverlay,
    onOpenSystemSettings,
    onOpenDevConsole,
  } = props;
  const { data: profile } = useProfileQuery();

  return (
    <>
      <BentoCard title="Integrations & Links" className="mb-4">
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
      </BentoCard>

      <BentoCard title="Permissions & Diagnostics" className="mb-4">
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
        <TouchableOpacity style={styles.diagBtn} onPress={onOpenSystemSettings}>
          <LinearText variant="body" style={styles.diagBtnText}>
            Open System Settings
          </LinearText>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.diagBtn, { marginTop: 8 }]} onPress={onOpenDevConsole}>
          <LinearText variant="body" style={styles.diagBtnText}>
            Open Dev Console
          </LinearText>
        </TouchableOpacity>
      </BentoCard>
    </>
  );
}
