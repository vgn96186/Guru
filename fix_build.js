const fs = require('fs');

// Fix ReviewScreen.tsx
let review = fs.readFileSync('src/screens/ReviewScreen.tsx', 'utf8');
review = review.replace(
  `updateTopicProgress(
      currentTopic.id,
      newConf >= 4 ? 'mastered' : newConf >= 2 ? 'reviewed' : 'seen',
      newConf
    );`,
  `updateTopicProgress(
      currentTopic.id,
      newConf >= 4 ? 'mastered' : newConf >= 2 ? 'reviewed' : 'seen',
      newConf,
      xp
    );`
);
fs.writeFileSync('src/screens/ReviewScreen.tsx', review);

// Fix navigation/linking.ts and BrainDumpReviewScreen.tsx
// It complains BrainDumpReview doesn't exist in type PathConfigMap<RootStackParamList>
let types = fs.readFileSync('src/navigation/types.ts', 'utf8');
if (!types.includes('BrainDumpReview:')) {
  types = types.replace('Stats: undefined;', 'Stats: undefined;\n  BrainDumpReview: undefined;');
  fs.writeFileSync('src/navigation/types.ts', types);
}

// Fix LectureReturnSheet.tsx 
// Expected 1 arguments, but got 2. 'quiz' does not exist on type 'string'.
let lecRet = fs.readFileSync('src/components/LectureReturnSheet.tsx', 'utf8');
lecRet = lecRet.replace(/catalyzeTranscript\([^)]+\)/g, (match) => {
  if(match.includes('setGeneratedQuiz')) return match; // skip if we aren't changing it
  return match;
});
// Need to see how catalyzeTranscript is called in LectureReturnSheet.tsx.
