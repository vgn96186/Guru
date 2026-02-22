const fs = require('fs');
let types = fs.readFileSync('src/navigation/types.ts', 'utf8');
types = types.replace(
  'Tabs: undefined;',
  'Tabs: undefined;\n  BrainDumpReview: undefined;'
);
fs.writeFileSync('src/navigation/types.ts', types);
