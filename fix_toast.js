const fs = require('fs');
const file = 'src/components/Toast.tsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes("import { theme }")) {
    content = content.replace("import {", "import { theme } from '../constants/theme';\nimport {");
}

content = content.replace(/borderRadius: 12/g, 'borderRadius: theme.radius.pill');
content = content.replace(/padding: 14/g, 'paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.xl');
content = content.replace(/left: 16/g, 'left: theme.spacing.xl');
content = content.replace(/right: 16/g, 'right: theme.spacing.xl');
content = content.replace(/bottom: insets.bottom \+ 16/g, 'bottom: insets.bottom + theme.spacing.xl');

// Add shadows
content = content.replace(/shadowColor: '#000',\n\s*shadowOffset: \{ width: 0, height: 4 \},\n\s*shadowOpacity: 0.4,\n\s*shadowRadius: 8,\n\s*elevation: 8/g, '...theme.shadows.floating');

fs.writeFileSync(file, content);
