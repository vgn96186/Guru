const fs = require('fs');

let code = fs.readFileSync('../App.tsx', 'utf-8');
const imports = `import { registerBackgroundFetch } from './src/services/backgroundTasks';\n`;

code = code.replace("import LoadingOrb from './src/components/LoadingOrb';", "import LoadingOrb from './src/components/LoadingOrb';\n" + imports);

// Register it inside initializeApp
const initCall = `
        await registerBackgroundFetch().catch(e => console.log('Background task not registered:', e));
`;
code = code.replace("await initDatabase();", "await initDatabase();" + initCall);

fs.writeFileSync('../App.tsx', code);
console.log('Patched App.tsx with BackgroundFetch');
