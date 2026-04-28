import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { LinearSurface } from '../../../../components/primitives/LinearSurface';
import { LinearText } from '../../../../components/primitives/LinearText';
import { styles, n } from '../styles';
import type { SortOption } from '../types';

export const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: 'Newest First', value: 'date' },
  { label: 'Subject', value: 'subject' },
  { label: 'Word Count', value: 'words' },
];

interface NotesVaultToolbarProps {
  visibleCount: number;
  totalCount: number;
  searchValue: string;
  activeFilterSummary: string;
  currentSortLabel: string;
  sortBy: SortOption;
  setSortBy: (sort: SortOption) => void;
  isFilterMenuOpen: boolean;
  setIsFilterMenuOpen: (open: boolean) => void;
  isSortMenuOpen: boolean;
  setIsSortMenuOpen: (open: boolean) => void;
  subjectFilter: string;
  topicFilter: string;
  junkNotesCount: number;
  duplicateIdsCount: number;
  unlabeledNotesCount: number;
  badTitleNotesCount: number;
  relabelProgress: string | null;
  onAskGuru: () => void;
  onDeleteJunk: () => void;
  onDeleteDuplicates: () => void;
  onRelabel: () => void;
  onFixBadTitles: () => void;
}

export default function NotesVaultToolbar({
  visibleCount,
  totalCount,
  searchValue,
  activeFilterSummary,
  currentSortLabel,
  sortBy,
  setSortBy,
  setIsFilterMenuOpen,
  isSortMenuOpen,
  setIsSortMenuOpen,
  subjectFilter,
  topicFilter,
  junkNotesCount,
  duplicateIdsCount,
  unlabeledNotesCount,
  badTitleNotesCount,
  relabelProgress,
  onAskGuru,
  onDeleteJunk,
  onDeleteDuplicates,
  onRelabel,
  onFixBadTitles,
}: NotesVaultToolbarProps) {
  const hasQuickActions =
    visibleCount > 0 ||
    (totalCount > 0 && !searchValue) ||
    junkNotesCount > 0 ||
    duplicateIdsCount > 0 ||
    unlabeledNotesCount > 0 ||
    badTitleNotesCount > 0 ||
    !!relabelProgress;

  if (!hasQuickActions && totalCount === 0) return null;

  return (
    <LinearSurface compact style={styles.toolbarCard}>
      <View style={styles.toolbarHeader}>
        <View style={styles.toolbarCopy}>
          <LinearText variant="bodySmall" tone="secondary" style={styles.toolbarTitle}>
            {visibleCount} of {totalCount} note{totalCount !== 1 ? 's' : ''} shown
          </LinearText>
          <LinearText variant="caption" tone="muted" style={styles.toolbarSubtitle}>
            {searchValue.trim()
              ? `Searching "${searchValue.trim()}"`
              : `${activeFilterSummary} · ${currentSortLabel}`}
          </LinearText>
        </View>
        {subjectFilter !== 'all' || topicFilter !== 'all' ? (
          <View style={styles.toolbarPill}>
            <LinearText variant="chip" tone="accent">
              Filters on
            </LinearText>
          </View>
        ) : null}
      </View>
      {hasQuickActions ? (
        <View style={styles.quickActionsSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickActionsContent}
          >
            {visibleCount > 0 ? (
              <Pressable
                style={[styles.quickActionChip, styles.quickActionChipPrimary]}
                onPress={onAskGuru}
                accessibilityRole="button"
                accessibilityLabel="Ask Guru using current notes"
              >
                <Ionicons name="sparkles-outline" size={15} color={n.colors.accent} />
                <LinearText style={[styles.quickActionText, styles.quickActionTextPrimary]}>
                  Ask Guru
                </LinearText>
              </Pressable>
            ) : null}

            {totalCount > 0 && !searchValue ? (
              <Pressable
                style={[
                  styles.quickActionChip,
                  (subjectFilter !== 'all' || topicFilter !== 'all') &&
                    styles.quickActionChipPrimary,
                ]}
                onPress={() => {
                  setIsFilterMenuOpen(true);
                  setIsSortMenuOpen(false);
                }}
                accessibilityRole="button"
              >
                <Ionicons
                  name={
                    subjectFilter !== 'all' || topicFilter !== 'all' ? 'filter' : 'filter-outline'
                  }
                  size={14}
                  color={
                    subjectFilter !== 'all' || topicFilter !== 'all'
                      ? n.colors.accent
                      : n.colors.textSecondary
                  }
                />
                <LinearText
                  style={[
                    styles.quickActionText,
                    (subjectFilter !== 'all' || topicFilter !== 'all') &&
                      styles.quickActionTextPrimary,
                  ]}
                >
                  Filter
                </LinearText>
              </Pressable>
            ) : null}

            {totalCount > 0 && !searchValue ? (
              <Pressable
                style={[styles.quickActionChip, sortBy !== 'date' && styles.quickActionChipPrimary]}
                onPress={() => setIsSortMenuOpen(!isSortMenuOpen)}
                accessibilityRole="button"
              >
                <Ionicons
                  name={sortBy !== 'date' ? 'swap-vertical' : 'swap-vertical-outline'}
                  size={14}
                  color={sortBy !== 'date' ? n.colors.accent : n.colors.textSecondary}
                />
                <LinearText
                  style={[
                    styles.quickActionText,
                    sortBy !== 'date' && styles.quickActionTextPrimary,
                  ]}
                >
                  Sort: {currentSortLabel}
                </LinearText>
              </Pressable>
            ) : null}

            {junkNotesCount > 0 && !searchValue && !relabelProgress ? (
              <Pressable
                style={[styles.quickActionChip, styles.quickActionChipWarning]}
                onPress={onDeleteJunk}
                accessibilityRole="button"
              >
                <Ionicons name="trash-bin-outline" size={14} color={n.colors.warning} />
                <LinearText style={[styles.quickActionText, styles.quickActionTextWarning]}>
                  Clean Junk ({junkNotesCount})
                </LinearText>
              </Pressable>
            ) : null}

            {duplicateIdsCount > 0 && !searchValue && !relabelProgress ? (
              <Pressable
                style={[styles.quickActionChip, styles.quickActionChipWarning]}
                onPress={onDeleteDuplicates}
                accessibilityRole="button"
              >
                <Ionicons name="copy-outline" size={14} color={n.colors.warning} />
                <LinearText style={[styles.quickActionText, styles.quickActionTextWarning]}>
                  Clear Dupes ({duplicateIdsCount})
                </LinearText>
              </Pressable>
            ) : null}

            {unlabeledNotesCount > 0 && !searchValue && !relabelProgress ? (
              <Pressable
                style={[styles.quickActionChip, styles.quickActionChipPrimary]}
                onPress={onRelabel}
                accessibilityRole="button"
              >
                <Ionicons name="pricetag-outline" size={14} color={n.colors.accent} />
                <LinearText style={[styles.quickActionText, styles.quickActionTextPrimary]}>
                  AI Label ({unlabeledNotesCount})
                </LinearText>
              </Pressable>
            ) : null}

            {badTitleNotesCount > 0 && !searchValue && !relabelProgress ? (
              <Pressable
                style={[styles.quickActionChip, styles.quickActionChipPrimary]}
                onPress={onFixBadTitles}
                accessibilityRole="button"
              >
                <Ionicons name="text-outline" size={14} color={n.colors.accent} />
                <LinearText style={[styles.quickActionText, styles.quickActionTextPrimary]}>
                  Fix Titles ({badTitleNotesCount})
                </LinearText>
              </Pressable>
            ) : null}

            {relabelProgress ? (
              <View style={[styles.quickActionChip, styles.quickActionChipPrimary]}>
                <ActivityIndicator size="small" color={n.colors.accent} />
                <LinearText style={[styles.quickActionText, styles.quickActionTextPrimary]}>
                  Labeling {relabelProgress}...
                </LinearText>
              </View>
            ) : null}
          </ScrollView>
        </View>
      ) : null}

      {isSortMenuOpen ? (
        <View style={styles.sortMenu}>
          {SORT_OPTIONS.map((option) => {
            const isActive = sortBy === option.value;
            return (
              <Pressable
                key={option.value}
                style={[styles.sortOption, isActive && styles.sortOptionActive]}
                onPress={() => {
                  setSortBy(option.value);
                  setIsSortMenuOpen(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <LinearText style={[styles.sortOptionText, isActive && styles.sortOptionTextActive]}>
                  {option.label}
                </LinearText>
                {isActive ? <Ionicons name="checkmark" size={18} color={n.colors.accent} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </LinearSurface>
  );
}
