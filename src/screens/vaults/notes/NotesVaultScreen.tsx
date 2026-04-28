import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, useWindowDimensions, TouchableOpacity, RefreshControl, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { FlashList } from '@shopify/flash-list';



import { ErrorBoundary } from '../../../components/ErrorBoundary';
import { LoadingOrb } from '../../../components/LoadingOrb';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { BannerSearchBar } from '../../../components/BannerSearchBar';
import { EmptyState } from '../../../components/EmptyState';
import { LinearText } from '../../../components/primitives/LinearText';
import { ResponsiveContainer } from '../../../components/ResponsiveContainer';
import NoteCardItem from '../components/NoteCardItem';

import { countWords, getTitle, buildVaultGroundingContext, buildNoteGroundingContext } from './utils';
import { styles, n } from './styles';
import type { NoteItem } from './types';
import { SORT_OPTIONS } from './components/NotesVaultToolbar';

import { useNotesVaultData } from './hooks/useNotesVaultData';
import { useNotesVaultDiagnostics } from './hooks/useNotesVaultDiagnostics';
import { useNotesVaultRelabel } from './hooks/useNotesVaultRelabel';
import { useNotesVaultActions } from './hooks/useNotesVaultActions';

import NotesVaultSummaryCard from './components/NotesVaultSummaryCard';
import NotesVaultSelectionBanner from './components/NotesVaultSelectionBanner';
import NotesVaultToolbar from './components/NotesVaultToolbar';
import NotesVaultFilterSheet from './components/NotesVaultFilterSheet';
import NoteReaderModal from './components/NoteReaderModal';

const PAGE_SIZE = 25;

