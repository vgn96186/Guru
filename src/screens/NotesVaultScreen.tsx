/**
 * NotesVaultScreen
 *
 * Clean, processed AI study notes — separated from raw transcripts.
 * Shows only lecture_notes entries that have a non-empty `note` field.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  RefreshControl,
  Alert,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Clipboard from '@react-native-clipboard/clipboard';
import { z } from 'zod';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import { MarkdownRender } from '../components/MarkdownRender';
import ScreenHeader from '../components/ScreenHeader';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { theme } from '../constants/theme';
import {
  getLectureHistory,
  deleteLectureNote,
  updateLectureAnalysisMetadata,
  type LectureHistoryItem,
} from '../db/queries/aiCache';
import { getSubjectByName } from '../db/queries/topics';
import { generateJSONWithRouting } from '../services/ai/generate';
import type { Message } from '../services/ai/types';
import { CONFIDENCE_LABELS } from '../constants/gamification';
import type { TabParamList } from '../navigation/types';

const NoteLabelSchema = z.object({
  subject: z.string().describe('NEET-PG medical subject (e.g. "Anatomy", "Pharmacology", "Pathology")'),
  title: z.string().describe('Short note title — noun phrase only, no verbs (e.g. "Cardiac Valves & Murmurs", "Beta Blockers — MOA & Side Effects")'),
  topics: z.array(z.string()).describe('2-5 specific medical topics covered'),
});

async function aiRelabelNote(noteText: string): Promise<{ subject: string; title: string; topics: string[] } | null> {
  try {
    const snippet = noteText.split(/\s+/).slice(0, 800).join(' ');
    const messages: Message[] = [
      {
        role: 'system',
        content: `You label medical study notes. Return a subject, title, and topics.

TITLE RULES:
- Must be a short noun phrase like a textbook chapter heading (max 60 chars)
- NEVER start with "This note covers", "Focuses on", "Overview of", "The note discusses" or similar
- Good: "Cardiac Valves & Murmurs", "Iron Deficiency Anemia", "Brachial Plexus Injuries"
- Bad: "This note covers cardiac anatomy", "Focuses on iron metabolism"

Subject must be one of: Anatomy, Physiology, Biochemistry, Pathology, Pharmacology, Microbiology, Forensic Medicine, ENT, Ophthalmology, Community Medicine, Surgery, Medicine, OBG, Pediatrics, Orthopedics, Dermatology, Psychiatry, Radiology, Anesthesia.`,
      },
      { role: 'user', content: snippet },
    ];
    const { parsed } = await generateJSONWithRouting(messages, NoteLabelSchema, 'low', false);
    return parsed;
  } catch {
    return null;
  }
}

function countWords(text: string): number {
  return text?.trim() ? text.trim().split(/\s+/).length : 0;
}

const SUBJECT_COLORS: Record<string, string> = {
  Physiology: '#4CAF50',
  Anatomy: '#2196F3',
  Biochemistry: '#FF9800',
  Pathology: '#F44336',
  Pharmacology: '#9C27B0',
  Microbiology: '#00BCD4',
  'Forensic Medicine': '#795548',
  ENT: '#607D8B',
  Ophthalmology: '#3F51B5',
  'Community Medicine': '#8BC34A',
  Surgery: '#E91E63',
  Medicine: '#009688',
  'OBG': '#FF5722',
  Pediatrics: '#CDDC39',
  Orthopedics: '#FFC107',
  Dermatology: '#673AB7',
  Psychiatry: '#00ACC1',
  Radiology: '#546E7A',
  Anesthesia: '#D32F2F',
};

type NoteItem = LectureHistoryItem;

function getTitle(item: NoteItem): string {
  if (item.summary) return item.summary;
  if (item.topics.length > 0) return item.topics.slice(0, 3).join(', ');
  return item.note?.slice(0, 60) || 'Untitled Note';
}

function buildNoteGroundingContext(item: NoteItem): string {
  return [
    `Title: ${getTitle(item)}`,
    `Subject: ${item.subjectName || 'Unknown'}`,
    item.topics.length > 0 ? `Topics: ${item.topics.join(', ')}` : null,
    item.summary ? `Summary: ${item.summary}` : null,
    item.appName ? `Source: ${item.appName}` : null,
    `Saved note:\n${item.note.trim().slice(0, 4500)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildVaultGroundingContext(notes: NoteItem[]): string {
  return notes
    .slice(0, 5)
    .map((note, index) => `Note ${index + 1}\n${buildNoteGroundingContext(note)}`)
    .join('\n\n---\n\n');
}

export default function NotesVaultScreen() {
  const navigation = useNavigation();
  const tabsNavigation = navigation.getParent<NavigationProp<TabParamList>>();
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<'date' | 'subject' | 'words'>('date');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [topicFilter, setTopicFilter] = useState<string>('all');

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const isSelectionMode = selectedIds.size > 0;

  // Reader modal
  const [readerContent, setReaderContent] = useState<string | null>(null);
  const [readerTitle, setReaderTitle] = useState('');
  const [readerNote, setReaderNote] = useState<NoteItem | null>(null);

  const loadNotes = useCallback(async () => {
    const all = await getLectureHistory(500);
    // Only show entries with a processed AI note
    const withNotes = all.filter((n) => n.note?.trim() && n.note.length > 20);
    setNotes(withNotes);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadNotes();
    }, [loadNotes]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadNotes();
    setRefreshing(false);
  }, [loadNotes]);

  const visibleNotes = useMemo(() => {
    let filtered = notes;
    if (subjectFilter !== 'all') {
      filtered = filtered.filter((n) => (n.subjectName || 'Unknown') === subjectFilter);
    }
    if (topicFilter !== 'all') {
      filtered = filtered.filter((n) => n.topics.includes(topicFilter));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (n) =>
          n.note?.toLowerCase().includes(q) ||
          n.summary?.toLowerCase().includes(q) ||
          n.subjectName?.toLowerCase().includes(q) ||
          n.topics.some((t) => t.toLowerCase().includes(q)),
      );
    }
    const sorted = [...filtered];
    if (sortBy === 'subject') {
      sorted.sort((a, b) => (a.subjectName ?? '').localeCompare(b.subjectName ?? ''));
    } else if (sortBy === 'words') {
      sorted.sort((a, b) => countWords(a.note) - countWords(b.note));
    }
    // date sort is default from DB (newest first)
    return sorted;
  }, [notes, searchQuery, sortBy, subjectFilter, topicFilter]);

  const subjectOptions = useMemo(
    () =>
      [...new Set(notes.map((note) => note.subjectName || 'Unknown'))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [notes],
  );

  const topicOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of notes) {
      for (const topic of note.topics) {
        counts.set(topic, (counts.get(topic) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([topic]) => topic);
  }, [notes]);

  useEffect(() => {
    if (subjectFilter !== 'all' && !subjectOptions.includes(subjectFilter)) {
      setSubjectFilter('all');
    }
  }, [subjectFilter, subjectOptions]);

  useEffect(() => {
    if (topicFilter !== 'all' && !topicOptions.includes(topicFilter)) {
      setTopicFilter('all');
    }
  }, [topicFilter, topicOptions]);

  const toggleSelection = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleLongPress = useCallback((id: number) => {
    Haptics.selectionAsync();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const cancelSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleBatchDelete = useCallback(() => {
    const count = selectedIds.size;
    Alert.alert(`Delete ${count} note${count !== 1 ? 's' : ''}?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          let deleted = 0;
          let lastErr = '';
          for (const id of selectedIds) {
            try {
              await deleteLectureNote(id);
              deleted++;
            } catch (e: any) {
              lastErr = e?.message ?? String(e);
            }
          }
          setSelectedIds(new Set());
          // Optimistic removal from UI + full reload
          setNotes((prev) => prev.filter((n) => !selectedIds.has(n.id)));
          void loadNotes();
          if (deleted < selectedIds.size) {
            Alert.alert(
              'Some notes could not be deleted',
              `Deleted ${deleted}/${selectedIds.size}.\n\nError: ${lastErr}`,
            );
          }
        },
      },
    ]);
  }, [selectedIds, loadNotes]);

  // Junk notes: very short
  const junkNotes = useMemo(() => notes.filter((n) => countWords(n.note) < 80), [notes]);

  // Duplicate detection by content prefix
  const duplicateIds = useMemo(() => {
    const groups = new Map<string, NoteItem[]>();
    for (const n of notes) {
      if (!n.note || countWords(n.note) < 5) continue;
      const key = n.note.trim().slice(0, 200);
      const group = groups.get(key) ?? [];
      group.push(n);
      groups.set(key, group);
    }
    const dupes = new Set<number>();
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      // Keep newest, mark rest
      group.sort((a, b) => b.createdAt - a.createdAt);
      for (let i = 1; i < group.length; i++) dupes.add(group[i].id);
    }
    return dupes;
  }, [notes]);

  // Notes needing relabeling: no subject or generic labels
  const unlabeledNotes = useMemo(
    () => notes.filter((n) => {
      if (countWords(n.note) < 80) return false;
      const subj = (n.subjectName ?? '').toLowerCase();
      return !subj || subj === 'general' || subj === 'unknown' || subj === 'lecture' || (!n.summary && n.topics.length === 0);
    }),
    [notes],
  );

  const [relabelProgress, setRelabelProgress] = useState<string | null>(null);

  // Bad title patterns from previous AI runs
  const badTitleNotes = useMemo(
    () => notes.filter((n) => {
      const s = (n.summary ?? '').toLowerCase();
      return s && (/\b(covers?|focuses?|discusses?|overview of|about the|this note)\b/.test(s));
    }),
    [notes],
  );

  const runRelabel = useCallback(async (targets: NoteItem[]) => {
    let fixed = 0;
    let failed = 0;
    for (let i = 0; i < targets.length; i++) {
      const n = targets[i];
      setRelabelProgress(`${i + 1}/${targets.length}`);
      try {
        const label = await aiRelabelNote(n.note ?? '');
        if (!label) { failed++; continue; }

        let subjectId: number | null = null;
        if (label.subject) {
          const subj = await getSubjectByName(label.subject);
          if (subj) subjectId = subj.id;
        }

        await updateLectureAnalysisMetadata(n.id, {
          subjectId,
          summary: label.title || null,
          topics: label.topics?.length ? label.topics : undefined,
        });
        fixed++;
      } catch { failed++; }
    }
    setRelabelProgress(null);
    void loadNotes();
    Alert.alert('Done', `Labeled ${fixed} note${fixed !== 1 ? 's' : ''}${failed > 0 ? ` (${failed} failed)` : ''}.`);
  }, [loadNotes]);

  const handleRelabel = useCallback(() => {
    const count = unlabeledNotes.length;
    Alert.alert(
      `AI-label ${count} note${count !== 1 ? 's' : ''}?`,
      '1 quick API call per note.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Label', onPress: () => void runRelabel(unlabeledNotes) },
      ],
    );
  }, [unlabeledNotes, runRelabel]);

  const handleFixBadTitles = useCallback(() => {
    const count = badTitleNotes.length;
    Alert.alert(
      `Re-label ${count} note${count !== 1 ? 's' : ''}?`,
      'Fixes titles like "This note covers..." with proper noun-phrase headings. 1 API call per note.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Fix Titles', onPress: () => void runRelabel(badTitleNotes) },
      ],
    );
  }, [badTitleNotes, runRelabel]);

  const handleDeleteJunk = useCallback(() => {
    Alert.alert(
      `Delete ${junkNotes.length} junk note${junkNotes.length !== 1 ? 's' : ''}?`,
      'Permanently deletes notes with fewer than 80 words.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            for (const n of junkNotes) {
              try { await deleteLectureNote(n.id); } catch { /* skip */ }
            }
            void loadNotes();
          },
        },
      ],
    );
  }, [junkNotes, loadNotes]);

  const handleDeleteDuplicates = useCallback(() => {
    Alert.alert(
      `Delete ${duplicateIds.size} duplicate${duplicateIds.size !== 1 ? 's' : ''}?`,
      'Keeps the newest copy of each note.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            for (const id of duplicateIds) {
              try { await deleteLectureNote(id); } catch { /* skip */ }
            }
            void loadNotes();
          },
        },
      ],
    );
  }, [duplicateIds, loadNotes]);

  const getSubjectLabel = (item: NoteItem) => item.subjectName || 'Unknown';

  const handleAskGuruFromNotes = useCallback(() => {
    if (visibleNotes.length === 0) return;
    tabsNavigation?.navigate('ChatTab', {
      screen: 'GuruChat',
      params: {
        topicName: 'Notes Vault',
        groundingTitle:
          subjectFilter !== 'all' || topicFilter !== 'all'
            ? [subjectFilter !== 'all' ? subjectFilter : null, topicFilter !== 'all' ? topicFilter : null]
                .filter(Boolean)
                .join(' / ')
            : 'Saved notes',
        groundingContext: buildVaultGroundingContext(visibleNotes),
        autoFocusComposer: true,
      },
    });
  }, [subjectFilter, tabsNavigation, topicFilter, visibleNotes]);

  const handleAskGuruFromNote = useCallback(
    (item: NoteItem) => {
      setReaderContent(null);
      setReaderNote(null);
      tabsNavigation?.navigate('ChatTab', {
        screen: 'GuruChat',
        params: {
          topicName: getTitle(item),
          groundingTitle: getTitle(item),
          groundingContext: buildNoteGroundingContext(item),
          autoFocusComposer: true,
        },
      });
    },
    [tabsNavigation],
  );

  const formatDate = (ts: number): string => {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const renderNote = ({ item }: { item: NoteItem }) => {
    const subjectLabel = getSubjectLabel(item);
    const isSelected = selectedIds.has(item.id);

    return (
      <TouchableOpacity
        style={[styles.card, isSelected && styles.cardSelected]}
        activeOpacity={0.7}
        onLongPress={() => handleLongPress(item.id)}
        delayLongPress={220}
        onPress={() => {
          if (isSelectionMode) {
            Haptics.selectionAsync();
            toggleSelection(item.id);
            return;
          }
          setReaderTitle(getTitle(item));
          setReaderContent(item.note);
          setReaderNote(item);
        }}
      >
        {isSelectionMode && (
          <View style={styles.selectIcon}>
            <Ionicons
              name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={isSelected ? theme.colors.primary : theme.colors.textMuted}
            />
          </View>
        )}
        <View style={styles.cardHeader}>
          <View
            style={[
              styles.subjectChip,
              { backgroundColor: SUBJECT_COLORS[subjectLabel] ?? '#9E9E9E' },
            ]}
          >
            <Text style={styles.subjectText}>{subjectLabel}</Text>
          </View>
          <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
        </View>
        <Text style={styles.titleText} numberOfLines={2}>
          {getTitle(item)}
        </Text>
        {item.topics.length > 0 && (
          <View style={styles.topicsRow}>
            {item.topics.slice(0, 4).map((t, i) => (
              <Text key={i} style={styles.topicPill}>{t}</Text>
            ))}
            {item.topics.length > 4 && (
              <Text style={styles.moreBadge}>+{item.topics.length - 4}</Text>
            )}
          </View>
        )}
        <View style={styles.cardFooter}>
          {item.confidence > 0 && (
            <Text
              style={[
                styles.confidenceBadge,
                {
                  backgroundColor:
                    item.confidence === 3 ? '#4CAF50' : item.confidence === 2 ? '#FF9800' : '#F44336',
                },
              ]}
            >
              {CONFIDENCE_LABELS[item.confidence as 1 | 2 | 3]}
            </Text>
          )}
          <Text style={styles.wordCount}>{countWords(item.note).toLocaleString()} words</Text>
          {item.appName ? (
            <Text style={styles.appBadge}>via {item.appName}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <ResponsiveContainer style={styles.flex}>
        <ScreenHeader
          title="Notes Vault"
          subtitle={`${notes.length} processed study note${notes.length !== 1 ? 's' : ''}`}
        />

        {!isSelectionMode && visibleNotes.length > 0 && (
          <TouchableOpacity
            style={styles.askGuruBanner}
            onPress={handleAskGuruFromNotes}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Ask Guru using current notes"
          >
            <Ionicons name="sparkles-outline" size={18} color={theme.colors.primaryLight} />
            <View style={styles.askGuruBannerCopy}>
              <Text style={styles.askGuruBannerTitle}>Ask Guru</Text>
              <Text style={styles.askGuruBannerSubtitle}>
                Ground answers in your current notes view instead of generic chat memory.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* Selection banner */}
        {isSelectionMode && (
          <View style={styles.selectionBanner}>
            <Text style={styles.selectionText}>{selectedIds.size} selected</Text>
            <View style={styles.selectionActions}>
              <TouchableOpacity style={styles.selectionCancelBtn} onPress={cancelSelection}>
                <Text style={styles.selectionCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.selectionDeleteBtn} onPress={handleBatchDelete}>
                <Ionicons name="trash-outline" size={14} color="#fff" />
                <Text style={styles.selectionDeleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Junk cleanup banner */}
        {!isSelectionMode && junkNotes.length > 0 && (
          <TouchableOpacity style={styles.cleanupBanner} onPress={handleDeleteJunk}>
            <Ionicons name="trash-outline" size={16} color={theme.colors.error} />
            <Text style={styles.bannerText}>
              {junkNotes.length} junk note{junkNotes.length !== 1 ? 's' : ''} ({'<'}80 words)
            </Text>
            <Text style={styles.bannerActionError}>Clean up</Text>
          </TouchableOpacity>
        )}

        {/* Duplicate cleanup banner */}
        {!isSelectionMode && duplicateIds.size > 0 && (
          <TouchableOpacity style={styles.dupeBanner} onPress={handleDeleteDuplicates}>
            <Ionicons name="copy-outline" size={16} color={theme.colors.warning} />
            <Text style={styles.bannerText}>
              {duplicateIds.size} duplicate{duplicateIds.size !== 1 ? 's' : ''} found
            </Text>
            <Text style={styles.bannerActionWarning}>Remove</Text>
          </TouchableOpacity>
        )}

        {/* AI relabel banner */}
        {!isSelectionMode && unlabeledNotes.length > 0 && !relabelProgress && (
          <TouchableOpacity style={styles.relabelBanner} onPress={handleRelabel}>
            <Ionicons name="sparkles-outline" size={16} color={theme.colors.primary} />
            <Text style={styles.bannerText}>
              {unlabeledNotes.length} note{unlabeledNotes.length !== 1 ? 's' : ''} with unclear labels
            </Text>
            <Text style={styles.bannerActionPrimary}>AI Label</Text>
          </TouchableOpacity>
        )}

        {/* Fix bad titles banner */}
        {!isSelectionMode && badTitleNotes.length > 0 && !relabelProgress && (
          <TouchableOpacity style={styles.relabelBanner} onPress={handleFixBadTitles}>
            <Ionicons name="pencil-outline" size={16} color={theme.colors.primary} />
            <Text style={styles.bannerText}>
              {badTitleNotes.length} note{badTitleNotes.length !== 1 ? 's' : ''} with bad titles
            </Text>
            <Text style={styles.bannerActionPrimary}>Fix Titles</Text>
          </TouchableOpacity>
        )}

        {/* Relabel progress */}
        {relabelProgress && (
          <View style={styles.relabelBanner}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={styles.bannerText}>Labeling note {relabelProgress}...</Text>
          </View>
        )}

        {/* Search */}
        <View style={styles.searchRow}>
          <Ionicons name="search" size={20} color="#888" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search notes, topics, subjects..."
            placeholderTextColor={theme.colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#888" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Sort */}
        {notes.length > 0 && !searchQuery && (
          <View style={styles.sortBar}>
            {(['date', 'subject', 'words'] as const).map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[styles.sortBtn, sortBy === opt && styles.sortBtnActive]}
                onPress={() => setSortBy(opt)}
              >
                <Text style={[styles.sortBtnText, sortBy === opt && styles.sortBtnTextActive]}>
                  {opt === 'date' ? 'Newest' : opt === 'subject' ? 'Subject' : 'Words'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {subjectOptions.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            <TouchableOpacity
              style={[styles.filterChip, subjectFilter === 'all' && styles.filterChipActive]}
              onPress={() => setSubjectFilter('all')}
            >
              <Text
                style={[styles.filterChipText, subjectFilter === 'all' && styles.filterChipTextActive]}
              >
                All subjects
              </Text>
            </TouchableOpacity>
            {subjectOptions.map((subject) => (
              <TouchableOpacity
                key={subject}
                style={[styles.filterChip, subjectFilter === subject && styles.filterChipActive]}
                onPress={() => setSubjectFilter(subject)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    subjectFilter === subject && styles.filterChipTextActive,
                  ]}
                >
                  {subject}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {topicOptions.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.filterRow, styles.filterRowCompact]}
          >
            <TouchableOpacity
              style={[styles.filterChip, topicFilter === 'all' && styles.filterChipActive]}
              onPress={() => setTopicFilter('all')}
            >
              <Text
                style={[styles.filterChipText, topicFilter === 'all' && styles.filterChipTextActive]}
              >
                All topics
              </Text>
            </TouchableOpacity>
            {topicOptions.map((topic) => (
              <TouchableOpacity
                key={topic}
                style={[styles.filterChip, topicFilter === topic && styles.filterChipActive]}
                onPress={() => setTopicFilter(topic)}
              >
                <Text
                  style={[styles.filterChipText, topicFilter === topic && styles.filterChipTextActive]}
                >
                  {topic}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* List */}
        {visibleNotes.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={48} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>
              {searchQuery ? 'No Results' : 'No Notes Yet'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery
                ? `Nothing matches "${searchQuery}"`
                : 'Process recordings, paste transcripts, or upload text to generate study notes.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={visibleNotes}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderNote}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={theme.colors.textPrimary}
              />
            }
          />
        )}

        {/* Full-screen reader */}
        <Modal
          visible={!!readerContent}
          animationType="slide"
          onRequestClose={() => {
            setReaderContent(null);
            setReaderNote(null);
          }}
        >
          <View style={styles.readerContainer}>
            <View style={styles.readerHeader}>
              <TouchableOpacity
                onPress={() => {
                  setReaderContent(null);
                  setReaderNote(null);
                }}
                style={styles.readerCloseBtn}
              >
                <Ionicons name="arrow-back" size={22} color={theme.colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.readerHeaderTitle} numberOfLines={1}>
                {readerTitle}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  if (readerContent) {
                    Clipboard.setString(readerContent);
                    Haptics.selectionAsync();
                  }
                }}
                style={styles.readerCopyBtn}
              >
                <Ionicons name="copy-outline" size={20} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>
            {readerNote ? (
              <TouchableOpacity
                style={styles.readerAskGuruBtn}
                onPress={() => handleAskGuruFromNote(readerNote)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Ask Guru from this note"
              >
                <Ionicons name="sparkles-outline" size={16} color={theme.colors.primaryLight} />
                <Text style={styles.readerAskGuruText}>Ask Guru From This Note</Text>
              </TouchableOpacity>
            ) : null}
            <ScrollView
              style={styles.readerScroll}
              contentContainerStyle={styles.readerScrollContent}
              showsVerticalScrollIndicator
            >
              <MarkdownRender content={readerContent ?? ''} />
            </ScrollView>
          </View>
        </Modal>
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  list: { padding: 16, paddingBottom: 40 },
  askGuruBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: theme.colors.primary + '12',
    borderWidth: 1,
    borderColor: theme.colors.primary + '35',
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  askGuruBannerCopy: {
    flex: 1,
  },
  askGuruBannerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  askGuruBannerSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    margin: 16,
    marginTop: 0,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 8,
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  filterRowCompact: {
    paddingBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterChipActive: {
    backgroundColor: theme.colors.primary + '18',
    borderColor: theme.colors.primary + '45',
  },
  filterChipText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: theme.colors.primaryLight,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 14,
    padding: 0,
  },
  sortBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  sortBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sortBtnActive: {
    backgroundColor: theme.colors.primary + '22',
    borderColor: theme.colors.primary,
  },
  sortBtnText: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '600' },
  sortBtnTextActive: { color: theme.colors.primary, fontWeight: '700' },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '12',
  },
  selectIcon: { position: 'absolute', top: 10, right: 10, zIndex: 2 },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  subjectChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    flexShrink: 1,
  },
  subjectText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  dateText: { color: '#888', fontSize: 12, flexShrink: 0, marginLeft: 8 },
  titleText: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    marginBottom: 8,
  },
  topicsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 8,
  },
  topicPill: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    backgroundColor: theme.colors.card,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
  },
  moreBadge: {
    color: theme.colors.textMuted,
    fontSize: 11,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  confidenceBadge: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
  },
  wordCount: { color: theme.colors.textMuted, fontSize: 11 },
  appBadge: { color: '#666', fontSize: 11 },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    color: theme.colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  cleanupBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.colors.error + '12', marginHorizontal: 16,
    marginBottom: 8, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: theme.borderRadius.md, borderWidth: 1, borderColor: theme.colors.error + '30',
  },
  dupeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.colors.warning + '12', marginHorizontal: 16,
    marginBottom: 8, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: theme.borderRadius.md, borderWidth: 1, borderColor: theme.colors.warning + '30',
  },
  relabelBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.colors.primary + '12', marginHorizontal: 16,
    marginBottom: 8, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: theme.borderRadius.md, borderWidth: 1, borderColor: theme.colors.primary + '30',
  },
  bannerText: { flex: 1, color: theme.colors.textSecondary, fontSize: 13, fontWeight: '600' },
  bannerActionError: { color: theme.colors.error, fontSize: 13, fontWeight: '800' },
  bannerActionWarning: { color: theme.colors.warning, fontSize: 13, fontWeight: '800' },
  bannerActionPrimary: { color: theme.colors.primary, fontSize: 13, fontWeight: '800' },
  selectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.primary + '18',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.primary + '40',
  },
  selectionText: { color: theme.colors.primary, fontSize: 14, fontWeight: '700' },
  selectionActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  selectionCancelBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  selectionCancelText: { color: theme.colors.primary, fontSize: 13, fontWeight: '700' },
  selectionDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.error,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  selectionDeleteText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  readerContainer: { flex: 1, backgroundColor: theme.colors.background },
  readerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: 10,
  },
  readerCloseBtn: { padding: 6 },
  readerHeaderTitle: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  readerCopyBtn: { padding: 6 },
  readerScroll: { flex: 1 },
  readerScrollContent: { padding: 20, paddingBottom: 60 },
  readerAskGuruBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    marginTop: 12,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: theme.colors.primary + '16',
    borderWidth: 1,
    borderColor: theme.colors.primary + '35',
  },
  readerAskGuruText: {
    color: theme.colors.primaryLight,
    fontSize: 12,
    fontWeight: '800',
  },
});
