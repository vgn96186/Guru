const fs = require('fs');
let content = fs.readFileSync('src/screens/NotesVaultScreen.tsx', 'utf-8');

content = content.replace(/  const formatDate = \(ts: number\): string => \{[\s\S]*?  \};\n/g, '');

content = content.replace(/import \{ z \} from 'zod';\n/, '');
content = content.replace(/import SubjectChip from '\.\.\/components\/SubjectChip';\n/, '');
content = content.replace(/import TopicPillRow from '\.\.\/components\/TopicPillRow';\n/, '');
content = content.replace(/import \{ generateJSONWithRouting \} from '\.\.\/services\/ai\/generate';\n/, '');
content = content.replace(/import type \{ Message \} from '\.\.\/services\/ai\/types';\n/, '');
content = content.replace(/import \{ CONFIDENCE_LABELS \} from '\.\.\/constants\/gamification';\n/, '');

fs.writeFileSync('src/screens/NotesVaultScreen.tsx', content);
