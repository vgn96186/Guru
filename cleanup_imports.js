const fs = require('fs');
const execSync = require('child_process').execSync;

const lintOutput = execSync('npx eslint "src/screens/studyPlan/cards/**/*.{ts,tsx}" --format json || true').toString();
const results = JSON.parse(lintOutput);

for (const result of results) {
  if (result.errorCount === 0 && result.warningCount === 0) continue;
  
  let content = fs.readFileSync(result.filePath, 'utf8');
  const lines = content.split('\n');
  
  // Collect all unused variables
  const unusedVars = new Set();
  for (const msg of result.messages) {
    if (msg.ruleId === '@typescript-eslint/no-unused-vars') {
      // The message is usually "'VarName' is defined but never used..."
      const match = msg.message.match(/'([^']+)'/);
      if (match) unusedVars.add(match[1]);
    }
  }
  
  if (unusedVars.size === 0) continue;
  
  // A simple regex approach to remove them from import statements
  // This is basic but works for most cases
  for (const v of unusedVars) {
    // try to match import { ..., v, ... } from '...';
    // or import v from '...';
    
    // 1. Default import: import v from '...'
    const defaultRegex = new RegExp(`^import\\s+${v}\\s+from\\s+['"][^']+['"];?\\s*$`, 'm');
    content = content.replace(defaultRegex, '');
    
    // 2. Named import: import { ..., v, ... } from '...'
    const namedRegex1 = new RegExp(`import\\s+\\{([^}]*?)\\s*,\\s*${v}\\s*,\\s*([^}]*?)\\}\\s+from\\s+['"][^']+['"];?`, 'g');
    content = content.replace(namedRegex1, (match, p1, p2) => {
      const rest = [p1, p2].filter(p => p.trim() !== '').join(', ');
      return `import { ${rest} } from ${match.substring(match.indexOf('from') + 4)}`;
    });
    
    const namedRegex2 = new RegExp(`import\\s+\\{([^}]*?)\\s*,\\s*${v}\\s*\\}\\s+from\\s+['"][^']+['"];?`, 'g');
    content = content.replace(namedRegex2, (match, p1) => {
      if (p1.trim() === '') return ''; // whole import is empty
      return `import { ${p1} } from ${match.substring(match.indexOf('from') + 4)}`;
    });
    
    const namedRegex3 = new RegExp(`import\\s+\\{\\s*${v}\\s*,\\s*([^}]*?)\\}\\s+from\\s+['"][^']+['"];?`, 'g');
    content = content.replace(namedRegex3, (match, p1) => {
      if (p1.trim() === '') return '';
      return `import { ${p1} } from ${match.substring(match.indexOf('from') + 4)}`;
    });
    
    const namedRegex4 = new RegExp(`import\\s+\\{\\s*${v}\\s*\\}\\s+from\\s+['"][^']+['"];?`, 'g');
    content = content.replace(namedRegex4, '');
  }
  
  // Cleanup empty imports like import {  } from '...';
  content = content.replace(/^import\s+\{\s*\}\s+from\s+['"][^']+['"];?\s*$/gm, '');
  
  fs.writeFileSync(result.filePath, content);
}
console.log('Cleaned up imports');
