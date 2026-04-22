const fs = require('fs');

// 1. Remove stray console log in test
let test = fs.readFileSync('src/screens/ContentCard.unit.test.tsx', 'utf-8');
test = test.replace(/const \{ isContentFlagged \} = require\('\.\.\/db\/queries\/aiCache'\);\n\s*console\.log\("Mock is:", isContentFlagged\);\n/g, '');
fs.writeFileSync('src/screens/ContentCard.unit.test.tsx', test);

console.log('Fixed tests');
