/**
 * TranscriptVaultScreen
 *
 * File browser for backed-up .txt transcript files in Documents/Guru/.
 * Similar to RecordingVault but for text transcripts.
 * Users can read, copy, delete, or process transcript files into study notes.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Modal,
  ScrollView,
  AppState,
  useWindowDimensions,
  Platform,
} from 'react-native';
import LinearText from '../components/primitives/LinearText';
import ErrorBoundary from '../components/ErrorBoundary';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import Clipboard from '@react-native-clipboard/clipboard';
import { pickDocumentOnce } from '../services/documentPicker';
import {
  listPublicBackups,
  getPublicBackupDir,
  hasAllFilesAccess,
  requestAllFilesAccess,
  deleteRecording,
} from '../../modules/app-launcher';
import { z } from 'zod';
import {
  confirmDestructive,
  confirm,
  showSuccess,
  showError,
  showWarning,
} from '../components/dialogService';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { useVaultList } from '../hooks/vaults/useVaultList';
import { TranscriptCardItem, TranscriptFile } from './vaults/components/TranscriptCardItem';
import { linearTheme as n } from '../theme/linearTheme';
import { whiteAlpha, captureBorderAlpha } from '../theme/colorUtils';
import { EmptyState } from '../components/primitives';
import LoadingOrb from '../components/LoadingOrb';
import ScreenHeader from '../components/ScreenHeader';
import LinearButton from '../components/primitives/LinearButton';
import LinearSurface from '../components/primitives/LinearSurface';
import { generateJSONV2 } from '../services/ai/v2/compat';
import type { Message } from '../services/ai/types';
import { analyzeTranscript } from '../services/transcription/analysis';
import { generateADHDNote } from '../services/transcription/noteGeneration';
import { saveLectureTranscript } from '../db/queries/aiCache';
import { getSubjectByName } from '../db/queries/topics';
import { saveTranscriptToFile } from '../services/transcriptStorage';

/** Delete a file using expo-file-system first, falling back to native Java File.delete() */
async function deleteFile(path: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {
    // Fallback: strip file:// prefix and use native delete
    const absolute = path.replace(/^file:\/\//, '');
    const ok = await deleteRecording(absolute);
    if (!ok) throw new Error('Native delete failed');
  }
}

/** Extract a meaningful title from transcript content (Subject/Topic lines or first non-empty line) */
function extractTitle(text: string): string {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines.slice(0, 10)) {
    // Match "Subject: X" or "**Subject:** X"
    const subjectMatch = line.match(/^\*{0,2}subject\*{0,2}\s*:\s*(.+)/i);
    if (subjectMatch) {
      const val = subjectMatch[1].replace(/\*+/g, '').trim();
      if (val && val.toLowerCase() !== 'general' && val.toLowerCase() !== 'unknown') return val;
    }
    // Match "Topic: X" or "Topics: X"
    const topicMatch = line.match(/^\*{0,2}topics?\*{0,2}\s*:\s*(.+)/i);
    if (topicMatch) {
      const val = topicMatch[1].replace(/\*+/g, '').trim();
      if (val) return val;
    }
  }
  // Fallback: first meaningful line (skip markdown headers like "#")
  for (const line of lines.slice(0, 5)) {
    const clean = line
      .replace(/^#+\s*/, '')
      .replace(/\*+/g, '')
      .trim();
    if (clean.length >= 8 && !/^(subject|topics?)\s*:/i.test(clean)) return clean;
  }
  return '';
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

const TranscriptLabelSchema = z.object({
  subject: z.string().describe('Medical subject (e.g. "Anatomy", "Pharmacology", "Pathology")'),
  topic: z
    .string()
    .describe(
      'Specific topic — short noun phrase, no verbs (e.g. "Cardiac Valves", "Beta Blockers", "Iron Deficiency Anemia")',
    ),
});

/** Use AI to extract a clean subject + topic label from transcript text */
async function aiExtractLabel(text: string): Promise<{ subject: string; topic: string } | null> {
  try {
    // Send only first ~800 words to keep it fast and cheap
    const snippet = text.split(/\s+/).slice(0, 800).join(' ');
    const messages: Message[] = [
      {
        role: 'system',
        content: `You label medical lecture transcripts. Return subject and topic.

TOPIC RULES:
- Must be a short noun phrase like a textbook heading (max 50 chars)
- NEVER use "covers", "focuses on", "discusses", "about" or similar verbs
- Good: "Cardiac Valves & Murmurs", "Beta Blockers — MOA"
- Bad: "Discusses cardiac anatomy", "Covers beta blocker pharmacology"

If unclear, make your best guess from the content.`,
      },
      { role: 'user', content: snippet },
    ];
    const { object } = await generateJSONV2(
      messages,
      TranscriptLabelSchema,
      { providerOrderOverride: ['groq'] },
    );
    if (object.subject && object.topic) return object;
    return null;
  } catch {
    return null;
  }
}

function slugifyLabel(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'unknown'
  );
}

function buildNewFileName(subject: string, topic: string, timestamp: number): string {
  const d = new Date(timestamp);
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(
    2,
    '0',
  )}`;
  return `${slugifyLabel(subject)}_${slugifyLabel(topic)}_transcript_${dateStr}.txt`;
}

/** Extract timestamp from old or new filename format */
function extractTimestamp(fileName: string): number {
  // Old: "...__transcript__1699564800000.txt"
  const oldMatch = fileName.match(/__transcript__(\d{10,})\.txt$/);
  if (oldMatch) return parseInt(oldMatch[1], 10);
  // New: "..._transcript_2025-03-26_1430.txt"
  const newMatch = fileName.match(/_transcript_(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})\.txt$/);
  if (newMatch) {
    const [, y, m, d, hh, mm] = newMatch;
    return new Date(+y, +m - 1, +d, +hh, +mm).getTime();
  }
  // Fallback: file mod time not available, use now
  return Date.now();
}

const GENERIC_LABELS = new Set(['general', 'unknown', 'lecture', 'untitled']);

/** Parse old or new naming convention into a readable display name */
function displayName(fileName: string, extractedTitle?: string): string {
  const base = fileName.replace(/\.txt$/, '');

  let label = '';
  let datePart = '';

  // New format: "anatomy_cardiac-valves_transcript_2025-03-26_1430"
  const newMatch = base.match(/^(.+)_transcript_(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})$/);
  if (newMatch) {
    label = newMatch[1].replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    datePart = `${newMatch[2]} ${newMatch[3]}:${newMatch[4]}`;
  }

  // Old format: "anatomy__cardiac-system__transcript__1699564800000"
  if (!datePart) {
    const oldMatch = base.match(/^(.+)__transcript__(\d{10,})$/);
    if (oldMatch) {
      label = oldMatch[1]
        .replace(/__/g, ' - ')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      const ts = parseInt(oldMatch[2], 10);
      const d = new Date(ts);
      datePart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate(),
      ).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(
        d.getMinutes(),
      ).padStart(2, '0')}`;
    }
  }

  // Use extracted title from content when filename label is generic
  if (extractedTitle && (!label || GENERIC_LABELS.has(label.toLowerCase().trim()))) {
    label = extractedTitle.length > 60 ? extractedTitle.slice(0, 57) + '...' : extractedTitle;
  }

  if (label && datePart) return `${label} · ${datePart}`;
  if (label) return label;
  if (datePart) return datePart;

  // Fallback: just clean up the filename
  return base.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function TranscriptVaultScreen() {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const navigation = useNavigation();
  const [needsFileAccess, setNeedsFileAccess] = useState(false);
  const [isImportingText, setIsImportingText] = useState(false);

  const PAGE_SIZE = 20;

  const {
    items: files,
    setItems: setFiles,
    visibleItems: sortedFiles,
    loading,
    setLoading,
    sortBy,
    setSortBy,
    selectedIds: selectedPaths,
    setSelectedIds: setSelectedPaths,
    isSelectionMode,
    toggleSelection,
    handleLongPress,
    cancelSelection,
    displayCount,
    setDisplayCount,
    loadMore,
  } = useVaultList<TranscriptFile, string>({
    initialSortBy: 'name',
    pageSize: PAGE_SIZE,
    sortItems: (a, b, sort) => {
      if (sort === 'words') return b.wordCount - a.wordCount;
      return b.name.localeCompare(a.name); // Default 'name'
    },
  });

  // Reader
  const [readerContent, setReaderContent] = useState<string | null>(null);
  const [readerTitle, setReaderTitle] = useState('');
  const listLayoutKey = `${viewportWidth}x${viewportHeight}`;

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const hasAccess = await hasAllFilesAccess();
      setNeedsFileAccess(!hasAccess);

      const allFiles: TranscriptFile[] = [];

      // 1. Internal transcripts dir
      const internalDir = FileSystem.documentDirectory + 'transcripts/';
      try {
        const dirInfo = await FileSystem.getInfoAsync(internalDir);
        if (dirInfo.exists) {
          const names = await FileSystem.readDirectoryAsync(internalDir);
          for (const name of names) {
            if (!name.endsWith('.txt') || name.includes('__note__') || name.includes('_note_'))
              continue;
            const uri = internalDir + name;
            const info = await FileSystem.getInfoAsync(uri);
            if (info.exists) {
              let wc = 0;
              let hash = '';
              let title = '';
              try {
                const txt = await FileSystem.readAsStringAsync(uri);
                wc = countWords(txt);
                hash = txt.trim().slice(0, 200);
                title = extractTitle(txt);
              } catch {
                /* skip */
              }
              allFiles.push({
                name,
                path: uri,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
                sizeMB: Math.round((((info as any).size ?? 0) / 1024) * 10) / 10,
                folder: 'Internal',
                wordCount: wc,
                contentHash: hash,
                extractedTitle: title,
              });
            }
          }
        }
      } catch {
        /* skip */
      }

      // 2. Internal backups dir
      const backupDir = FileSystem.documentDirectory + 'backups/Transcripts/';
      try {
        const dirInfo = await FileSystem.getInfoAsync(backupDir);
        if (dirInfo.exists) {
          const names = await FileSystem.readDirectoryAsync(backupDir);
          for (const name of names) {
            if (!name.endsWith('.txt') || name.includes('__note__') || name.includes('_note_'))
              continue;
            const uri = backupDir + name;
            const info = await FileSystem.getInfoAsync(uri);
            if (info.exists) {
              let wc = 0;
              let hash = '';
              let title = '';
              try {
                const txt = await FileSystem.readAsStringAsync(uri);
                wc = countWords(txt);
                hash = txt.trim().slice(0, 200);
                title = extractTitle(txt);
              } catch {
                /* skip */
              }
              allFiles.push({
                name,
                path: uri,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
                sizeMB: Math.round((((info as any).size ?? 0) / 1024) * 10) / 10,
                folder: 'Backups',
                wordCount: wc,
                contentHash: hash,
                extractedTitle: title,
              });
            }
          }
        }
      } catch {
        /* skip */
      }

      // 3. Public Documents/Guru/Backups via native module
      try {
        const publicFiles = await listPublicBackups();
        const publicDir = await getPublicBackupDir();
        const publicUri = 'file://' + publicDir;
        for (const name of publicFiles) {
          if (!name.endsWith('.txt') || name.includes('__note__') || name.includes('_note_'))
            continue;
          const uri = (publicUri.endsWith('/') ? publicUri : publicUri + '/') + name;
          // Avoid duplicates by filename
          if (allFiles.some((f) => f.name === name)) continue;
          let wc = 0;
          let hash = '';
          let title = '';
          try {
            const txt = await FileSystem.readAsStringAsync(uri);
            wc = countWords(txt);
            hash = txt.trim().slice(0, 200);
            title = extractTitle(txt);
          } catch {
            /* skip */
          }
          allFiles.push({
            name,
            path: uri,
            sizeMB: 0,
            folder: 'Documents/Guru',
            wordCount: wc,
            contentHash: hash,
            extractedTitle: title,
          });
        }
      } catch {
        /* skip if native not available */
      }

      // Deduplicate by filename
      const seen = new Set<string>();
      const unique = allFiles.filter((f) => {
        if (seen.has(f.name)) return false;
        seen.add(f.name);
        return true;
      });

      // Sort by name (which usually contains timestamps)
      unique.sort((a, b) => b.name.localeCompare(a.name));
      setFiles(unique);
      setDisplayCount(PAGE_SIZE);
    } catch (e) {
      console.warn('[TranscriptVault] Failed to scan:', e);
    } finally {
      setLoading(false);
    }
  }, [PAGE_SIZE, setDisplayCount, setFiles, setLoading]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  // Re-scan on return from settings
  const appStateRef = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appStateRef.current !== 'active' && next === 'active' && needsFileAccess) {
        void loadFiles();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [needsFileAccess, loadFiles]);

  const handleBatchDelete = useCallback(async () => {
    const count = selectedPaths.size;
    const ok = await confirmDestructive(
      `Delete ${count} transcript${count !== 1 ? 's' : ''}?`,
      'This cannot be undone.',
      { confirmLabel: 'Delete' },
    );
    if (ok) {
      for (const p of selectedPaths) {
        try {
          await deleteFile(p);
        } catch {
          /* skip */
        }
      }
      setFiles((prev) => prev.filter((f) => !selectedPaths.has(f.path)));
      setSelectedPaths(new Set());
    }
  }, [selectedPaths, setFiles, setSelectedPaths]);

  const handleUploadText = useCallback(async () => {
    try {
      const result = await pickDocumentOnce({
        copyToCacheDirectory: true,
        type: ['text/plain', 'text/*'],
      });
      if (result.canceled || !result.assets[0]) return;

      setIsImportingText(true);
      const asset = result.assets[0];
      const content = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (!content.trim()) {
        throw new Error('The selected file is empty.');
      }
      await saveTranscriptToFile(content);
      await loadFiles();
      showSuccess('Imported', `${asset.name ?? 'Text file'} was added to Transcript Vault.`);
    } catch (e: unknown) {
      showError(e, 'Could not import this text file.');
    } finally {
      setIsImportingText(false);
    }
  }, [loadFiles]);

  const handleRead = useCallback(
    async (item: TranscriptFile) => {
      try {
        const content = await FileSystem.readAsStringAsync(item.path);
        setReaderTitle(displayName(item.name, item.extractedTitle));
        setReaderContent(content || '(Empty file)');
      } catch (e: unknown) {
        showError(e, 'Could not read file.');
      }
    },
    [setReaderContent, setReaderTitle],
  );

  const handleDelete = useCallback(
    async (item: TranscriptFile) => {
      const ok = await confirmDestructive('Delete transcript?', item.name, {
        confirmLabel: 'Delete',
      });
      if (ok) {
        try {
          await deleteFile(item.path);
          setFiles((prev) => prev.filter((f) => f.path !== item.path));
        } catch {
          showError('Could not delete the file. Check file access permissions.');
        }
      }
    },
    [setFiles],
  );

  const [processProgress, setProcessProgress] = useState<string | null>(null);

  const processTranscript = useCallback(async (item: TranscriptFile): Promise<boolean> => {
    const content = await FileSystem.readAsStringAsync(item.path);
    if (countWords(content) < 10) {
      showWarning(
        'Too short',
        'This transcript has fewer than 10 words — not enough to generate a note.',
      );
      return false;
    }

    const analysis = await analyzeTranscript(content);
    analysis.transcript = content;

    const note = await generateADHDNote(analysis);
    if (!note?.trim()) throw new Error('Note generation returned empty');

    let subjectId: number | null = null;
    if (analysis.subject) {
      const subj = await getSubjectByName(analysis.subject);
      if (subj) subjectId = subj.id;
    }

    await saveLectureTranscript({
      subjectId,
      subjectName: analysis.subject,
      note,
      transcript: content,
      summary: analysis.lectureSummary,
      topics: analysis.topics,
      confidence: analysis.estimatedConfidence,
    });
    return true;
  }, []);

  const handleProcess = useCallback(
    async (item: TranscriptFile) => {
      const ok = await confirm(
        'Process to Notes?',
        `AI will analyze this transcript and create a study note.\n\n${displayName(
          item.name,
          item.extractedTitle,
        )}`,
        { confirmLabel: 'Process' },
      );
      if (ok) {
        setProcessProgress('Analyzing...');
        try {
          await processTranscript(item);
          setProcessProgress(null);
          showSuccess('Done', 'Note created in Notes Vault.');
        } catch (e: unknown) {
          setProcessProgress(null);
          showError(e, 'Could not process transcript.');
        }
      }
    },
    [processTranscript],
  );

  const handleBatchProcess = useCallback(async () => {
    const targets = [...selectedPaths];
    const items = files.filter((f) => targets.includes(f.path) && f.wordCount >= 10);
    if (items.length === 0) {
      showWarning('No valid transcripts', 'Selected transcripts are too short to process.');
      return;
    }
    const ok = await confirm(
      `Process ${items.length} transcript${items.length !== 1 ? 's' : ''}?`,
      'Each will be analyzed by AI and saved as a study note. 2 API calls per transcript.',
    );
    if (ok) {
      let done = 0;
      let failed = 0;
      for (let i = 0; i < items.length; i++) {
        setProcessProgress(`${i + 1}/${items.length}`);
        try {
          await processTranscript(items[i]);
          done++;
        } catch {
          failed++;
        }
      }
      setProcessProgress(null);
      setSelectedPaths(new Set());
      showSuccess(
        'Done',
        `Created ${done} note${done !== 1 ? 's' : ''}${failed > 0 ? ` (${failed} failed)` : ''}.`,
      );
    }
  }, [selectedPaths, files, processTranscript, setSelectedPaths]);

  // Files that need renaming: old format OR generic/unknown labels
  const renamableFiles = React.useMemo(
    () =>
      files.filter((f) => {
        if (f.wordCount < 5) return false; // junk, not worth renaming
        // Old double-underscore format
        if (/__transcript__\d+\.txt$/.test(f.name)) return true;
        // Generic subject in filename
        const base = f.name.replace(/\.txt$/, '').toLowerCase();
        return /^(general|unknown|lecture)[_-]/.test(base);
      }),
    [files],
  );

  const [renameProgress, setRenameProgress] = useState<string | null>(null);

  const handleSmartRename = useCallback(async () => {
    const count = renamableFiles.length;
    const ok = await confirm(
      `AI-rename ${count} transcript${count !== 1 ? 's' : ''}?`,
      'Reads each transcript, asks AI for the subject & topic, then renames the file. Uses 1 quick API call per file.',
    );
    if (ok) {
      let renamed = 0;
      let failed = 0;
      for (let i = 0; i < renamableFiles.length; i++) {
        const f = renamableFiles[i];
        setRenameProgress(
          `${i + 1}/${count}: ${displayName(f.name, f.extractedTitle).slice(0, 30)}...`,
        );
        try {
          const content = await FileSystem.readAsStringAsync(f.path);
          if (countWords(content) < 5) continue;

          const label = await aiExtractLabel(content);
          if (!label) {
            failed++;
            continue;
          }

          const ts = extractTimestamp(f.name);
          const newName = buildNewFileName(label.subject, label.topic, ts);
          if (newName === f.name) continue;

          const internalDir = FileSystem.documentDirectory + 'transcripts/';
          await FileSystem.makeDirectoryAsync(internalDir, { intermediates: true });

          if (f.folder === 'Documents/Guru') {
            await FileSystem.writeAsStringAsync(internalDir + newName, content, {
              encoding: FileSystem.EncodingType.UTF8,
            });
            await deleteFile(f.path);
          } else {
            const newPath = f.path.replace(/[^/]+$/, newName);
            try {
              await FileSystem.moveAsync({ from: f.path, to: newPath });
            } catch {
              // Fallback: write to internal dir
              await FileSystem.writeAsStringAsync(internalDir + newName, content, {
                encoding: FileSystem.EncodingType.UTF8,
              });
              await deleteFile(f.path);
            }
          }
          renamed++;
        } catch {
          failed++;
        }
      }
      setRenameProgress(null);
      void loadFiles();
      showSuccess(
        'Done',
        `Renamed ${renamed} file${renamed !== 1 ? 's' : ''}${
          failed > 0 ? ` (${failed} failed)` : ''
        }.`,
      );
    }
  }, [renamableFiles, loadFiles]);

  // Duplicate detection: group by contentHash, mark extras for deletion
  const duplicatePaths = React.useMemo(() => {
    const groups = new Map<string, TranscriptFile[]>();
    for (const f of files) {
      if (!f.contentHash || f.wordCount < 3) continue; // skip empty/junk
      const key = f.contentHash;
      const group = groups.get(key) ?? [];
      group.push(f);
      groups.set(key, group);
    }
    const dupes = new Set<string>();
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      // Keep the first one (by name descending = newest timestamp), mark rest as duplicates
      group.sort((a, b) => b.name.localeCompare(a.name));
      for (let i = 1; i < group.length; i++) dupes.add(group[i].path);
    }
    return dupes;
  }, [files]);

  const junkFiles = React.useMemo(() => files.filter((f) => f.wordCount < 10), [files]);
  const processableCount = React.useMemo(
    () => files.filter((f) => f.wordCount >= 10).length,
    [files],
  );
  const currentSortLabel = sortBy === 'words' ? 'Shortest first' : 'Newest first';
  const summaryCards = React.useMemo(
    () => [
      { label: 'Transcripts', value: files.length.toString(), tone: 'primary' as const },
      { label: 'Ready', value: processableCount.toString(), tone: 'success' as const },
      { label: 'Duplicates', value: duplicatePaths.size.toString(), tone: 'warning' as const },
      { label: 'Rename', value: renamableFiles.length.toString(), tone: 'accent' as const },
    ],
    [duplicatePaths.size, files.length, processableCount, renamableFiles.length],
  );

  const renderItem = ({ item }: { item: TranscriptFile }) => {
    return (
      <TranscriptCardItem
        item={item}
        isSelected={selectedPaths.has(item.path)}
        isSelectionMode={isSelectionMode}
        displayName={displayName(item.name, item.extractedTitle)}
        onPress={(t) => {
          if (isSelectionMode) {
            Haptics.selectionAsync();
            toggleSelection(t.path);
            return;
          }
          void handleRead(t);
        }}
        onLongPress={handleLongPress}
        onProcess={handleProcess}
        onDelete={handleDelete}
      />
    );
  };

  return (
    // eslint-disable-next-line guru/prefer-screen-shell -- SafeAreaView needed here
    <SafeAreaView style={styles.safe}>
      <ErrorBoundary>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <ResponsiveContainer style={styles.container}>
          <ScreenHeader
            title="Transcript Vault"
            rightElement={
              <View style={styles.headerActions}>
                <TouchableOpacity
                  onPress={() => setSortBy((s) => (s === 'name' ? 'words' : 'name'))}
                  style={styles.sortBtn}
                >
                  <Ionicons
                    name={sortBy === 'words' ? 'text-outline' : 'swap-vertical-outline'}
                    size={18}
                    color={n.colors.accent}
                  />
                  <LinearText style={styles.sortLabel}>
                    {sortBy === 'words' ? 'Words' : 'Name'}
                  </LinearText>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => void loadFiles()} style={styles.refreshBtn}>
                  <Ionicons name="refresh" size={20} color={n.colors.textMuted} />
                </TouchableOpacity>
              </View>
            }
            showSettings
          />

          {!loading && (
            <LinearSurface compact style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
                <View style={styles.summaryCopy}>
                  <LinearText variant="meta" tone="accent" style={styles.summaryEyebrow}>
                    TRANSCRIPT LIBRARY
                  </LinearText>
                  <LinearText variant="sectionTitle" style={styles.summaryTitle}>
                    Raw transcript files ready for cleanup and note creation
                  </LinearText>
                  <LinearText variant="bodySmall" tone="secondary" style={styles.summaryText}>
                    Import text, batch process transcript backups, and keep the vault tidy before
                    study notes are generated.
                  </LinearText>
                </View>
                <View style={styles.summaryPill}>
                  <LinearText variant="chip" tone={needsFileAccess ? 'warning' : 'accent'}>
                    {needsFileAccess ? 'Access needed' : currentSortLabel}
                  </LinearText>
                </View>
              </View>
              <View style={styles.summaryMetricsRow}>
                {summaryCards.map((card) => (
                  <View key={card.label} style={styles.summaryMetricCard}>
                    <LinearText variant="title" tone={card.tone} style={styles.summaryMetricValue}>
                      {card.value}
                    </LinearText>
                    <LinearText
                      variant="caption"
                      tone="secondary"
                      style={styles.summaryMetricLabel}
                    >
                      {card.label}
                    </LinearText>
                  </View>
                ))}
              </View>
            </LinearSurface>
          )}

          <LinearSurface compact style={styles.toolbarCard}>
            <View style={styles.toolbarHeader}>
              <View style={styles.toolbarCopy}>
                <LinearText variant="label" tone="secondary" style={styles.toolbarTitle}>
                  {isSelectionMode
                    ? `${selectedPaths.size} transcript${
                        selectedPaths.size !== 1 ? 's' : ''
                      } selected`
                    : 'Import or paste transcript text'}
                </LinearText>
                <LinearText variant="bodySmall" tone="secondary" style={styles.toolbarSubtitle}>
                  {isSelectionMode
                    ? 'Batch process or delete the selected transcripts.'
                    : `${processableCount} ready for notes - ${currentSortLabel}`}
                </LinearText>
              </View>
              {!isSelectionMode && (
                <View style={styles.toolbarPill}>
                  <LinearText variant="chip" tone="accent">
                    {files.length} files
                  </LinearText>
                </View>
              )}
            </View>

            <View style={styles.topActions}>
              <LinearButton
                variant="secondary"
                style={styles.topActionBtn}
                onPress={() => navigation.navigate('ManualNoteCreation' as never)}
                leftIcon={<Ionicons name="clipboard-outline" size={18} color={n.colors.error} />}
                label="Paste Transcript"
              />
              <LinearButton
                variant="secondary"
                style={[styles.topActionBtn, isImportingText && styles.topActionBtnDisabled]}
                onPress={() => void handleUploadText()}
                disabled={isImportingText}
                leftIcon={
                  isImportingText ? (
                    <ActivityIndicator size="small" color={n.colors.accent} />
                  ) : (
                    <Ionicons name="document-attach-outline" size={18} color={n.colors.accent} />
                  )
                }
                label={isImportingText ? 'Importing…' : 'Upload Text'}
              />
            </View>
          </LinearSurface>

          {/* Cleanup junk banner */}
          {!isSelectionMode && junkFiles.length > 0 && (
            <TouchableOpacity
              style={styles.cleanupBanner}
              onPress={async () => {
                const ok = await confirmDestructive(
                  `Delete ${junkFiles.length} junk transcript${junkFiles.length !== 1 ? 's' : ''}?`,
                  'This will permanently delete all transcripts with fewer than 10 words.',
                );
                if (ok) {
                  for (const f of junkFiles) {
                    try {
                      await deleteFile(f.path);
                    } catch {
                      /* skip */
                    }
                  }
                  const junkPaths = new Set(junkFiles.map((f) => f.path));
                  setFiles((prev) => prev.filter((f) => !junkPaths.has(f.path)));
                }
              }}
            >
              <Ionicons name="trash-outline" size={16} color={n.colors.error} />
              <LinearText style={styles.cleanupText}>
                {junkFiles.length} junk transcript{junkFiles.length !== 1 ? 's' : ''} ({'<'}10
                words)
              </LinearText>
              <LinearText style={styles.cleanupAction}>Clean up</LinearText>
            </TouchableOpacity>
          )}

          {/* Duplicate cleanup banner */}
          {!isSelectionMode && duplicatePaths.size > 0 && (
            <TouchableOpacity
              style={styles.dupeBanner}
              onPress={async () => {
                const ok = await confirmDestructive(
                  `Delete ${duplicatePaths.size} duplicate${duplicatePaths.size !== 1 ? 's' : ''}?`,
                  'Keeps the newest copy of each transcript and deletes older duplicates.',
                );
                if (ok) {
                  for (const p of duplicatePaths) {
                    try {
                      await deleteFile(p);
                    } catch {
                      /* skip */
                    }
                  }
                  setFiles((prev) => prev.filter((f) => !duplicatePaths.has(f.path)));
                }
              }}
            >
              <Ionicons name="copy-outline" size={16} color={n.colors.warning} />
              <LinearText style={styles.cleanupText}>
                {duplicatePaths.size} duplicate{duplicatePaths.size !== 1 ? 's' : ''} found
              </LinearText>
              <LinearText style={styles.dupeAction}>Remove</LinearText>
            </TouchableOpacity>
          )}

          {/* AI rename banner */}
          {!isSelectionMode && renamableFiles.length > 0 && !renameProgress && (
            <TouchableOpacity style={styles.renameBanner} onPress={handleSmartRename}>
              <Ionicons name="sparkles-outline" size={16} color={n.colors.accent} />
              <LinearText style={styles.cleanupText}>
                {renamableFiles.length} file{renamableFiles.length !== 1 ? 's' : ''} with unclear
                names
              </LinearText>
              <LinearText style={styles.renameAction}>AI Rename</LinearText>
            </TouchableOpacity>
          )}

          {/* Clean up failed AI artifacts */}
          {!isSelectionMode && (
            <TouchableOpacity
              style={styles.artifactCleanupBanner}
              onPress={async () => {
                const ok = await confirmDestructive(
                  'Clean up failed AI artifacts?',
                  'This will delete failed transcription recordings, empty lecture notes, and their orphaned files.',
                );
                if (ok) {
                  try {
                    const { cleanupFailedArtifacts } =
                      await import('../services/lecture/lectureSessionMonitor');
                    const cleaned = await cleanupFailedArtifacts();
                    showSuccess(
                      'Done',
                      cleaned > 0
                        ? `Cleaned up ${cleaned} failed artifact${cleaned !== 1 ? 's' : ''}.`
                        : 'No failed artifacts found.',
                    );
                  } catch {
                    showError('Failed to clean up artifacts.');
                  }
                }
              }}
            >
              <Ionicons name="construct-outline" size={16} color={n.colors.warning} />
              <LinearText style={styles.cleanupText}>
                Failed transcriptions & empty notes
              </LinearText>
              <LinearText style={styles.cleanupAction}>Clean up</LinearText>
            </TouchableOpacity>
          )}

          {/* Rename progress */}
          {renameProgress && (
            <View style={styles.renameBanner}>
              <ActivityIndicator size="small" color={n.colors.accent} />
              <LinearText style={styles.cleanupText} numberOfLines={2}>
                {renameProgress}
              </LinearText>
            </View>
          )}

          {/* Process progress */}
          {processProgress && (
            <View style={styles.processBanner}>
              <ActivityIndicator size="small" color={n.colors.success ?? n.colors.success} />
              <LinearText style={styles.cleanupText}>
                Processing transcript {processProgress}...
              </LinearText>
            </View>
          )}

          {/* Selection banner */}
          {isSelectionMode && (
            <View style={styles.selectionBanner}>
              <LinearText style={styles.selectionText}>{selectedPaths.size} selected</LinearText>
              <View style={styles.selectionActions}>
                <TouchableOpacity style={styles.selectionCancelBtn} onPress={cancelSelection}>
                  <LinearText style={styles.selectionCancelText}>Cancel</LinearText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.selectionProcessBtn} onPress={handleBatchProcess}>
                  <Ionicons name="sparkles" size={14} color="#fff" />
                  <LinearText style={styles.selectionDeleteText}>Process</LinearText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.selectionDeleteBtn} onPress={handleBatchDelete}>
                  <Ionicons name="trash-outline" size={14} color="#fff" />
                  <LinearText style={styles.selectionDeleteText}>Delete</LinearText>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Permission banner */}
          {needsFileAccess && (
            <TouchableOpacity
              style={styles.permBanner}
              onPress={async () => {
                await requestAllFilesAccess();
              }}
            >
              <Ionicons name="lock-open-outline" size={18} color={n.colors.warning} />
              <LinearText style={styles.permBannerText}>
                Grant file access to scan all transcript folders.
              </LinearText>
              <Ionicons name="chevron-forward" size={16} color={n.colors.textMuted} />
            </TouchableOpacity>
          )}

          {loading ? (
            <View style={styles.center}>
              <LoadingOrb message="Scanning transcripts..." size={120} />
            </View>
          ) : (
            <FlatList
              data={sortedFiles.slice(0, displayCount)}
              key={listLayoutKey}
              keyExtractor={(item) => item.path}
              renderItem={renderItem}
              extraData={listLayoutKey}
              contentContainerStyle={[styles.list, sortedFiles.length === 0 && { flex: 1 }]}
              showsVerticalScrollIndicator={false}
              initialNumToRender={10}
              maxToRenderPerBatch={5}
              windowSize={11}
              removeClippedSubviews={Platform.OS === 'android' ? true : undefined}
              updateCellsBatchingPeriod={100}
              ListEmptyComponent={
                <EmptyState
                  icon="mic-outline"
                  iconSize={64}
                  title="No Transcripts Yet"
                  subtitle="Record lectures or import text files to get started."
                />
              }
            />
          )}
          {!loading && sortedFiles.length > 0 && displayCount < sortedFiles.length && (
            <TouchableOpacity
              style={styles.loadMoreBtn}
              onPress={() => loadMore()}
              activeOpacity={0.7}
            >
              <LinearText style={styles.loadMoreText}>
                Load More ({sortedFiles.length - displayCount} remaining)
              </LinearText>
            </TouchableOpacity>
          )}

          {/* Full-screen reader */}
          <Modal
            visible={!!readerContent}
            animationType="slide"
            onRequestClose={() => setReaderContent(null)}
          >
            <View style={styles.readerContainer}>
              <View style={styles.readerHeader}>
                <TouchableOpacity
                  onPress={() => setReaderContent(null)}
                  style={styles.readerCloseBtn}
                >
                  <Ionicons name="arrow-back" size={22} color={n.colors.textPrimary} />
                </TouchableOpacity>
                <LinearText style={styles.readerHeaderTitle} numberOfLines={2}>
                  {readerTitle}
                </LinearText>
                <TouchableOpacity
                  onPress={() => {
                    if (readerContent) {
                      Clipboard.setString(readerContent);
                      Haptics.selectionAsync();
                    }
                  }}
                  style={styles.readerCopyBtn}
                >
                  <Ionicons name="copy-outline" size={20} color={n.colors.textMuted} />
                </TouchableOpacity>
              </View>
              <ScrollView
                style={styles.readerScroll}
                contentContainerStyle={styles.readerScrollContent}
              >
                <LinearText style={styles.readerText}>{readerContent}</LinearText>
              </ScrollView>
            </View>
          </Modal>
        </ResponsiveContainer>
      </ErrorBoundary>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  container: { flex: 1 },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryCard: {
    gap: 14,
    marginHorizontal: n.spacing.lg,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  summaryCopy: { flex: 1, gap: 4 },
  summaryEyebrow: { letterSpacing: 1 },
  summaryTitle: { maxWidth: 440 },
  summaryText: { lineHeight: 20, maxWidth: 520 },
  summaryPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: n.radius.full,
    backgroundColor: n.colors.card,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  summaryMetricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryMetricCard: {
    flexGrow: 1,
    minWidth: 120,
    borderRadius: n.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: n.colors.card,
    borderWidth: 1,
    borderColor: n.colors.border,
    gap: 2,
  },
  summaryMetricValue: {},
  summaryMetricLabel: { fontWeight: '600' },
  toolbarCard: {
    gap: 10,
    marginHorizontal: n.spacing.lg,
    marginTop: 12,
  },
  toolbarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  toolbarCopy: { flex: 1, gap: 2 },
  toolbarTitle: { fontWeight: '700' },
  toolbarSubtitle: { lineHeight: 19 },
  toolbarPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: n.radius.full,
    backgroundColor: n.colors.card,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  topActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  topActionBtn: {
    flex: 1,
    minHeight: 52,
  },
  topActionBtnDisabled: {
    opacity: 0.6,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: captureBorderAlpha['20'],
    backgroundColor: n.colors.accent + '18',
  },
  sortLabel: { color: n.colors.accent, fontSize: 12, fontWeight: '700' },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: n.colors.border,
    backgroundColor: whiteAlpha['5'],
  },
  list: { padding: n.spacing.lg, paddingBottom: 40 },
  loadMoreBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginHorizontal: n.spacing.lg,
    marginBottom: 24,
    borderRadius: 12,
    backgroundColor: n.colors.accent + '12',
    borderWidth: 1,
    borderColor: n.colors.accent + '30',
  },
  loadMoreText: {
    color: n.colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: n.spacing.lg,
    marginBottom: 10,
  },
  cardSelected: { borderColor: n.colors.accent, backgroundColor: n.colors.accent + '12' },
  cardIcon: { marginRight: 12 },
  cardBody: { flex: 1, minWidth: 0 },
  cardName: { color: n.colors.textPrimary, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  cardMeta: { color: n.colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 2 },
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
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
    marginTop: 40,
    gap: 16,
  },
  emptyTitle: {
    color: n.colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: n.colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyText: {
    color: n.colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
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
  cleanupBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: n.colors.error + '12',
    marginHorizontal: n.spacing.lg,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: n.radius.md,
    borderWidth: 1,
    borderColor: n.colors.error + '30',
  },
  cleanupText: {
    flex: 1,
    color: n.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  cleanupAction: { color: n.colors.error, fontSize: 13, fontWeight: '800' },
  dupeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: n.colors.warning + '12',
    marginHorizontal: n.spacing.lg,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: n.radius.md,
    borderWidth: 1,
    borderColor: n.colors.warning + '30',
  },
  dupeAction: { color: n.colors.warning, fontSize: 13, fontWeight: '800' },
  renameBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: n.colors.accent + '12',
    marginHorizontal: n.spacing.lg,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: n.radius.md,
    borderWidth: 1,
    borderColor: n.colors.accent + '30',
  },
  renameAction: { color: n.colors.accent, fontSize: 13, fontWeight: '800' },
  artifactCleanupBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: n.colors.warning + '12',
    marginHorizontal: n.spacing.lg,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: n.colors.warning + '44',
  },
  processBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#4CAF5012',
    marginHorizontal: n.spacing.lg,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: n.radius.md,
    borderWidth: 1,
    borderColor: '#4CAF5030',
  },
  selectionProcessBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: n.colors.success ?? n.colors.success,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
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
  permBannerText: { flex: 1, color: n.colors.textSecondary, fontSize: 13, lineHeight: 18 },
  readerContainer: { flex: 1, backgroundColor: n.colors.background },
  readerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: n.colors.border,
    gap: 10,
  },
  readerCloseBtn: { padding: 6 },
  readerHeaderTitle: {
    flex: 1,
    color: n.colors.textPrimary,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  readerCopyBtn: { padding: 6 },
  readerScroll: { flex: 1 },
  readerScrollContent: { padding: 20, paddingBottom: 60 },
  readerText: { color: n.colors.textSecondary, fontSize: 14, lineHeight: 22 },
});