export default function NotesVaultScreen() {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const navigation = useNavigation();
  const tabsNavigation = navigation.getParent<NavigationProp<TabParamList>>();
  const { onScroll, onContentSizeChange, listRef } = useScrollRestoration('notes-vault');
  const [searchValueLocal, setSearchPersisted] = usePersistedInput('notes-vault-search', '');

  const {
    items: notes,
    setItems: setNotes,
    visibleItems: visibleNotes,
    searchValue,
    setSearchValue,
    sortBy,
    setSortBy,
    subjectFilter,
    setSubjectFilter,
    topicFilter,
    setTopicFilter,
    selectedIds,
    setSelectedIds,
    isSelectionMode,
    toggleSelection,
    handleLongPress,
    cancelSelection,
    displayCount,
    setDisplayCount,
    loadMore,
  } = useVaultList<NoteItem, number>({
    initialSortBy: 'date',
    pageSize: PAGE_SIZE,
    filterItem: (n, search, subj, top) => {
      if (subj !== 'all' && (n.subjectName || 'Unknown') !== subj) return false;
      if (top !== 'all' && !n.topics.includes(top)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return !!(
          n.note?.toLowerCase().includes(q) ||
          n.summary?.toLowerCase().includes(q) ||
          n.subjectName?.toLowerCase().includes(q) ||
          n.topics.some((t) => t.toLowerCase().includes(q))
        );
      }
      return true;
    },
    sortItems: (a, b, sort) => {
      if (sort === 'subject') return (a.subjectName ?? '').localeCompare(b.subjectName ?? '');
      if (sort === 'words') return countWords(a.note) - countWords(b.note);
      return b.createdAt - a.createdAt; // default 'date'
    },
  });

  // Sync search state from persisted input
  useEffect(() => {
    setSearchValue(searchValueLocal);
  }, [searchValueLocal, setSearchValue]);

  const handleSearchChange = useCallback(
    (v: string) => {
      setSearchValue(v);
      setSearchPersisted(v);
    },
    [setSearchValue, setSearchPersisted],
  );

  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);

  // Reader modal
  const [readerContent, setReaderContent] = useState<string | null>(null);
  const [readerTitle, setReaderTitle] = useState('');
  const [readerNote, setReaderNote] = useState<NoteItem | null>(null);

  const { loading, refreshing, loadNotes, handleRefresh } = useNotesVaultData(
    setNotes,
    setDisplayCount,
    PAGE_SIZE,
  );

  const {
    junkNotes,
    duplicateIds,
    unlabeledNotes,
    badTitleNotes,
    taggedNotesCount,
    wordCountMap,
  } = useNotesVaultDiagnostics(notes, visibleNotes);

  const { relabelProgress, handleRelabel, handleFixBadTitles } = useNotesVaultRelabel(loadNotes);

  const { handleSingleDelete, handleBatchDelete, handleDeleteJunk, handleDeleteDuplicates } =
    useNotesVaultActions(
      setNotes,
      selectedIds,
      setSelectedIds,
      loadNotes,
      junkNotes,
      duplicateIds,
    );

  const subjectOptions = useMemo(
    () =>
      [...new Set(notes.map((note) => note.subjectName || 'Unknown'))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [notes],
  );

  const topicOptions = useMemo(() => {
    const topicSourceNotes =
      subjectFilter === 'all'
        ? notes
        : notes.filter((note) => (note.subjectName || 'Unknown') === subjectFilter);
    const counts = new Map<string, number>();
    for (const note of topicSourceNotes) {
      for (const topic of note.topics) {
        counts.set(topic, (counts.get(topic) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([topic]) => topic);
  }, [notes, subjectFilter]);

  const activeFilterSummary = useMemo(() => {
    const parts: string[] = [];
    if (subjectFilter !== 'all') {
      parts.push(subjectFilter);
    }
    if (topicFilter !== 'all') {
      parts.push(topicFilter);
    }
    return parts.length > 0 ? parts.join(' • ') : 'All notes';
  }, [subjectFilter, topicFilter]);

  const listLayoutKey = `${viewportWidth}x${viewportHeight}`;

  useEffect(() => {
    if (subjectFilter !== 'all' && !subjectOptions.includes(subjectFilter)) {
      setSubjectFilter('all');
    }
  }, [subjectFilter, subjectOptions, setSubjectFilter]);

  useEffect(() => {
    if (topicFilter !== 'all' && !topicOptions.includes(topicFilter)) {
      setTopicFilter('all');
    }
  }, [topicFilter, topicOptions, setTopicFilter]);

  const handleAskGuruFromNotes = useCallback(() => {
    if (visibleNotes.length === 0) return;
    tabsNavigation?.navigate('ChatTab', {
      screen: 'GuruChat',
      params: {
        topicName: 'Notes Vault',
        groundingTitle:
          subjectFilter !== 'all' || topicFilter !== 'all'
            ? [
                subjectFilter !== 'all' ? subjectFilter : null,
                topicFilter !== 'all' ? topicFilter : null,
              ]
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

  const renderNote = useCallback(
    ({ item }: { item: NoteItem }) => {
      return (
        <NoteCardItem
          item={item}
          isSelected={selectedIds.has(item.id)}
          isSelectionMode={isSelectionMode}
          onPress={(n) => {
            if (isSelectionMode) {
              void Haptics.selectionAsync();
              toggleSelection(n.id);
              return;
            }
            setReaderTitle(getTitle(n));
            setReaderContent(n.note);
            setReaderNote(n);
          }}
          onLongPress={handleLongPress}
          onDelete={handleSingleDelete}
          wordCount={wordCountMap.get(item.id) ?? countWords(item.note)}
          subjectLabel={item.subjectName || 'Unknown'}
          title={getTitle(item)}
        />
      );
    },
    [
      selectedIds,
      isSelectionMode,
      handleLongPress,
      toggleSelection,
      wordCountMap,
      handleSingleDelete,
    ],
  );

  const currentSortLabel =
    SORT_OPTIONS.find((option) => option.value === sortBy)?.label ?? 'Newest';

  return (
    // eslint-disable-next-line guru/prefer-screen-shell -- SafeAreaView needed here
    <SafeAreaView style={styles.safe}>
      <ErrorBoundary>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        {loading ? (
          <View style={styles.loadingState}>
            <LoadingOrb message="Loading notes..." size={120} />
          </View>
        ) : null}
        <ResponsiveContainer style={styles.flex}>
          <ScreenHeader
            title="Notes Vault"
            searchElement={
              <BannerSearchBar
                value={searchValue}
                onChangeText={handleSearchChange}
                placeholder="Search notes, topics, subjects..."
              />
            }
            showSettings
          />

          {notes.length > 0 && !searchValue ? (
            <NotesVaultSummaryCard
              visibleCount={visibleNotes.length}
              notesCount={notes.length}
              subjectCount={subjectOptions.length}
              taggedCount={taggedNotesCount}
              unlabeledCount={unlabeledNotes.length}
            />
          ) : null}

          {isSelectionMode ? (
            <NotesVaultSelectionBanner
              selectedCount={selectedIds.size}
              onCancel={cancelSelection}
              onDelete={() => void handleBatchDelete()}
            />
          ) : null}

          {!isSelectionMode && (
            <NotesVaultToolbar
              visibleCount={visibleNotes.length}
              totalCount={notes.length}
              searchValue={searchValue}
              activeFilterSummary={activeFilterSummary}
              currentSortLabel={currentSortLabel}
              sortBy={sortBy as any}
              setSortBy={(s) => setSortBy(s as any)}
              isFilterMenuOpen={isFilterMenuOpen}
              setIsFilterMenuOpen={setIsFilterMenuOpen}
              isSortMenuOpen={isSortMenuOpen}
              setIsSortMenuOpen={setIsSortMenuOpen}
              subjectFilter={subjectFilter}
              topicFilter={topicFilter}
              junkNotesCount={junkNotes.length}
              duplicateIdsCount={duplicateIds.size}
              unlabeledNotesCount={unlabeledNotes.length}
              badTitleNotesCount={badTitleNotes.length}
              relabelProgress={relabelProgress}
              onAskGuru={handleAskGuruFromNotes}
              onDeleteJunk={() => void handleDeleteJunk()}
              onDeleteDuplicates={() => void handleDeleteDuplicates()}
              onRelabel={() => void handleRelabel(unlabeledNotes)}
              onFixBadTitles={() => void handleFixBadTitles(badTitleNotes)}
            />
          )}

          <FlashList
            ref={listRef}
            data={visibleNotes.slice(0, displayCount)}
            key={listLayoutKey}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderNote}
            extraData={listLayoutKey}
            contentContainerStyle={[styles.list, visibleNotes.length === 0 && { flex: 1 }]}
            onScroll={onScroll}
            onContentSizeChange={onContentSizeChange}
            scrollEventThrottle={16}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={n.colors.textPrimary}
              />
            }
            ListEmptyComponent={
              <EmptyState
                icon="document-text-outline"
                iconSize={64}
                title="No Notes Yet"
                subtitle="Process transcripts or create manual notes to see them here."
              />
            }
          />
          {visibleNotes.length > 0 && displayCount < visibleNotes.length && (
            <TouchableOpacity
              style={styles.loadMoreBtn}
              onPress={() => loadMore()}
              activeOpacity={0.7}
            >
              <LinearText style={styles.loadMoreText}>
                Load More ({visibleNotes.length - displayCount} remaining)
              </LinearText>
            </TouchableOpacity>
          )}

          <NotesVaultFilterSheet
            visible={isFilterMenuOpen}
            onClose={() => setIsFilterMenuOpen(false)}
            subjectFilter={subjectFilter}
            setSubjectFilter={setSubjectFilter}
            subjectOptions={subjectOptions}
            topicFilter={topicFilter}
            setTopicFilter={setTopicFilter}
            topicOptions={topicOptions}
          />

          <NoteReaderModal
            content={readerContent}
            title={readerTitle}
            note={readerNote}
            onClose={() => setReaderContent(null)}
            onAskGuru={handleAskGuruFromNote}
          />
        </ResponsiveContainer>
      </ErrorBoundary>
    </SafeAreaView>
  );
}
