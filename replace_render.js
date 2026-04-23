const fs = require('fs');
let content = fs.readFileSync('src/screens/NotesVaultScreen.tsx', 'utf-8');

const regex = /  const renderNote = useCallback\([\s\S]*?\[selectedIds, isSelectionMode, handleLongPress, toggleSelection, wordCountMap\],\n  \);/m;

const replacement = `  const renderNote = useCallback(
    ({ item }: { item: NoteItem }) => {
      return (
        <NoteCardItem
          item={item}
          isSelected={selectedIds.has(item.id)}
          isSelectionMode={isSelectionMode}
          onPress={(n) => {
            if (isSelectionMode) {
              Haptics.selectionAsync();
              toggleSelection(n.id);
              return;
            }
            setReaderTitle(getTitle(n));
            setReaderContent(n.note);
            setReaderNote(n);
          }}
          onLongPress={handleLongPress}
          wordCount={wordCountMap.get(item.id) ?? countWords(item.note)}
          subjectLabel={getSubjectLabel(item)}
          title={getTitle(item)}
        />
      );
    },
    [selectedIds, isSelectionMode, handleLongPress, toggleSelection, wordCountMap],
  );`;

content = content.replace(regex, replacement);
fs.writeFileSync('src/screens/NotesVaultScreen.tsx', content);
