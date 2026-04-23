const fs = require('fs');
let content = fs.readFileSync('src/screens/TranscriptVaultScreen.tsx', 'utf-8');

content = content.replace(/interface TranscriptFile \{[\s\S]*?\}\n\n/, '');

fs.writeFileSync('src/screens/TranscriptVaultScreen.tsx', content);
