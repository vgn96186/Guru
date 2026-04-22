import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/screens/settings/sections/ai-providers/index.tsx');
let content = fs.readFileSync(file, 'utf8');

// Add import
content = content.replace(
  "import ApiKeysSection from './subsections/ApiKeysSection';",
  "import ApiKeysSection from './subsections/ApiKeysSection';\nimport ChatGptOAuthSection from './subsections/ChatGptOAuthSection';",
);

// Replace ChatGPT section
const chatgptRegex =
  /<SubSectionToggle id="chatgpt_oauth" title="CHATGPT \(SUBSCRIPTION\)">[\s\S]*?<\/SubSectionToggle>/;
if (content.match(chatgptRegex)) {
  content = content.replace(
    chatgptRegex,
    '<ChatGptOAuthSection chatgpt={chatgpt} SubSectionToggle={SubSectionToggle} styles={styles} />',
  );
  console.log('Replaced ChatGPT');
}

fs.writeFileSync(file, content);
