import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/screens/settings/sections/ai-providers/index.tsx');
let content = fs.readFileSync(file, 'utf8');

const poeRegex =
  /<SubSectionToggle id="poe_oauth" title="POE \(OAUTH\)">[\s\S]*?<\/SubSectionToggle>/;
if (content.match(poeRegex)) {
  content = content.replace(
    poeRegex,
    '<PoeOAuthSection poe={poe} SubSectionToggle={SubSectionToggle} styles={styles} />',
  );
  console.log('Replaced Poe');
}

const copilotRegex =
  /<SubSectionToggle id="github_copilot_oauth" title="GITHUB COPILOT \(OAUTH\)">[\s\S]*?<\/SubSectionToggle>/;
if (content.match(copilotRegex)) {
  content = content.replace(
    copilotRegex,
    '<GithubCopilotSection githubCopilot={githubCopilot} SubSectionToggle={SubSectionToggle} styles={styles} />',
  );
  console.log('Replaced Copilot');
}

fs.writeFileSync(file, content);
