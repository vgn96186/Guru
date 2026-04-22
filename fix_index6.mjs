import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/screens/settings/sections/ai-providers/index.tsx');
let content = fs.readFileSync(file, 'utf8');

// Add imports
content = content.replace(
  "import ApiKeysSection from './subsections/ApiKeysSection';",
  "import ApiKeysSection from './subsections/ApiKeysSection';\nimport PoeOAuthSection from './subsections/PoeOAuthSection';\nimport QwenOAuthSection from './subsections/QwenOAuthSection';\nimport GithubCopilotSection from './subsections/GithubCopilotSection';",
);

// Replace Poe section
const poeRegex =
  /<SubSectionToggle id="poe_oauth" title="POE \(OAUTH\)">[\s\S]*?<\/SubSectionToggle>/;
if (content.match(poeRegex)) {
  content = content.replace(
    poeRegex,
    '<PoeOAuthSection poe={poe} SubSectionToggle={SubSectionToggle} styles={styles} />',
  );
  console.log('Replaced Poe');
}

// Replace Qwen section
const qwenRegex =
  /<SubSectionToggle id="qwen_oauth" title="QWEN \(FREE OAUTH\)">[\s\S]*?<\/SubSectionToggle>/;
if (content.match(qwenRegex)) {
  content = content.replace(
    qwenRegex,
    '<QwenOAuthSection qwen={qwen} SubSectionToggle={SubSectionToggle} styles={styles} />',
  );
  console.log('Replaced Qwen');
}

// Replace Github Copilot section
const copilotRegex =
  /<SubSectionToggle id="github_copilot_oauth" title="GITHUB COPILOT \(OAUTH\)">[\s\S]*?<\/SubSectionToggle>/;
if (content.match(copilotRegex)) {
  content = content.replace(
    copilotRegex,
    '<GithubCopilotSection githubCopilot={githubCopilot} SubSectionToggle={SubSectionToggle} styles={styles} />',
  );
  console.log('Replaced Copilot');
}

// Replace Qwen section
const qwenRegex =
  /<SubSectionToggle id="qwen_oauth" title="QWEN \(FREE OAUTH\)">[\s\S]*?<\/SubSectionToggle>/;
if (content.match(qwenRegex)) {
  content = content.replace(
    qwenRegex,
    '<QwenOAuthSection qwen={qwen} SubSectionToggle={SubSectionToggle} styles={styles} />',
  );
  console.log('Replaced Qwen');
}

// Replace Github Copilot section
const copilotRegex =
  /<SubSectionToggle id="github_copilot_oauth" title="GITHUB COPILOT">[\s\S]*?<\/SubSectionToggle>/;
if (content.match(copilotRegex)) {
  content = content.replace(
    copilotRegex,
    '<GithubCopilotSection githubCopilot={githubCopilot} SubSectionToggle={SubSectionToggle} styles={styles} />',
  );
  console.log('Replaced Copilot');
}

fs.writeFileSync(file, content);
