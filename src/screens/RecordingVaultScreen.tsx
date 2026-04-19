/**
 * RecordingVaultScreen
 *
 * Browse old .m4a lecture recordings stored anywhere under Documents/Guru/.
 * Select files to re-transcribe and save to the Notes Vault.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  TouchableOpacity,
  Pressable,
  FlatList,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  AppState,
} from 'react-native';
import LinearText from '../components/primitives/LinearText';
import { EmptyState } from '../components/primitives';
import { whiteAlpha } from '../theme/colorUtils';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import {
  findAllRecordings,
  pickFolderAndScan,
  scanSafUri,
  deleteRecording,
  hasAllFilesAccess,
  requestAllFilesAccess,
} from '../../modules/app-launcher';
import * as FileSystem from 'expo-file-system/legacy';
import { transcribeAudio } from '../services/transcription/transcribeAudio';
import { saveLecturePersistence } from '../services/lecture/persistence';
import { profileRepository } from '../db/repositories';
import { getApiKeys } from '../services/ai/config';
import { showInfo, showSuccess, showError, confirmDestructive } from '../components/dialogService';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { linearTheme as n } from '../theme/linearTheme';
import LoadingOrb from '../components/LoadingOrb';
import ScreenHeader from '../components/ScreenHeader';
import TranscriptionSettingsPanel from '../components/TranscriptionSettingsPanel';
import LinearButton from '../components/primitives/LinearButton';
import LinearSurface from '../components/primitives/LinearSurface';

const CUSTOM_FOLDERS_KEY = 'guru_recording_vault_custom_folders';

interface SavedFolder {
  uri: string; // SAF content:// tree URI
  label: string; // human-readable folder name
}

interface RecordingFile {
  name: string;
  path: string;
  sizeMB: number;
  date: Date | null;
  folder: string;
}

type ProcessingState = 'idle' | 'transcribing' | 'saving' | 'done' | 'error';

function entriesToRecordingFiles(
  entries: { name: string; path: string; size: number }[],
): RecordingFile[] {
  return entries.map((e) => {
    const tsMatch = e.name.match(/lecture_(\d+)/);
    const date = tsMatch ? new Date(parseInt(tsMatch[1], 10)) : null;
    const parts = e.path.replace(/\\/g, '/').split('/');
    const guruIdx = parts.indexOf('Guru');
    const folder =
      guruIdx >= 0 && guruIdx < parts.length - 2
        ? parts.slice(guruIdx + 1, -1).join('/')
        : parts.slice(-2, -1)[0] ?? 'Unknown';
    return {
      name: e.name,
      path: e.path,
      sizeMB: Math.round((e.size / (1024 * 1024)) * 10) / 10,
      date,
      folder,
    };
  });
}

export default function RecordingVaultScreen() {
  const [recordings, setRecordings] = useState<RecordingFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingFile, setProcessingFile] = useState<string | null>(null);
  const [processingState, setProcessingState] = useState<ProcessingState>('idle');
  const [processingMsg, setProcessingMsg] = useState('');
  const [savedFolders, setSavedFolders] = useState<SavedFolder[]>([]);
  const [needsFileAccess, setNeedsFileAccess] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);

  // Load persisted custom folders on mount
  useEffect(() => {
    void AsyncStorage.getItem(CUSTOM_FOLDERS_KEY).then((raw) => {
      if (raw) {
        try {
          setSavedFolders(JSON.parse(raw));
        } catch {
          /* ignore */
        }
      }
    });
  }, []);

  const persistFolders = useCallback(async (folders: SavedFolder[]) => {
    setSavedFolders(folders);
    await AsyncStorage.setItem(CUSTOM_FOLDERS_KEY, JSON.stringify(folders));
  }, []);

  const loadRecordings = useCallback(async () => {
    setLoading(true);
    try {
      // Check file access permission on Android 11+
      const hasAccess = await hasAllFilesAccess();
      setNeedsFileAccess(!hasAccess);

      // Scan default Documents/Guru/ tree
      const defaultEntries = await findAllRecordings();
      const allItems = entriesToRecordingFiles(defaultEntries);

      // Re-scan each saved SAF folder
      const savedRaw = await AsyncStorage.getItem(CUSTOM_FOLDERS_KEY);
      const folders: SavedFolder[] = savedRaw ? JSON.parse(savedRaw) : [];
      for (const folder of folders) {
        try {
          const extra = await scanSafUri(folder.uri);
          allItems.push(...entriesToRecordingFiles(extra));
        } catch {
          // Skip inaccessible folders (permission may have been revoked)
        }
      }

      // Deduplicate by path
      const seen = new Set<string>();
      const unique = allItems.filter((item) => {
        if (seen.has(item.path)) return false;
        seen.add(item.path);
        return true;
      });

      // Sort newest first
      unique.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
      setRecordings(unique);
    } catch (e) {
      console.warn('[RecordingVault] Failed to list recordings:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecordings();
  }, [loadRecordings]);

  // Re-scan when returning from settings (permission grant)
  const appStateRef = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appStateRef.current !== 'active' && next === 'active' && needsFileAccess) {
        void loadRecordings();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [needsFileAccess, loadRecordings]);

  const processRecording = useCallback(
    async (item: Pick<RecordingFile, 'path' | 'name' | 'sizeMB'> & { appName?: string }) => {
      setProcessingFile(item.path);
      setProcessingState('transcribing');
      setProcessingMsg('Preparing audio...');
      try {
        // SAF content:// URIs must be copied to cache for transcription APIs
        let filePath = item.path;
        if (item.path.startsWith('content://')) {
          const cacheDir = FileSystem.cacheDirectory ?? '';
          const dest = `${cacheDir}vault_${Date.now()}_${item.name}`;
          await FileSystem.copyAsync({ from: item.path, to: dest });
          filePath = dest;
        }

        setProcessingMsg('Transcribing audio...');
        const profile = await profileRepository.getProfile();
        const keys = getApiKeys(profile);

        const analysis = await transcribeAudio({
          audioFilePath: filePath,
          groqKey: keys.groqKey,
          huggingFaceToken: keys.hfToken,
          useLocalWhisper: profile.useLocalWhisper,
          localWhisperPath: profile.localWhisperPath ?? undefined,
        });

        if (!analysis.transcript?.trim()) {
          setProcessingState('error');
          setProcessingMsg('No speech detected in this recording.');
          return;
        }

        setProcessingState('saving');
        setProcessingMsg(`Found ${analysis.topics.length} topics — saving...`);

        await saveLecturePersistence({
          analysis,
          appName: item.appName ?? 'Recording Vault',
          durationMinutes: item.sizeMB > 0 ? Math.round(item.sizeMB * 30) : 0, // rough estimate
          logId: 0,
          quickNote: '',
          recordingPath: item.path,
        });

        setProcessingState('done');
        setProcessingMsg(`Saved! ${analysis.topics.length} topics from ${analysis.subject}`);
      } catch (e: any) {
        setProcessingState('error');
        setProcessingMsg(e?.message ?? 'Processing failed');
      }
    },
    [],
  );

  const handleProcess = useCallback(
    async (item: RecordingFile) => {
      await processRecording(item);
    },
    [processRecording],
  );

  const handleDelete = useCallback(async (item: RecordingFile) => {
    const ok = await confirmDestructive(
      'Delete Recording',
      `Delete "${item.name}"? This cannot be undone.`,
    );
    if (!ok) return;
    try {
      await deleteRecording(item.path);
      setRecordings((prev) => prev.filter((r) => r.path !== item.path));
    } catch {
      void showError('Could not delete the file.');
    }
  }, []);

  const resetProcessing = useCallback(() => {
    setProcessingFile(null);
    setProcessingState('idle');
    setProcessingMsg('');
  }, []);

  const isSelectionMode = selectedPaths.size > 0;
  const totalSizeMb = recordings.reduce((sum, item) => sum + item.sizeMB, 0);
  const totalSizeLabel =
    totalSizeMb >= 1024 ? `${(totalSizeMb / 1024).toFixed(1)} GB` : `${Math.round(totalSizeMb)} MB`;
  const recentCount = recordings.filter((item) => {
    if (!item.date) return false;
    return Date.now() - item.date.getTime() <= 7 * 24 * 60 * 60 * 1000;
  }).length;
  const summaryCards = [
    { label: 'Recordings', value: recordings.length.toString(), tone: 'accent' as const },
    { label: 'Folders', value: savedFolders.length.toString(), tone: 'primary' as const },
    { label: 'Recent 7d', value: recentCount.toString(), tone: 'success' as const },
    { label: 'Stored', value: totalSizeLabel, tone: 'warning' as const },
  ];

  const toggleSelection = useCallback((path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleLongPress = useCallback((path: string) => {
    Haptics.selectionAsync();
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      next.add(path);
      return next;
    });
  }, []);

  const cancelSelection = useCallback(() => {
    setSelectedPaths(new Set());
  }, []);

  const handleBatchDelete = useCallback(async () => {
    const count = selectedPaths.size;
    const ok = await confirmDestructive(
      `Delete ${count} recording${count !== 1 ? 's' : ''}?`,
      'This cannot be undone.',
    );
    if (!ok) return;
    const paths = [...selectedPaths];
    let deleted = 0;
    for (const p of paths) {
      try {
        await deleteRecording(p);
        deleted++;
      } catch {
        /* skip failures */
      }
    }
    setRecordings((prev) => prev.filter((r) => !selectedPaths.has(r.path)));
    setSelectedPaths(new Set());
    void showSuccess('Done', `Deleted ${deleted} recording${deleted !== 1 ? 's' : ''}.`);
  }, [selectedPaths]);

  const formatDate = (d: Date | null) => {
    if (!d) return 'Unknown date';
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderItem = useCallback(
    ({ item }: { item: RecordingFile }) => {
      const isProcessing = processingFile === item.path;
      const isDone = isProcessing && processingState === 'done';
      const isError = isProcessing && processingState === 'error';
      const isSelected = selectedPaths.has(item.path);

      return (
        <Pressable
          onLongPress={() => handleLongPress(item.path)}
          onPress={() => {
            if (isSelectionMode) {
              Haptics.selectionAsync();
              toggleSelection(item.path);
            }
          }}
          delayLongPress={220}
        >
          <LinearSurface
            padded={false}
            borderColor={
              isSelected
                ? n.colors.accent
                : isError
                ? n.colors.error
                : isDone
                ? n.colors.success
                : n.colors.border
            }
            style={[
              styles.card,
              isDone && styles.cardDone,
              isError && styles.cardError,
              isSelected && styles.cardSelected,
            ]}
          >
            {isSelectionMode ? (
              <View style={styles.cardIcon}>
                <Ionicons
                  name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={24}
                  color={isSelected ? n.colors.accent : n.colors.textMuted}
                />
              </View>
            ) : (
              <View style={styles.cardIcon}>
                <Ionicons
                  name={isDone ? 'checkmark-circle' : 'mic-outline'}
                  size={24}
                  color={isDone ? n.colors.success : n.colors.accent}
                />
              </View>
            )}
            <View style={styles.cardBody}>
              <LinearText style={styles.cardName} numberOfLines={2} ellipsizeMode="tail">
                {item.name}
              </LinearText>
              <LinearText style={styles.cardMeta}>
                {formatDate(item.date)} · {item.sizeMB} MB · {item.folder}
              </LinearText>
              {isProcessing && processingMsg ? (
                <View style={styles.statusRow}>
                  {processingState === 'transcribing' || processingState === 'saving' ? (
                    <ActivityIndicator
                      size="small"
                      color={n.colors.accent}
                      style={{ marginRight: 6 }}
                    />
                  ) : null}
                  <LinearText
                    style={[
                      styles.statusText,
                      isDone && { color: n.colors.success },
                      isError && { color: n.colors.error },
                    ]}
                    numberOfLines={2}
                  >
                    {processingMsg}
                  </LinearText>
                </View>
              ) : null}
            </View>
            {!isSelectionMode && (
              <View style={styles.cardActions}>
                {!isProcessing || isDone || isError ? (
                  <>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => {
                        if (isDone || isError) resetProcessing();
                        void handleProcess(item);
                      }}
                      disabled={isProcessing && !isDone && !isError}
                    >
                      <Ionicons name="cloud-upload-outline" size={20} color={n.colors.accent} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => handleDelete(item)}
                      disabled={isProcessing && !isDone && !isError}
                    >
                      <Ionicons name="trash-outline" size={20} color={n.colors.error} />
                    </TouchableOpacity>
                  </>
                ) : (
                  <ActivityIndicator size="small" color={n.colors.accent} />
                )}
              </View>
            )}
          </LinearSurface>
        </Pressable>
      );
    },
    [
      processingFile,
      processingState,
      processingMsg,
      selectedPaths,
      isSelectionMode,
      handleLongPress,
      toggleSelection,
      resetProcessing,
      handleProcess,
      handleDelete,
    ],
  );

  const handlePickFolder = useCallback(async () => {
    try {
      const result = await pickFolderAndScan();
      if (!result) return; // User cancelled

      const { treeUri, label, entries } = result;

      // Check if already saved
      if (savedFolders.some((f) => f.uri === treeUri)) {
        void showInfo('Already added', 'This folder is already being scanned.');
        void loadRecordings();
        return;
      }

      const folder: SavedFolder = { uri: treeUri, label };
      const updated = [...savedFolders, folder];
      await persistFolders(updated);
      void loadRecordings();

      if (entries.length > 0) {
        void showSuccess(
          'Folder added',
          `Found ${entries.length} recording${entries.length !== 1 ? 's' : ''}.`,
        );
      } else {
        void showInfo(
          'Folder added',
          'No .m4a files found yet. It will be scanned on each refresh.',
        );
      }
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      console.warn('[RecordingVault] pickFolderAndScan error:', msg);
      if (msg.includes('timed out')) return;
      void showError(msg, 'Could not open folder picker.');
    }
  }, [savedFolders, persistFolders, loadRecordings]);

  const handleUploadAudio = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: ['audio/*'],
      });
      if (result.canceled || !result.assets[0]) return;

      setIsUploadingAudio(true);
      const asset = result.assets[0];
      await processRecording({
        name: asset.name ?? `upload-${Date.now()}.m4a`,
        path: asset.uri,
        sizeMB: Math.round(((asset.size ?? 0) / (1024 * 1024) || 0) * 10) / 10,
        appName: 'Recording Vault Upload',
      });
    } catch (e: any) {
      void showError(e, 'Upload failed');
    } finally {
      setIsUploadingAudio(false);
    }
  }, [processRecording]);

  const handleRemoveFolder = useCallback(
    async (folder: SavedFolder) => {
      const ok = await confirmDestructive('Remove folder?', folder.label);
      if (!ok) return;
      const updated = savedFolders.filter((f) => f.uri !== folder.uri);
      await persistFolders(updated);
      void loadRecordings();
    },
    [savedFolders, persistFolders, loadRecordings],
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ResponsiveContainer style={styles.container}>
        <ScreenHeader
          title="Recording Vault"
          rightElement={
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={handlePickFolder} style={styles.refreshBtn}>
                <Ionicons name="folder-open-outline" size={20} color={n.colors.accent} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => void loadRecordings()} style={styles.refreshBtn}>
                <Ionicons name="refresh" size={20} color={n.colors.textMuted} />
              </TouchableOpacity>
            </View>
          }
          showSettings
        />

        <LinearSurface compact style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View style={styles.summaryCopy}>
              <LinearText variant="meta" tone="accent" style={styles.summaryEyebrow}>
                CAPTURE LIBRARY
              </LinearText>
              <LinearText variant="sectionTitle" style={styles.summaryTitle}>
                External lecture recordings in one place
              </LinearText>
              <LinearText variant="bodySmall" tone="secondary" style={styles.summaryText}>
                Re-upload audio, scan custom folders, and keep lecture captures ready for
                transcription.
              </LinearText>
            </View>
            <View style={styles.summaryPill}>
              <LinearText variant="chip" tone={needsFileAccess ? 'warning' : 'accent'}>
                {needsFileAccess ? 'Access needed' : 'Scan ready'}
              </LinearText>
            </View>
          </View>
          <View style={styles.summaryMetricsRow}>
            {summaryCards.map((card) => (
              <View key={card.label} style={styles.summaryMetricCard}>
                <LinearText variant="title" tone={card.tone} style={styles.summaryMetricValue}>
                  {card.value}
                </LinearText>
                <LinearText variant="caption" tone="secondary" style={styles.summaryMetricLabel}>
                  {card.label}
                </LinearText>
              </View>
            ))}
          </View>
        </LinearSurface>

        <LinearSurface compact style={styles.actionPanel}>
          <View style={styles.topActions}>
            <LinearButton
              variant="secondary"
              style={[styles.topActionBtn, isUploadingAudio && styles.topActionBtnDisabled]}
              onPress={() => void handleUploadAudio()}
              disabled={isUploadingAudio}
              leftIcon={
                isUploadingAudio ? (
                  <ActivityIndicator size="small" color={n.colors.accent} />
                ) : (
                  <Ionicons name="cloud-upload-outline" size={18} color={n.colors.accent} />
                )
              }
              label={isUploadingAudio ? 'Uploading…' : 'Upload Audio'}
            />
            <LinearButton
              variant="secondary"
              style={styles.topActionBtn}
              onPress={handlePickFolder}
              leftIcon={<Ionicons name="folder-open-outline" size={18} color={n.colors.accent} />}
              label="Add Folder"
            />
          </View>
        </LinearSurface>

        <TranscriptionSettingsPanel />

        {/* Selection mode banner */}
        {isSelectionMode && (
          <View style={styles.selectionBanner}>
            <LinearText style={styles.selectionText}>{selectedPaths.size} selected</LinearText>
            <View style={styles.selectionActions}>
              <TouchableOpacity style={styles.selectionCancelBtn} onPress={cancelSelection}>
                <LinearText style={styles.selectionCancelText}>Cancel</LinearText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.selectionDeleteBtn} onPress={handleBatchDelete}>
                <Ionicons name="trash-outline" size={14} color="#fff" />
                <LinearText style={styles.selectionDeleteText}>Delete</LinearText>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* File access permission banner */}
        {needsFileAccess && (
          <TouchableOpacity
            style={styles.permBanner}
            onPress={async () => {
              await requestAllFilesAccess();
              // User will be sent to settings — re-check on return
            }}
          >
            <Ionicons name="lock-open-outline" size={18} color={n.colors.warning} />
            <LinearText style={styles.permBannerText}>
              Grant "All files access" to scan all folders automatically.
            </LinearText>
            <Ionicons name="chevron-forward" size={16} color={n.colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* Custom folders strip */}
        {savedFolders.length > 0 && (
          <View style={styles.foldersStrip}>
            {savedFolders.map((f) => (
              <TouchableOpacity
                key={f.uri}
                style={styles.folderChip}
                onLongPress={() => handleRemoveFolder(f)}
              >
                <Ionicons name="folder-outline" size={14} color={n.colors.accent} />
                <LinearText style={styles.folderChipText} numberOfLines={2}>
                  {f.label}
                </LinearText>
                <TouchableOpacity onPress={() => handleRemoveFolder(f)} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={n.colors.textMuted} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {loading ? (
          <View style={styles.center}>
            <LoadingOrb message="Scanning recordings..." size={120} />
          </View>
        ) : recordings.length === 0 ? (
          <EmptyState icon="mic-off-outline" iconSize={48} title="No recordings found" />
        ) : (
          <FlatList
            data={recordings}
            keyExtractor={(item) => item.path}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )}
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  container: { flex: 1 },
  summaryCard: {
    marginHorizontal: n.spacing.lg,
    marginTop: n.spacing.xs,
    marginBottom: 12,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: n.spacing.md,
  },
  summaryCopy: {
    flex: 1,
  },
  summaryEyebrow: {
    letterSpacing: 1.1,
  },
  summaryTitle: {
    marginTop: n.spacing.xs,
  },
  summaryText: {
    marginTop: n.spacing.xs,
  },
  summaryPill: {
    backgroundColor: n.colors.primaryTintSoft,
    borderRadius: n.radius.full,
    borderWidth: 1,
    borderColor: n.colors.borderHighlight,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  summaryMetricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: n.spacing.md,
  },
  summaryMetricCard: {
    flexGrow: 1,
    minWidth: 110,
    backgroundColor: n.colors.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: n.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  summaryMetricValue: {
    marginBottom: 2,
  },
  summaryMetricLabel: {
    lineHeight: 16,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    borderWidth: 1,
    borderColor: n.colors.border,
    backgroundColor: whiteAlpha['5'],
  },
  actionPanel: {
    marginHorizontal: n.spacing.lg,
    marginBottom: 10,
  },
  topActions: {
    flexDirection: 'row',
    gap: 10,
  },
  topActionBtn: {
    flex: 1,
    minHeight: 52,
  },
  topActionBtnDisabled: {
    opacity: 0.6,
  },
  list: { padding: n.spacing.lg, paddingBottom: 40 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: n.spacing.lg,
    marginBottom: 10,
  },
  cardDone: {},
  cardError: {},
  cardSelected: { borderColor: n.colors.accent, backgroundColor: n.colors.accent + '12' },
  cardIcon: { marginRight: 12 },
  cardBody: { flex: 1, minWidth: 0 },
  cardName: { color: n.colors.textPrimary, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  cardMeta: { color: n.colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  statusText: { color: n.colors.textSecondary, fontSize: 12, lineHeight: 18, flex: 1 },
  cardActions: { flexDirection: 'row', gap: 4, marginLeft: 8 },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: n.colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: {
    color: n.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    color: n.colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  foldersStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: n.spacing.lg,
    paddingTop: 8,
    gap: 6,
  },
  folderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: n.colors.surface,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 5,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  folderChipText: {
    color: n.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    maxWidth: 160,
  },
  selectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: n.colors.accent + '18',
    marginHorizontal: n.spacing.lg,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: n.radius.md,
    borderWidth: 1,
    borderColor: n.colors.accent + '40',
  },
  selectionText: { color: n.colors.accent, fontSize: 14, fontWeight: '700' },
  selectionActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  selectionCancelBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  selectionCancelText: { color: n.colors.accent, fontSize: 13, fontWeight: '700' },
  selectionDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: n.colors.error,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  selectionDeleteText: { color: n.colors.textPrimary, fontSize: 13, fontWeight: '700' },
  permBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${n.colors.warning}15`,
    marginHorizontal: n.spacing.lg,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: n.radius.md,
    borderWidth: 1,
    borderColor: `${n.colors.warning}40`,
    gap: 8,
  },
  permBannerText: {
    flex: 1,
    color: n.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
});
