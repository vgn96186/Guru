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
  Pressable,
  FlatList,
  StyleSheet,
  StatusBar,
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
  AppState,
  useWindowDimensions,
} from 'react-native';
import LinearText from '../components/primitives/LinearText';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import Clipboard from '@react-native-clipboard/clipboard';
import * as DocumentPicker from 'expo-document-picker';
import {
  listPublicBackups,
  getPublicBackupDir,
  hasAllFilesAccess,
  requestAllFilesAccess,
  deleteRecording,
} from '../../modules/app-launcher';
import { z } from 'zod';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { linearTheme as n } from '../theme/linearTheme';
import ScreenHeader from '../components/ScreenHeader';
import LinearButton from '../components/primitives/LinearButton';
import LinearSurface from '../components/primitives/LinearSurface';
import { generateJSONWithRouting } from '../services/ai/generate';
import type { Message } from '../services/ai/types';
import { analyzeTranscript } from '../services/transcription/analysis';
import { generateADHDNote } from '../services/transcription/noteGeneration';
import { saveLectureTranscript } from '../db/queries/aiCache';
import { getSubjectByName } from '../db/queries/topics';
import { saveTranscriptToFile } from '../services/transcriptStorage';

interface TranscriptFile {
  name: string;
  path: string; // full file:// URI
  sizeMB: number;
  folder: string;
  wordCount: number;
  contentHash: string; // first 200 chars trimmed — used for duplicate detection
  extractedTitle: string; // subject/topic extracted from content
}

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
    const { parsed } = await generateJSONWithRouting(
      messages,
      TranscriptLabelSchema,
      'low',
      false,
      'groq',
    );
    if (parsed.subject && parsed.topic) return parsed;
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
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
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
      datePart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
  const [files, setFiles] = useState<TranscriptFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsFileAccess, setNeedsFileAccess] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [isImportingText, setIsImportingText] = useState(false);

  // Reader
  const [readerContent, setReaderContent] = useState<string | null>(null);
  const [readerTitle, setReaderTitle] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'words'>('name');
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
    } catch (e) {
      console.warn('[TranscriptVault] Failed to scan:', e);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const isSelectionMode = selectedPaths.size > 0;

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

  const cancelSelection = useCallback(() => setSelectedPaths(new Set()), []);

  const handleBatchDelete = useCallback(() => {
    const count = selectedPaths.size;
    Alert.alert(`Delete ${count} transcript${count !== 1 ? 's' : ''}?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          for (const p of selectedPaths) {
            try {
              await deleteFile(p);
            } catch {
              /* skip */
            }
          }
          setFiles((prev) => prev.filter((f) => !selectedPaths.has(f.path)));
          setSelectedPaths(new Set());
        },
      },
    ]);
  }, [selectedPaths]);

  const handleUploadText = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
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
      Alert.alert('Imported', `${asset.name ?? 'Text file'} was added to Transcript Vault.`);
    } catch (e: any) {
      Alert.alert('Import failed', e?.message ?? 'Could not import this text file.');
    } finally {
      setIsImportingText(false);
    }
  }, [loadFiles]);

  const handleRead = useCallback(async (item: TranscriptFile) => {
    try {
      const content = await FileSystem.readAsStringAsync(item.path);
      setReaderTitle(displayName(item.name, item.extractedTitle));
      setReaderContent(content || '(Empty file)');
    } catch (e: any) {
      Alert.alert('Error', `Could not read file: ${e?.message ?? e}`);
    }
  }, []);

  const handleDelete = useCallback((item: TranscriptFile) => {
    Alert.alert('Delete transcript?', item.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteFile(item.path);
            setFiles((prev) => prev.filter((f) => f.path !== item.path));
          } catch {
            Alert.alert('Error', 'Could not delete the file. Check file access permissions.');
          }
        },
      },
    ]);
  }, []);

  const [processProgress, setProcessProgress] = useState<string | null>(null);

  const processTranscript = useCallback(async (item: TranscriptFile): Promise<boolean> => {
    const content = await FileSystem.readAsStringAsync(item.path);
    if (countWords(content) < 10) {
      Alert.alert(
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
    (item: TranscriptFile) => {
      Alert.alert(
        'Process to Notes?',
        `AI will analyze this transcript and create a study note.\n\n${displayName(item.name, item.extractedTitle)}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Process',
            onPress: async () => {
              setProcessProgress('Analyzing...');
              try {
                await processTranscript(item);
                setProcessProgress(null);
                Alert.alert('Done', 'Note created in Notes Vault.');
              } catch (e: any) {
                setProcessProgress(null);
                Alert.alert('Failed', e?.message ?? 'Could not process transcript.');
              }
            },
          },
        ],
      );
    },
    [processTranscript],
  );

  const handleBatchProcess = useCallback(() => {
    const targets = [...selectedPaths];
    const items = files.filter((f) => targets.includes(f.path) && f.wordCount >= 10);
    if (items.length === 0) {
      Alert.alert('No valid transcripts', 'Selected transcripts are too short to process.');
      return;
    }
    Alert.alert(
      `Process ${items.length} transcript${items.length !== 1 ? 's' : ''}?`,
      'Each will be analyzed by AI and saved as a study note. 2 API calls per transcript.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Process All',
          onPress: async () => {
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
            Alert.alert(
              'Done',
              `Created ${done} note${done !== 1 ? 's' : ''}${failed > 0 ? ` (${failed} failed)` : ''}.`,
            );
          },
        },
      ],
    );
  }, [selectedPaths, files, processTranscript]);

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

  const handleSmartRename = useCallback(() => {
    const count = renamableFiles.length;
    Alert.alert(
      `AI-rename ${count} transcript${count !== 1 ? 's' : ''}?`,
      'Reads each transcript, asks AI for the subject & topic, then renames the file. Uses 1 quick API call per file.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rename',
          onPress: async () => {
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
            Alert.alert(
              'Done',
              `Renamed ${renamed} file${renamed !== 1 ? 's' : ''}${failed > 0 ? ` (${failed} failed)` : ''}.`,
            );
          },
        },
      ],
    );
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

  const sortedFiles = React.useMemo(() => {
    const copy = [...files];
    if (sortBy === 'words') copy.sort((a, b) => a.wordCount - b.wordCount);
    else copy.sort((a, b) => b.name.localeCompare(a.name));
    return copy;
  }, [files, sortBy]);

  const renderItem = ({ item }: { item: TranscriptFile }) => {
    const isSelected = selectedPaths.has(item.path);
    return (
      <Pressable
        onLongPress={() => handleLongPress(item.path)}
        onPress={() => {
          if (isSelectionMode) {
            Haptics.selectionAsync();
            toggleSelection(item.path);
            return;
          }
          void handleRead(item);
        }}
        delayLongPress={220}
      >
        <LinearSurface
          padded={false}
          borderColor={isSelected ? n.colors.accent : n.colors.border}
          style={[styles.card, isSelected && styles.cardSelected]}
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
              <Ionicons name="document-text-outline" size={24} color={n.colors.accent} />
            </View>
          )}
          <View style={styles.cardBody}>
            <LinearText style={styles.cardName} numberOfLines={3} ellipsizeMode="tail">
              {displayName(item.name, item.extractedTitle)}
            </LinearText>
            <LinearText style={styles.cardMeta}>
              {item.wordCount.toLocaleString()} words · {item.folder}
              {item.sizeMB > 0 ? ` · ${item.sizeMB} KB` : ''}
            </LinearText>
          </View>
          {!isSelectionMode && (
            <View style={styles.cardActions}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => handleProcess(item)}>
                <Ionicons name="sparkles" size={20} color={n.colors.success ?? n.colors.success} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => void handleRead(item)}>
                <Ionicons name="book-outline" size={20} color={n.colors.accent} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(item)}>
                <Ionicons name="trash-outline" size={20} color={n.colors.error} />
              </TouchableOpacity>
            </View>
          )}
        </LinearSurface>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ResponsiveContainer style={styles.container}>
        <ScreenHeader
          title="Transcript Vault"
          subtitle={`${files.length} transcript${files.length !== 1 ? 's' : ''} found`}
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
        />

        <View style={styles.topActions}>
          <LinearButton
            variant="glass"
            style={styles.topActionBtn}
            onPress={() => navigation.navigate('ManualNoteCreation' as never)}
            leftIcon={<Ionicons name="clipboard-outline" size={18} color={n.colors.error} />}
            label="Paste Transcript"
          />
          <LinearButton
            variant="glass"
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

        {/* Cleanup junk banner */}
        {!isSelectionMode && files.filter((f) => f.wordCount < 10).length > 0 && (
          <TouchableOpacity
            style={styles.cleanupBanner}
            onPress={() => {
              const junk = files.filter((f) => f.wordCount < 10);
              Alert.alert(
                `Delete ${junk.length} junk transcript${junk.length !== 1 ? 's' : ''}?`,
                'This will permanently delete all transcripts with fewer than 10 words.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete All',
                    style: 'destructive',
                    onPress: async () => {
                      for (const f of junk) {
                        try {
                          await deleteFile(f.path);
                        } catch {
                          /* skip */
                        }
                      }
                      const junkPaths = new Set(junk.map((f) => f.path));
                      setFiles((prev) => prev.filter((f) => !junkPaths.has(f.path)));
                    },
                  },
                ],
              );
            }}
          >
            <Ionicons name="trash-outline" size={16} color={n.colors.error} />
            <LinearText style={styles.cleanupText}>
              {files.filter((f) => f.wordCount < 10).length} junk transcript
              {files.filter((f) => f.wordCount < 10).length !== 1 ? 's' : ''} ({'<'}10 words)
            </LinearText>
            <LinearText style={styles.cleanupAction}>Clean up</LinearText>
          </TouchableOpacity>
        )}

        {/* Duplicate cleanup banner */}
        {!isSelectionMode && duplicatePaths.size > 0 && (
          <TouchableOpacity
            style={styles.dupeBanner}
            onPress={() => {
              Alert.alert(
                `Delete ${duplicatePaths.size} duplicate${duplicatePaths.size !== 1 ? 's' : ''}?`,
                'Keeps the newest copy of each transcript and deletes older duplicates.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete Duplicates',
                    style: 'destructive',
                    onPress: async () => {
                      for (const p of duplicatePaths) {
                        try {
                          await deleteFile(p);
                        } catch {
                          /* skip */
                        }
                      }
                      setFiles((prev) => prev.filter((f) => !duplicatePaths.has(f.path)));
                    },
                  },
                ],
              );
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
            <ActivityIndicator size="large" color={n.colors.accent} />
            <LinearText style={styles.emptyText}>Scanning transcripts...</LinearText>
          </View>
        ) : files.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="document-text-outline" size={48} color={n.colors.textMuted} />
            <LinearText style={styles.emptyTitle}>No transcripts found</LinearText>
            <LinearText style={styles.emptyText}>
              Transcript files (.txt) appear here from your Documents/Guru folder and internal
              backups.
            </LinearText>
          </View>
        ) : (
          <FlatList
            data={sortedFiles}
            key={listLayoutKey}
            keyExtractor={(item) => item.path}
            renderItem={renderItem}
            extraData={listLayoutKey}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
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
  topActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: n.spacing.lg,
    paddingTop: 10,
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
    borderColor: 'rgba(130,170,255,0.2)',
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
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  list: { padding: n.spacing.lg, paddingBottom: 40 },
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
