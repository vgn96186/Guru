import React from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  showDialog,
  showError,
  showSuccess,
  showWarning,
  showInfo,
  confirmDestructive,
} from '../../../components/dialogService';
import { showToast } from '../../../components/Toast';
import LinearTextInput from '../../../components/primitives/LinearTextInput';
import LinearText from '../../../components/primitives/LinearText';
import { linearTheme, linearTheme as n } from '../../../theme/linearTheme';
import type { AutoBackupFrequency } from '../../../services/unifiedBackupService';

export default function StorageSections(props: any) {
  const {
    styles,
    SectionToggle,
    navigation,
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
      <LinearText variant="sectionTitle" tone="muted" style={styles.categoryLabel}>
        STORAGE
      </LinearText>
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
          <LinearText variant="body" style={styles.dangerBtnText}>
            Clear AI Content Cache
          </LinearText>
        </TouchableOpacity>
        <LinearText variant="body" tone="muted" style={styles.hint}>
          Forces fresh generation of all key points, quizzes, stories, etc.
        </LinearText>
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
          <LinearText
            variant="body"
            style={[styles.dangerBtnText, { color: linearTheme.colors.error }]}
          >
            Reset All Progress
          </LinearText>
        </TouchableOpacity>
        <LinearText variant="body" tone="muted" style={styles.hint}>
          Wipes XP, streaks, topic statuses, and daily logs. API keys are kept.
        </LinearText>
        <TouchableOpacity
          style={styles.settingRow}
          onPress={() => navigation.navigate('FlaggedContent' as never)}
          activeOpacity={0.7}
        >
          <View style={styles.settingRowLeft}>
            <Ionicons name="flag" size={18} color={linearTheme.colors.error} />
            <LinearText variant="body">Flagged Content Review</LinearText>
          </View>
          <Ionicons name="chevron-forward" size={16} color={linearTheme.colors.textMuted} />
        </TouchableOpacity>
        <LinearText variant="body" tone="muted" style={styles.hint}>
          Review topics flagged during lectures for targeted revision.
        </LinearText>
      </SectionToggle>

      <SectionToggle
        id="unified_backup"
        title="Unified Backup & Restore"
        icon="archive-outline"
        tint="#4CAF50"
      >
        <LinearText variant="body" tone="muted" style={styles.hint}>
          Export your entire study data (database, transcripts, images) to a single .guru backup
          file, or restore from a previous backup.
        </LinearText>
        {profile?.lastAutoBackupAt && (
          <LinearText variant="caption" style={styles.backupDate}>
            Last auto-backup: {new Date(profile.lastAutoBackupAt).toLocaleString()}
          </LinearText>
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
                showError(e, 'Unknown error');
              } finally {
                setBackupBusy(false);
              }
            }}
          >
            {backupBusy ? (
              <ActivityIndicator size="small" color={linearTheme.colors.textPrimary} />
            ) : (
              <LinearText variant="body" style={styles.backupBtnText}>
                Create Full Backup
              </LinearText>
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
              const ok = await confirmDestructive(
                'Restore from backup?',
                'This will overwrite your current data with data from the .guru backup file. You can selectively restore settings, progress, transcripts, and images.',
                { confirmLabel: 'Restore' },
              );
              if (!ok) return;

              setBackupBusy(true);
              try {
                const res = await importUnifiedBackup();
                if (res.ok) {
                  showSuccess('Restored!', res.message);
                  refreshProfile();
                } else {
                  showError(res.message, 'Import failed');
                }
              } catch (e: any) {
                showError(e, 'Import failed');
              } finally {
                setBackupBusy(false);
              }
            }}
          >
            <LinearText
              variant="body"
              style={[styles.backupBtnText, { color: linearTheme.colors.success }]}
            >
              Restore from Backup
            </LinearText>
          </TouchableOpacity>
        </View>

        <View style={styles.subSectionDivider} />
        <LinearText variant="label" style={styles.subSectionLabel}>
          Auto-Backup Frequency
        </LinearText>
        <LinearText variant="body" tone="muted" style={styles.hint}>
          Automatically create backups when the app starts.
        </LinearText>
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
              <LinearText
                variant="body"
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
              </LinearText>
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
          <LinearText variant="body" style={styles.maintenanceBtnText}>
            Run Auto-Backup Now
          </LinearText>
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
          <LinearText variant="body" style={styles.maintenanceBtnText}>
            Clean Up Old Backups
          </LinearText>
        </TouchableOpacity>

        <View style={styles.subSectionDivider} />
        <LinearText variant="label" style={styles.subSectionLabel}>
          Google Drive Sync
        </LinearText>
        <LinearText variant="body" tone="muted" style={styles.hint}>
          Back up to Google Drive to sync between devices and survive app reinstalls.
        </LinearText>
        <LinearText variant="label" style={[styles.label, { marginTop: 12 }]}>
          Google Web Client ID
        </LinearText>
        <LinearText variant="body" tone="muted" style={styles.hint}>
          Paste your Google OAuth Web application client ID here once. Guru stores it in your
          profile so future sign-ins do not require a rebuild.
        </LinearText>
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
            <LinearText variant="caption" style={[styles.backupDate, { marginBottom: 8 }]}>
              Connected: {(profile as any)?.gdriveEmail || 'Google Account'}
            </LinearText>
            {(profile as any)?.gdriveLastSyncAt && (
              <LinearText variant="caption" style={styles.backupDate}>
                Last sync: {new Date((profile as any).gdriveLastSyncAt).toLocaleString()}
              </LinearText>
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
                      showSuccess('Synced', 'Backup uploaded to Google Drive.');
                    } else {
                      showError('Could not create or upload backup.', 'Sync failed');
                    }
                  } catch (e: any) {
                    showError(e, 'Sync failed');
                  } finally {
                    setBackupBusy(false);
                  }
                }}
              >
                <LinearText variant="body" style={styles.backupBtnText}>
                  Sync Now
                </LinearText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.backupBtn,
                  { borderColor: linearTheme.colors.error },
                  backupBusy && styles.saveBtnDisabled,
                ]}
                disabled={backupBusy}
                activeOpacity={0.8}
                onPress={async () => {
                  const ok = await confirmDestructive(
                    'Disconnect Google Drive?',
                    'Auto-sync will stop. Your existing backups on Drive will remain.',
                    { confirmLabel: 'Disconnect' },
                  );
                  if (!ok) return;
                  try {
                    await signOutGDrive();
                    refreshProfile();
                  } catch (e: any) {
                    showError(e, 'Failed to disconnect');
                  }
                }}
              >
                <LinearText
                  variant="body"
                  style={[styles.backupBtnText, { color: linearTheme.colors.error }]}
                >
                  Disconnect
                </LinearText>
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
                showWarning(
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
                showSuccess(
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
                    showInfo(
                      'Google Sign-In: Developer error',
                      'Troubleshooting:\n\n1. In Google Cloud, create an Android OAuth client for package com.anonymous.gurustudy.\n2. Add SHA-1 and SHA-256 for your signing key (debug and release if needed).\n3. Keep this Web Client ID and Android client in the same Google project.\n4. Ensure OAuth consent screen is configured and your Google account is added as a test user.\n5. Uninstall/reinstall the app and retry sign-in.',
                    );
                  } else {
                    showError(e, 'Could not connect to Google Drive');
                  }
                }
              } finally {
                setBackupBusy(false);
              }
            }}
          >
            <LinearText variant="body" style={styles.backupBtnText}>
              Connect Google Drive
            </LinearText>
          </TouchableOpacity>
        )}
      </SectionToggle>

      <SectionToggle
        id="advanced"
        title="Library Maintenance"
        icon="construct-outline"
        tint="#8080A0"
      >
        <LinearText variant="body" tone="muted" style={styles.hint}>
          Run repair and recovery only when you need it instead of during startup.
        </LinearText>
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
            <LinearText variant="body" style={styles.maintenanceBtnText}>
              Retry failed lecture processing
            </LinearText>
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
            <LinearText variant="body" style={styles.maintenanceBtnText}>
              Repair legacy lecture notes
            </LinearText>
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
            <LinearText variant="body" style={styles.maintenanceBtnText}>
              Recover orphan transcripts
            </LinearText>
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
            <LinearText variant="body" style={styles.maintenanceBtnText}>
              Recover orphan recordings
            </LinearText>
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
            <LinearText variant="body" style={styles.maintenanceBtnText}>
              Clean up failed AI artifacts
            </LinearText>
          )}
        </TouchableOpacity>
      </SectionToggle>
    </>
  );
}
