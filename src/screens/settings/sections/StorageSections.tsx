import React from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { showDialog } from '../../../components/dialogService';
import { showToast } from '../../../components/Toast';
import LinearTextInput from '../../../components/primitives/LinearTextInput';
import { linearTheme, linearTheme as n } from '../../../theme/linearTheme';
import type { AutoBackupFrequency } from '../../../services/unifiedBackupService';

export default function StorageSections(props: any) {
  const {
    styles,
    SectionToggle,
    profile,
    backupBusy,
    setBackupBusy,
    refreshProfile,
    clearAiCache,
    resetStudyProgress,
    exportUnifiedBackup,
    importUnifiedBackup,
    updateUserProfile,
    autoBackupFrequency,
    setAutoBackupFrequency,
    runAutoBackup,
    cleanupOldBackups,
    profileRepository,
    gdriveWebClientId,
    setGdriveWebClientId,
    GOOGLE_WEB_CLIENT_ID,
    signInToGDrive,
    signOutGDrive,
    maintenanceBusy,
    runMaintenanceTask,
    getUserProfile,
  } = props;

  return (
    <>
      <Text style={styles.categoryLabel}>STORAGE</Text>
      <SectionToggle id="data" title="Data" icon="trash-outline" tint="#F44336">
        <TouchableOpacity
          style={styles.dangerBtn}
          onPress={async () => {
            const result = await showDialog({
              title: 'Clear AI Cache?',
              message: 'All cached content cards will be regenerated fresh on next use.',
              variant: 'warning',
              actions: [
                { id: 'cancel', label: 'Cancel', variant: 'secondary' },
                {
                  id: 'clear-ai-cache',
                  label: 'Clear',
                  variant: 'destructive',
                  isDestructive: true,
                },
              ],
              allowDismiss: true,
            });

            if (result !== 'clear-ai-cache') return;

            clearAiCache();
            showToast({
              title: 'Done',
              message: 'AI cache cleared.',
              variant: 'success',
            });
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.dangerBtnText}>Clear AI Content Cache</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>
          Forces fresh generation of all key points, quizzes, stories, etc.
        </Text>
        <TouchableOpacity
          style={[
            styles.dangerBtn,
            { borderColor: linearTheme.colors.error + '55', marginTop: 10 },
          ]}
          onPress={async () => {
            const result = await showDialog({
              title: 'Reset all progress?',
              message:
                'This clears all topic progress, XP, streaks, and daily logs. This cannot be undone. Export a backup first.',
              variant: 'destructive',
              actions: [
                { id: 'cancel', label: 'Cancel', variant: 'secondary' },
                {
                  id: 'reset-progress',
                  label: 'Reset',
                  variant: 'destructive',
                  isDestructive: true,
                },
              ],
              allowDismiss: true,
            });

            if (result !== 'reset-progress') return;

            resetStudyProgress();
            refreshProfile();
            showToast({
              title: 'Reset',
              message: 'Progress has been wiped. Start fresh!',
              variant: 'success',
            });
          }}
          activeOpacity={0.8}
        >
          <Text style={[styles.dangerBtnText, { color: linearTheme.colors.error }]}>
            Reset All Progress
          </Text>
        </TouchableOpacity>
        <Text style={styles.hint}>
          Wipes XP, streaks, topic statuses, and daily logs. API keys are kept.
        </Text>
      </SectionToggle>

      <SectionToggle
        id="unified_backup"
        title="Unified Backup & Restore"
        icon="archive-outline"
        tint="#4CAF50"
      >
        <Text style={styles.hint}>
          Export your entire study data (database, transcripts, images) to a single .guru backup
          file, or restore from a previous backup.
        </Text>
        {profile?.lastAutoBackupAt && (
          <Text style={styles.backupDate}>
            Last auto-backup: {new Date(profile.lastAutoBackupAt).toLocaleString()}
          </Text>
        )}
        <View style={styles.backupRow}>
          <TouchableOpacity
            style={[styles.backupBtn, backupBusy && styles.saveBtnDisabled]}
            disabled={backupBusy}
            activeOpacity={0.8}
            onPress={async () => {
              setBackupBusy(true);
              try {
                const success = await exportUnifiedBackup();
                if (success) {
                  const now = new Date().toISOString();
                  updateUserProfile({ lastBackupDate: now } as any);
                  refreshProfile();
                }
              } catch (e: any) {
                Alert.alert('Export failed', e?.message ?? 'Unknown error');
              } finally {
                setBackupBusy(false);
              }
            }}
          >
            {backupBusy ? (
              <ActivityIndicator size="small" color={linearTheme.colors.textPrimary} />
            ) : (
              <Text style={styles.backupBtnText}>Create Full Backup</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.backupBtn,
              { borderColor: linearTheme.colors.success + '55' },
              backupBusy && styles.saveBtnDisabled,
            ]}
            disabled={backupBusy}
            activeOpacity={0.8}
            onPress={async () => {
              Alert.alert(
                'Restore from backup?',
                'This will overwrite your current data with data from the .guru backup file. You can selectively restore settings, progress, transcripts, and images.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Restore',
                    style: 'destructive',
                    onPress: async () => {
                      setBackupBusy(true);
                      try {
                        const res = await importUnifiedBackup();
                        Alert.alert(res.ok ? 'Restored!' : 'Import failed', res.message);
                        if (res.ok) refreshProfile();
                      } catch (e: any) {
                        Alert.alert('Import failed', e?.message ?? 'Unknown error');
                      } finally {
                        setBackupBusy(false);
                      }
                    },
                  },
                ],
              );
            }}
          >
            <Text style={[styles.backupBtnText, { color: linearTheme.colors.success }]}>
              Restore from Backup
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.subSectionDivider} />
        <Text style={styles.subSectionLabel}>Auto-Backup Frequency</Text>
        <Text style={styles.hint}>Automatically create backups when the app starts.</Text>
        <View style={styles.frequencyRow}>
          {(['off', 'daily', '3days', 'weekly', 'monthly'] as AutoBackupFrequency[]).map((freq) => (
            <TouchableOpacity
              key={freq}
              style={[
                styles.frequencyChip,
                autoBackupFrequency === freq && styles.frequencyChipActive,
              ]}
              onPress={() => setAutoBackupFrequency(freq)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.frequencyChipText,
                  autoBackupFrequency === freq && styles.frequencyChipTextActive,
                ]}
              >
                {freq === 'off'
                  ? 'Off'
                  : freq === '3days'
                    ? '3 Days'
                    : freq.charAt(0).toUpperCase() + freq.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={[styles.maintenanceBtn, backupBusy && styles.saveBtnDisabled]}
          disabled={backupBusy}
          activeOpacity={0.8}
          onPress={async () => {
            const result = await showDialog({
              title: 'Run Auto-Backup Now?',
              message: 'This will create an automatic backup regardless of your frequency setting.',
              variant: 'focus',
              actions: [
                { id: 'cancel', label: 'Cancel', variant: 'secondary' },
                { id: 'run-auto-backup', label: 'Run Backup', variant: 'primary' },
              ],
              allowDismiss: true,
            });

            if (result !== 'run-auto-backup') return;

            setBackupBusy(true);
            try {
              const success = await runAutoBackup();
              if (success) {
                const now = new Date().toISOString();
                await profileRepository.updateProfile({ lastAutoBackupAt: now } as any);
                refreshProfile();
                showToast({
                  title: 'Auto-backup complete',
                  message: 'Automatic backup finished successfully.',
                  variant: 'success',
                });
              } else {
                showToast({
                  title: 'Failed',
                  message: 'Auto-backup failed. Check logs for details.',
                  variant: 'error',
                });
              }
            } catch (e: any) {
              showToast({
                title: 'Failed',
                message: e?.message ?? 'Unknown error',
                variant: 'error',
              });
            } finally {
              setBackupBusy(false);
            }
          }}
        >
          <Text style={styles.maintenanceBtnText}>Run Auto-Backup Now</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.maintenanceBtn, backupBusy && styles.saveBtnDisabled]}
          disabled={backupBusy}
          activeOpacity={0.8}
          onPress={async () => {
            setBackupBusy(true);
            try {
              await cleanupOldBackups(5);
              showToast({
                title: 'Cleanup complete',
                message: 'Old backups have been cleaned up.',
                variant: 'success',
              });
            } catch (e: any) {
              showToast({
                title: 'Cleanup failed',
                message: e?.message ?? 'Unknown error',
                variant: 'error',
              });
            } finally {
              setBackupBusy(false);
            }
          }}
        >
          <Text style={styles.maintenanceBtnText}>Clean Up Old Backups</Text>
        </TouchableOpacity>

        <View style={styles.subSectionDivider} />
        <Text style={styles.subSectionLabel}>Google Drive Sync</Text>
        <Text style={styles.hint}>
          Back up to Google Drive to sync between devices and survive app reinstalls.
        </Text>
        <Text style={[styles.label, { marginTop: 12 }]}>Google Web Client ID</Text>
        <Text style={styles.hint}>
          Paste your Google OAuth Web application client ID here once. Guru stores it in your
          profile so future sign-ins do not require a rebuild.
        </Text>
        <LinearTextInput
          value={gdriveWebClientId}
          onChangeText={setGdriveWebClientId}
          placeholder="Your Google Web Client ID"
          placeholderTextColor={linearTheme.colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!backupBusy}
          style={{
            borderWidth: 1,
            borderColor: linearTheme.colors.border,
            backgroundColor: linearTheme.colors.surface,
            color: linearTheme.colors.textPrimary,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 12,
            marginTop: 8,
          }}
        />
        {(profile as any)?.gdriveConnected ? (
          <View>
            <Text style={[styles.backupDate, { marginBottom: 8 }]}>
              Connected: {(profile as any)?.gdriveEmail || 'Google Account'}
            </Text>
            {(profile as any)?.gdriveLastSyncAt && (
              <Text style={styles.backupDate}>
                Last sync: {new Date((profile as any).gdriveLastSyncAt).toLocaleString()}
              </Text>
            )}
            <View style={styles.backupRow}>
              <TouchableOpacity
                style={[styles.backupBtn, backupBusy && styles.saveBtnDisabled]}
                disabled={backupBusy}
                activeOpacity={0.8}
                onPress={async () => {
                  setBackupBusy(true);
                  try {
                    const success = await runAutoBackup();
                    if (success) {
                      refreshProfile();
                      Alert.alert('Synced', 'Backup uploaded to Google Drive.');
                    } else {
                      Alert.alert('Sync failed', 'Could not create or upload backup.');
                    }
                  } catch (e: any) {
                    Alert.alert('Sync failed', e?.message ?? 'Unknown error');
                  } finally {
                    setBackupBusy(false);
                  }
                }}
              >
                <Text style={styles.backupBtnText}>Sync Now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.backupBtn,
                  { borderColor: linearTheme.colors.error },
                  backupBusy && styles.saveBtnDisabled,
                ]}
                disabled={backupBusy}
                activeOpacity={0.8}
                onPress={() => {
                  Alert.alert(
                    'Disconnect Google Drive?',
                    'Auto-sync will stop. Your existing backups on Drive will remain.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Disconnect',
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            await signOutGDrive();
                            refreshProfile();
                          } catch (e: any) {
                            Alert.alert('Error', e?.message ?? 'Failed to disconnect');
                          }
                        },
                      },
                    ],
                  );
                }}
              >
                <Text style={[styles.backupBtnText, { color: linearTheme.colors.error }]}>
                  Disconnect
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.backupBtn, { marginTop: 8 }, backupBusy && styles.saveBtnDisabled]}
            disabled={backupBusy}
            activeOpacity={0.8}
            onPress={async () => {
              const resolvedGoogleClientId =
                gdriveWebClientId.trim() ||
                GOOGLE_WEB_CLIENT_ID ||
                profile?.gdriveWebClientId?.trim();
              if (!resolvedGoogleClientId) {
                Alert.alert(
                  'Google Drive setup required',
                  'Paste your Google OAuth Web application client ID in the field above, or provide EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in your build config.',
                );
                return;
              }
              setBackupBusy(true);
              try {
                await updateUserProfile({ gdriveWebClientId: resolvedGoogleClientId } as any);
                const result = await signInToGDrive(resolvedGoogleClientId);
                refreshProfile();
                Alert.alert(
                  'Connected!',
                  `Signed in as ${result.email}. Your backups will now sync to Google Drive.`,
                );
              } catch (e: any) {
                if (e?.code !== 'SIGN_IN_CANCELLED') {
                  const code = String(e?.code ?? '');
                  const msg = String(e?.message ?? '');
                  const isDeveloperError =
                    code === '10' ||
                    code === 'DEVELOPER_ERROR' ||
                    msg.toLowerCase().includes('developer error');

                  if (isDeveloperError) {
                    Alert.alert(
                      'Google Sign-In: Developer error',
                      'Troubleshooting:\n\n1. In Google Cloud, create an Android OAuth client for package com.anonymous.gurustudy.\n2. Add SHA-1 and SHA-256 for your signing key (debug and release if needed).\n3. Keep this Web Client ID and Android client in the same Google project.\n4. Ensure OAuth consent screen is configured and your Google account is added as a test user.\n5. Uninstall/reinstall the app and retry sign-in.',
                    );
                  } else {
                    Alert.alert(
                      'Sign-in failed',
                      e?.message ?? 'Could not connect to Google Drive',
                    );
                  }
                }
              } finally {
                setBackupBusy(false);
              }
            }}
          >
            <Text style={styles.backupBtnText}>Connect Google Drive</Text>
          </TouchableOpacity>
        )}
      </SectionToggle>

      <SectionToggle
        id="advanced"
        title="Library Maintenance"
        icon="construct-outline"
        tint="#8080A0"
      >
        <Text style={styles.hint}>
          Run repair and recovery only when you need it instead of during startup.
        </Text>
        <TouchableOpacity
          style={[styles.maintenanceBtn, maintenanceBusy !== null && styles.saveBtnDisabled]}
          disabled={maintenanceBusy !== null}
          activeOpacity={0.8}
          onPress={() =>
            runMaintenanceTask(
              'retry',
              async () => {
                const { retryFailedTasks } =
                  await import('../../../services/lecture/lectureSessionMonitor');
                const activeProfile = await getUserProfile();
                return retryFailedTasks(activeProfile?.groqApiKey || undefined);
              },
              {
                done: 'Lecture retry finished',
                none: 'Lecture retry checked',
                failed: 'Lecture retry failed',
              },
            )
          }
        >
          {maintenanceBusy === 'retry' ? (
            <ActivityIndicator size="small" color={linearTheme.colors.textPrimary} />
          ) : (
            <Text style={styles.maintenanceBtnText}>Retry failed lecture processing</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.maintenanceBtn, maintenanceBusy !== null && styles.saveBtnDisabled]}
          disabled={maintenanceBusy !== null}
          activeOpacity={0.8}
          onPress={() =>
            runMaintenanceTask(
              'legacy',
              async () => {
                const { autoRepairLegacyNotes } =
                  await import('../../../services/lecture/lectureSessionMonitor');
                return autoRepairLegacyNotes();
              },
              {
                done: 'Legacy notes repaired',
                none: 'Legacy notes checked',
                failed: 'Legacy note repair failed',
              },
            )
          }
        >
          {maintenanceBusy === 'legacy' ? (
            <ActivityIndicator size="small" color={linearTheme.colors.textPrimary} />
          ) : (
            <Text style={styles.maintenanceBtnText}>Repair legacy lecture notes</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.maintenanceBtn, maintenanceBusy !== null && styles.saveBtnDisabled]}
          disabled={maintenanceBusy !== null}
          activeOpacity={0.8}
          onPress={() =>
            runMaintenanceTask(
              'transcripts',
              async () => {
                const { scanAndRecoverOrphanedTranscripts } =
                  await import('../../../services/lecture/lectureSessionMonitor');
                return scanAndRecoverOrphanedTranscripts();
              },
              {
                done: 'Orphan transcripts recovered',
                none: 'Transcript folders checked',
                failed: 'Transcript recovery failed',
              },
            )
          }
        >
          {maintenanceBusy === 'transcripts' ? (
            <ActivityIndicator size="small" color={linearTheme.colors.textPrimary} />
          ) : (
            <Text style={styles.maintenanceBtnText}>Recover orphan transcripts</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.maintenanceBtn, maintenanceBusy !== null && styles.saveBtnDisabled]}
          disabled={maintenanceBusy !== null}
          activeOpacity={0.8}
          onPress={() =>
            runMaintenanceTask(
              'recordings',
              async () => {
                const { scanAndRecoverOrphanedRecordings } =
                  await import('../../../services/lecture/lectureSessionMonitor');
                return scanAndRecoverOrphanedRecordings();
              },
              {
                done: 'Orphan recordings recovered',
                none: 'Recording folders checked',
                failed: 'Recording recovery failed',
              },
            )
          }
        >
          {maintenanceBusy === 'recordings' ? (
            <ActivityIndicator size="small" color={linearTheme.colors.textPrimary} />
          ) : (
            <Text style={styles.maintenanceBtnText}>Recover orphan recordings</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.maintenanceBtn, maintenanceBusy !== null && styles.saveBtnDisabled]}
          disabled={maintenanceBusy !== null}
          activeOpacity={0.8}
          onPress={() =>
            runMaintenanceTask(
              'cleanup_artifacts',
              async () => {
                const { cleanupFailedArtifacts } =
                  await import('../../../services/lecture/lectureSessionMonitor');
                return cleanupFailedArtifacts();
              },
              {
                done: 'Failed artifacts cleaned up',
                none: 'No failed artifacts found',
                failed: 'Artifact cleanup failed',
              },
            )
          }
        >
          {maintenanceBusy === 'cleanup_artifacts' ? (
            <ActivityIndicator size="small" color={linearTheme.colors.textPrimary} />
          ) : (
            <Text style={styles.maintenanceBtnText}>Clean up failed AI artifacts</Text>
          )}
        </TouchableOpacity>
      </SectionToggle>
    </>
  );
}
