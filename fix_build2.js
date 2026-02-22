const fs = require('fs');

// 1. Fix aiService.ts (catalyzeTranscript expected 1 arg, got 2. Return type lacks 'quiz')
let aiService = fs.readFileSync('src/services/aiService.ts', 'utf8');
aiService = aiService.replace(
  'export const catalyzeTranscript = async (transcript: string) => {',
  'export const catalyzeTranscript = async (transcript: string, apiKey?: string): Promise<any> => {'
);
fs.writeFileSync('src/services/aiService.ts', aiService);

// 2. Fix notificationService.ts (nemesisTopics missing await)
let notifService = fs.readFileSync('src/services/notificationService.ts', 'utf8');
notifService = notifService.replace(
  'const nemesisTopics = getNemesisTopics();',
  'const nemesisTopics = await getNemesisTopics();'
);
fs.writeFileSync('src/services/notificationService.ts', notifService);

// 3. Fix types.ts (add BrainDumpReview to HomeStackParamList)
let types = fs.readFileSync('src/navigation/types.ts', 'utf8');
if (!types.includes('BrainDumpReview: undefined;')) {
  types = types.replace(
    'FlaggedReview: undefined;',
    'FlaggedReview: undefined;\n  BrainDumpReview: undefined;'
  );
  fs.writeFileSync('src/navigation/types.ts', types);
}

console.log('Build issues patched again.');
