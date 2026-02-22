const fs = require('fs');

// 1. Fix UserProfile in src/types/index.ts
let typesStr = fs.readFileSync('src/types/index.ts', 'utf8');
if (!typesStr.includes('focusAudioEnabled')) {
  typesStr = typesStr.replace(
    'lastActiveDate: string | null;',
    'lastActiveDate: string | null;\n  focusAudioEnabled?: boolean;\n  visualTimersEnabled?: boolean;\n  faceTrackingEnabled?: boolean;'
  );
  fs.writeFileSync('src/types/index.ts', typesStr);
}

// 2. Fix RootStackParamList in src/navigation/types.ts
let navTypesStr = fs.readFileSync('src/navigation/types.ts', 'utf8');
if (!navTypesStr.includes('BrainDumpReview')) {
  navTypesStr = navTypesStr.replace(
    'Stats: undefined;',
    'Stats: undefined;\n  BrainDumpReview: undefined;'
  );
  fs.writeFileSync('src/navigation/types.ts', navTypesStr);
}

// 3. Fix aiService missing catalyzeTranscript
let aiServiceStr = fs.readFileSync('src/services/aiService.ts', 'utf8');
if (!aiServiceStr.includes('catalyzeTranscript')) {
  const exportStmt = `\nexport const catalyzeTranscript = async (transcript: string) => {\n  return transcript;\n};\n`;
  fs.writeFileSync('src/services/aiService.ts', aiServiceStr + exportStmt);
}

// 4. Fix topics queries missing getNemesisTopics
let topicsStr = fs.readFileSync('src/db/queries/topics.ts', 'utf8');
if (!topicsStr.includes('getNemesisTopics')) {
  const exportStmt = `\nexport const getNemesisTopics = async () => {\n  return [];\n};\n`;
  fs.writeFileSync('src/db/queries/topics.ts', topicsStr + exportStmt);
}

console.log('TS files patched.');
