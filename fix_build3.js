const fs = require('fs');

// Fix types.ts: Add BrainDumpReview to RootStackParamList
let types = fs.readFileSync('src/navigation/types.ts', 'utf8');
if (!types.includes('BrainDumpReview: undefined', types.indexOf('RootStackParamList'))) {
  types = types.replace(
    'Tabs: undefined;',
    'Tabs: undefined;\n  BrainDumpReview: undefined;'
  );
  fs.writeFileSync('src/navigation/types.ts', types);
}

// Fix topics.ts: getNemesisTopics returns any[]
let topics = fs.readFileSync('src/db/queries/topics.ts', 'utf8');
topics = topics.replace(
  'export const getNemesisTopics = async () => {',
  'export const getNemesisTopics = async (): Promise<any[]> => {'
);
fs.writeFileSync('src/db/queries/topics.ts', topics);

console.log('Build issues patched again 3.');
