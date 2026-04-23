const fs = require('fs');
let content = fs.readFileSync('src/screens/TranscriptVaultScreen.tsx', 'utf-8');

content = content.replace(/import \{ useResponsive \} from '\.\.\/hooks\/useResponsive';/, 
`import { useResponsive } from '../hooks/useResponsive';\nimport { useVaultList } from '../hooks/vaults/useVaultList';\nimport { TranscriptCardItem } from './vaults/components/TranscriptCardItem';`);

// Remove local TranscriptFile interface if it exists since it's now in TranscriptCardItem
content = content.replace(/interface TranscriptFile \{[\s\S]*?\}\n/, "import { TranscriptFile } from './vaults/components/TranscriptCardItem';\n");

fs.writeFileSync('src/screens/TranscriptVaultScreen.tsx', content);
