import { useState, useCallback, useMemo } from 'react';
import * as Haptics from 'expo-haptics';

export interface UseVaultListProps<T> {
  initialSortBy?: string;
  pageSize?: number;
  filterItem?: (item: T, search: string, subject: string, topic: string) => boolean;
  sortItems?: (a: T, b: T, sortBy: string) => number;
}

export function useVaultList<T, K extends string | number>({
  initialSortBy = 'date',
  pageSize = 20,
  filterItem,
  sortItems,
}: UseVaultListProps<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [searchValue, setSearchValue] = useState('');
  const [sortBy, setSortBy] = useState(initialSortBy);
  const [subjectFilter, setSubjectFilter] = useState('all');
  const [topicFilter, setTopicFilter] = useState('all');

  const [selectedIds, setSelectedIds] = useState<Set<K>>(new Set());
  const isSelectionMode = selectedIds.size > 0;

  const [displayCount, setDisplayCount] = useState(pageSize);

  const toggleSelection = useCallback((id: K) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleLongPress = useCallback((id: K) => {
    Haptics.selectionAsync();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const cancelSelection = useCallback(() => setSelectedIds(new Set()), []);

  const loadMore = useCallback(() => {
    setDisplayCount((prev) => prev + pageSize);
  }, [pageSize]);

  const visibleItems = useMemo(() => {
    let filtered = items;
    if (filterItem) {
      filtered = filtered.filter((item) =>
        filterItem(item, searchValue, subjectFilter, topicFilter),
      );
    }
    const sorted = [...filtered];
    if (sortItems) {
      sorted.sort((a, b) => sortItems(a, b, sortBy));
    }
    return sorted;
  }, [items, searchValue, subjectFilter, topicFilter, sortBy, filterItem, sortItems]);

  return {
    items,
    setItems,
    visibleItems,
    loading,
    setLoading,
    refreshing,
    setRefreshing,
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
  };
}
