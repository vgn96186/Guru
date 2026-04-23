import React from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showError, showSuccess, showWarning, showInfo } from '../../../components/dialogService';
import SettingsField from '../components/SettingsField';
import LinearText from '../../../components/primitives/LinearText';
import { linearTheme } from '../../../theme/linearTheme';
import type { AutoBackupFrequency } from '../../../services/unifiedBackupService';
import type { UserProfile } from '../../../types';
import { useSettingsState } from '../../../hooks/useSettingsState';

import {
  handleClearAiCache,
  handleResetProgress,
} from '../../../services/settings/dangerOperations';
import {
  handleExportBackup,
  handleImportBackup,
  handleRunAutoBackupNow,
  handleCleanupOldBackups,
  handleSyncGoogleDrive,
  handleDisconnectGoogleDrive,
} from '../../../services/settings/backupOperations';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return 'Unknown error';
}

function getErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code?: unknown }).code ?? '');
  }
  return '';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    runAutoBackup,
    cleanupOldBackups,
    profileRepository,

    GOOGLE_WEB_CLIENT_ID,
    signInToGDrive,
    signOutGDrive,
    maintenanceBusy,
    runMaintenanceTask,
    getUserProfile,
  } = props;

  const [autoBackupFrequency, setAutoBackupFrequency] = useSettingsState(
    'autoBackupFrequency',
    'off' as AutoBackupFrequency,
  );
  const [gdriveWebClientId, setGdriveWebClientId] = useSettingsState('gdriveWebClientId', '');

  const currentProfile = profile as UserProfile | null | undefined;

  return (
    <>
      <LinearText variant="sectionTitle" tone="muted" style={styles.categoryLabel}>
        STORAGE
      </LinearText>
      <SectionToggle id="storage_data" title="Data Management" icon="trash-outline" tint="#F44336">
        <TouchableOpacity
          style={styles.dangerBtn}
          onPress={() => handleClearAiCache(clearAiCache)}
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
          onPress={() => handleResetProgress(resetStudyProgress, refreshProfile)}
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
        id="storage_backup"
        title="Unified Backup"
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
            onPress={() =>
              handleExportBackup({
                setBackupBusy,
                exportUnifiedBackup,
                updateUserProfile,
                refreshProfile,
              })
            }
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
            onPress={() =>
              handleImportBackup({ setBackupBusy, importUnifiedBackup, refreshProfile })
            }
          >
            <LinearText
              variant="body"
              style={[styles.backupBtnText, { color: linearTheme.colors.success }]}
            >
              Restore from Backup
            </LinearText>
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 24 }}>
          <LinearText variant="label" style={styles.switchLabel}>
            Auto-Backup Frequency
          </LinearText>
          <LinearText variant="body" tone="muted" style={[styles.hint, { marginBottom: 12 }]}>
            Automatically create backups when the app starts.
          </LinearText>
          <View style={styles.frequencyRow}>
            {(['off', 'daily', '3days', 'weekly', 'monthly'] as AutoBackupFrequency[]).map(
              (freq) => (
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
              ),
            )}
          </View>
          <TouchableOpacity
            style={[styles.maintenanceBtn, backupBusy && styles.saveBtnDisabled]}
            disabled={backupBusy}
            activeOpacity={0.8}
            onPress={() =>
              handleRunAutoBackupNow({
                setBackupBusy,
                runAutoBackup,
                profileRepository,
                refreshProfile,
              })
            }
          >
            <LinearText variant="body" style={styles.maintenanceBtnText}>
              Run Auto-Backup Now
            </LinearText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.maintenanceBtn, backupBusy && styles.saveBtnDisabled]}
            disabled={backupBusy}
            activeOpacity={0.8}
            onPress={() => handleCleanupOldBackups({ setBackupBusy, cleanupOldBackups })}
          >
            <LinearText variant="body" style={styles.maintenanceBtnText}>
              Clean Up Old Backups
            </LinearText>
          </TouchableOpacity>
        </View>
      </SectionToggle>

      <SectionToggle
        id="storage_gdrive"
        title="Google Drive Sync"
        icon="logo-google"
        tint="#4285F4"
      >
        <LinearText variant="body" tone="muted" style={styles.hint}>
          Back up to Google Drive to sync between devices and survive app reinstalls.
        </LinearText>
        <SettingsField
          label="Google Web Client ID"
          hint="Paste your Google OAuth Web application client ID here once. Guru stores it in your profile so future sign-ins do not require a rebuild."
          value={gdriveWebClientId}
          onChangeText={setGdriveWebClientId}
          placeholder="Your Google Web Client ID"
          placeholderTextColor={linearTheme.colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!backupBusy}
          inputContainerStyle={{
            backgroundColor: linearTheme.colors.surface,
            borderRadius: 12,
            marginTop: 8,
          }}
          inputStyle={{
            color: linearTheme.colors.textPrimary,
          }}
        />
        {currentProfile?.gdriveConnected ? (
          <View>
            <LinearText variant="caption" style={[styles.backupDate, { marginBottom: 8 }]}>
              Connected: {currentProfile.gdriveEmail || 'Google Account'}
            </LinearText>
            {currentProfile.gdriveLastSyncAt && (
              <LinearText variant="caption" style={styles.backupDate}>
                Last sync: {new Date(currentProfile.gdriveLastSyncAt).toLocaleString()}
              </LinearText>
            )}
            <View style={styles.backupRow}>
              <TouchableOpacity
                style={[styles.backupBtn, backupBusy && styles.saveBtnDisabled]}
                disabled={backupBusy}
                activeOpacity={0.8}
                onPress={() =>
                  handleSyncGoogleDrive({ setBackupBusy, runAutoBackup, refreshProfile })
                }
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
                onPress={() => handleDisconnectGoogleDrive({ signOutGDrive, refreshProfile })}
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
                (gdriveWebClientId ?? '').trim() ||
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
                await updateUserProfile({ gdriveWebClientId: resolvedGoogleClientId });
                const result = await signInToGDrive(resolvedGoogleClientId);
                refreshProfile();
                showSuccess(
                  'Connected!',
                  `Signed in as ${result.email}. Your backups will now sync to Google Drive.`,
                );
              } catch (e: unknown) {
                if (getErrorCode(e) !== 'SIGN_IN_CANCELLED') {
                  const code = getErrorCode(e);
                  const msg = getErrorMessage(e);
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
        id="storage_maintenance"
        title="Library Maintenance"
        icon="construct"
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
