const fs = require('fs');
let content = fs.readFileSync('src/screens/NotesVaultScreen.tsx', 'utf-8');
content = content.replace(/  const formatDate = \(timestamp: number\) => \{[\s\S]*?  \};\n/g, '');
fs.writeFileSync('src/screens/NotesVaultScreen.tsx', content);
