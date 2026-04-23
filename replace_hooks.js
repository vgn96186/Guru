const fs = require('fs');

let content = fs.readFileSync('src/screens/NotesVaultScreen.tsx', 'utf-8');

// Replace the hook variables with useVaultList
const oldHooks = `  const [searchValue, setSearchPersisted] = usePersistedInput('notes-vault-search', '');
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [topicFilter, setTopicFilter] = useState<string>('all');

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const isSelectionMode = selectedIds.size > 0;

  // Reader modal
  const [readerContent, setReaderContent] = useState<string | null>(null);
  const [readerTitle, setReaderTitle] = useState('');
  const [readerNote, setReaderNote] = useState<NoteItem | null>(null);

  // Pagination
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);`;

const newHooks = `  const [searchValueLocal, setSearchPersisted] = usePersistedInput('notes-vault-search', '');
  
  const {
    items: notes,
    setItems: setNotes,
    visibleItems: visibleNotes,
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
    }
  });

  // Sync search state from persisted input
  React.useEffect(() => { setSearchValue(searchValueLocal); }, [searchValueLocal, setSearchValue]);
  const handleSearchChange = React.useCallback((v: string) => {
    setSearchValue(v);
    setSearchPersisted(v);
  }, [setSearchValue, setSearchPersisted]);

  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);

  // Reader modal
  const [readerContent, setReaderContent] = useState<string | null>(null);
  const [readerTitle, setReaderTitle] = useState('');
  const [readerNote, setReaderNote] = useState<NoteItem | null>(null);`;

content = content.replace(oldHooks, newHooks);

// 2. Remove the old visibleNotes memo block
const oldVisibleNotes = /  const visibleNotes = useMemo\(\(\) => \{[\s\S]*?  \}, \[notes, searchValue, sortBy, subjectFilter, topicFilter\]\);\n/;
content = content.replace(oldVisibleNotes, '');

// 3. Remove old toggleSelection, handleLongPress, cancelSelection
const oldSelectionFns = /  const toggleSelection = useCallback[\s\S]*?  \}, \[\]\);\n/;
content = content.replace(oldSelectionFns, '');

fs.writeFileSync('src/screens/NotesVaultScreen.tsx', content);
