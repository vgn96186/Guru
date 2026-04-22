import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/screens/settings/sections/ai-providers/index.tsx');
let content = fs.readFileSync(file, 'utf8');

// The qwen section tag is <QwenOAuthSection qwen={qwen} SubSectionToggle={SubSectionToggle} styles={styles} />
// It is currently placed inside <SubSectionToggle id="ai_image_gen" ...>
// We need to move it right AFTER the poe_oauth section.

// 1. Remove it from its current place
const qwenStr =
  '<QwenOAuthSection qwen={qwen} SubSectionToggle={SubSectionToggle} styles={styles} />';
content = content.replace(qwenStr, '');
// remove any empty divider before it
content = content.replace(/<View style=\{styles\.subSectionDivider\} \/>\s*$/, ''); // this is too risky

// 2. Put it after Poe
const poeStr = '<PoeOAuthSection poe={poe} SubSectionToggle={SubSectionToggle} styles={styles} />';
if (content.includes(poeStr)) {
  content = content.replace(
    poeStr,
    poeStr + '\n\n        <View style={styles.subSectionDivider} />\n        ' + qwenStr,
  );
  console.log('Moved Qwen out of image gen');
}

fs.writeFileSync(file, content);
