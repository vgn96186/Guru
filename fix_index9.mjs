import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/screens/settings/sections/ai-providers/index.tsx');
let content = fs.readFileSync(file, 'utf8');

// Add imports
content = content.replace(
  "import GithubCopilotSection from './subsections/GithubCopilotSection';",
  "import GithubCopilotSection from './subsections/GithubCopilotSection';\nimport GitlabDuoSection from './subsections/GitlabDuoSection';",
);

// We need to carefully replace Gitlab Duo section since it includes the Paste Modal
// The SubSectionToggle id="gitlab_duo_oauth" contains the modal at the end, up to the closing </SubSectionToggle>
const gitlabRegex =
  /<SubSectionToggle id="gitlab_duo_oauth" title="GITLAB DUO \(OAUTH\)">[\s\S]*?<\/SubSectionToggle>/;

if (content.match(gitlabRegex)) {
  content = content.replace(
    gitlabRegex,
    '<GitlabDuoSection gitlabDuo={gitlabDuo} SubSectionToggle={SubSectionToggle} styles={styles} />',
  );
  console.log('Replaced GitLab');
}

// Remove duplicate imports if any
content = content.replace(
  "import ChatGptOAuthSection from './subsections/ChatGptOAuthSection';\nimport ChatGptOAuthSection from './subsections/ChatGptOAuthSection';",
  "import ChatGptOAuthSection from './subsections/ChatGptOAuthSection';",
);

fs.writeFileSync(file, content);
