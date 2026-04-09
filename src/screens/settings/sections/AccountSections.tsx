import React from 'react';
import { ActivityIndicator, Platform, TouchableOpacity } from 'react-native';
import SettingsPermissionRow from '../components/SettingsPermissionRow';
import ProfileSection from './ProfileSection';
import SettingsLabel from '../components/SettingsLabel';
import LinearTextInput from '../../../components/primitives/LinearTextInput';
import LinearText from '../../../components/primitives/LinearText';
import { linearTheme } from '../../../theme/linearTheme';

export default function AccountSections(props: any) {
  const {
    styles,
    SectionToggle,
    navigation,
    permStatus,
    onRequestNotifications,
    onRequestMic,
    onRequestLocalFiles,
    onRequestOverlay,
    onOpenSystemSettings,
    onOpenDevConsole,
    name,
    setName,
    inicetDate,
    setInicetDate,
    neetDate,
    setNeetDate,
    handleAutoFetchDates,
    fetchingDates,
    fetchDatesMsg,
  } = props;

  return (
    <>
      <LinearText variant="sectionTitle" tone="muted" style={styles.categoryLabel}>
        ACCOUNT
      </LinearText>
      <SectionToggle
        id="permissions"
        title="Permissions & Diagnostics"
        icon="shield-checkmark-outline"
        tint="#4CAF50"
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
      </SectionToggle>

      <ProfileSection
        SectionToggle={SectionToggle}
        styles={styles}
        onNavigateDeviceLink={() => navigation.navigate('DeviceLink')}
        name={name}
        setName={setName}
      />

      <SectionToggle id="exam_dates" title="Exam Dates" icon="calendar-outline" tint="#FF9800">
        <SettingsLabel text="INICET date (YYYY-MM-DD)" />
        <LinearTextInput
          style={styles.input}
          value={inicetDate}
          onChangeText={setInicetDate}
          placeholderTextColor={linearTheme.colors.textMuted}
        />
        <SettingsLabel text="NEET-PG date (YYYY-MM-DD)" />
        <LinearTextInput
          style={styles.input}
          value={neetDate}
          onChangeText={setNeetDate}
          placeholderTextColor={linearTheme.colors.textMuted}
        />
        <TouchableOpacity
          style={[styles.autoFetchBtn, fetchingDates && styles.autoFetchBtnDisabled]}
          onPress={handleAutoFetchDates}
          disabled={fetchingDates}
          activeOpacity={0.8}
        >
          {fetchingDates ? (
            <ActivityIndicator size="small" color={linearTheme.colors.accent} />
          ) : (
            <LinearText variant="body" style={styles.autoFetchBtnText}>
              🤖 Auto-fetch dates via AI
            </LinearText>
          )}
        </TouchableOpacity>
        {fetchDatesMsg ? (
          <LinearText
            variant="body"
            style={[
              styles.hint,
              fetchDatesMsg.toLowerCase().includes('success') ||
              fetchDatesMsg.toLowerCase().includes('updated')
                ? { color: linearTheme.colors.success }
                : { color: linearTheme.colors.error },
            ]}
          >
            {fetchDatesMsg}
          </LinearText>
        ) : (
          <LinearText variant="body" tone="muted" style={styles.hint}>
            Uses AI to estimate upcoming exam dates. Always verify on nbe.edu.in.
          </LinearText>
        )}
      </SectionToggle>
    </>
  );
}
