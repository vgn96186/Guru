const fs = require('fs');

let content = fs.readFileSync('src/screens/TranscriptVaultScreen.tsx', 'utf-8');

// Replace top hooks
const oldHooks = /  const \[files, setFiles\] = useState<TranscriptFile\[\]>\(\[\]\);\n  const \[loading, setLoading\] = useState\(true\);\n  const \[needsFileAccess, setNeedsFileAccess\] = useState\(false\);\n  const \[selectedPaths, setSelectedPaths\] = useState<Set<string>>\(new Set\(\)\);\n  const \[isImportingText, setIsImportingText\] = useState\(false\);\n\n  \/\/ Reader\n  const \[readerContent, setReaderContent\] = useState<string \| null>\(null\);\n  const \[readerTitle, setReaderTitle\] = useState\(''\);\n  const \[sortBy, setSortBy\] = useState<'name' \| 'words'>\('name'\);\n  const listLayoutKey = \`\$\{viewportWidth\}x\$\{viewportHeight\}\`;\n\n  \/\/ Pagination\n  const PAGE_SIZE = 20;\n  const \[displayCount, setDisplayCount\] = useState\(PAGE_SIZE\);/;

const newHooks = `  const [needsFileAccess, setNeedsFileAccess] = useState(false);
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
    }
  });

  // Reader
  const [readerContent, setReaderContent] = useState<string | null>(null);
  const [readerTitle, setReaderTitle] = useState('');
  const listLayoutKey = \`\$\{viewportWidth\}x\$\{viewportHeight\}\`;`;

content = content.replace(oldHooks, newHooks);

// Remove specific blocks safely
content = content.replace(/  const isSelectionMode = selectedPaths\.size > 0;\n\n/, '');

content = content.replace(/  const toggleSelection = useCallback\(\(path: string\) => \{[\s\S]*?  \}, \[\]\);\n\n/, '');

content = content.replace(/  const handleLongPress = useCallback\(\(path: string\) => \{[\s\S]*?  \}, \[\]\);\n\n/, '');

content = content.replace(/  const cancelSelection = useCallback\(\(\) => setSelectedPaths\(new Set\(\)\), \[\]\);\n\n/, '');

content = content.replace(/  const sortedFiles = React\.useMemo\(\(\) => \{[\s\S]*?  \}, \[files, sortBy\]\);\n/, '');

fs.writeFileSync('src/screens/TranscriptVaultScreen.tsx', content);
