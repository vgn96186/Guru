const fs = require('fs');
let content = fs.readFileSync('src/screens/NotesVaultScreen.tsx', 'utf-8');

content = content.replace(/  const handleLongPress = useCallback[\s\S]*?  \}, \[\]\);\n\n/, '');
content = content.replace(/  const cancelSelection = useCallback[\s\S]*?  \}, \[\]\);\n\n/, '');

fs.writeFileSync('src/screens/NotesVaultScreen.tsx', content);
