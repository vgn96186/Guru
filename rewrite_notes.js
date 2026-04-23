const fs = require('fs');

let content = fs.readFileSync('src/screens/NotesVaultScreen.tsx', 'utf-8');

// 1. Remove NoteLabelSchema and aiRelabelNote
content = content.replace(/const NoteLabelSchema = z\.object\(\{[\s\S]*?\}\);\s*async function aiRelabelNote\([\s\S]*?\}\s*catch \{[\s\S]*?return null;[\s\S]*?\}\s*\}/, `import { aiRelabelNote, NoteLabelSchema } from '../services/vaults/relabelService';`);

// 2. Remove SUBJECT_COLORS
content = content.replace(/const SUBJECT_COLORS: Record<string, string> = \{[\s\S]*?\};\n/, '');

// 3. Import useVaultList
content = content.replace(/import \{ useScrollRestoration, usePersistedInput \} from '\.\.\/hooks\/useScrollRestoration';/, `import { useScrollRestoration, usePersistedInput } from '../hooks/useScrollRestoration';\nimport { useVaultList } from '../hooks/vaults/useVaultList';\nimport { NoteCardItem } from './vaults/components/NoteCardItem';`);

fs.writeFileSync('src/screens/NotesVaultScreen.tsx', content);
