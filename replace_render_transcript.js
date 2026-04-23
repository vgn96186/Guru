const fs = require('fs');
let content = fs.readFileSync('src/screens/TranscriptVaultScreen.tsx', 'utf-8');

const regex = /  const renderItem = \(\{ item \}: \{ item: TranscriptFile \}\) => \{[\s\S]*?  \};\n\n  return \(\n    <SafeAreaView/m;

const replacement = `  const renderItem = ({ item }: { item: TranscriptFile }) => {
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
    <SafeAreaView`;

content = content.replace(regex, replacement);
fs.writeFileSync('src/screens/TranscriptVaultScreen.tsx', content);
