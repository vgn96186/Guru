const fs = require('fs');

let types = fs.readFileSync('../src/types/index.ts', 'utf-8');
const fsrsType = `
  fsrsDue: string | null;
  fsrsStability: number;
  fsrsDifficulty: number;
  fsrsElapsedDays: number;
  fsrsScheduledDays: number;
  fsrsReps: number;
  fsrsLapses: number;
  fsrsState: number;
  fsrsLastReview: string | null;
`;
types = types.replace(/userNotes: string;/, 'userNotes: string;\n' + fsrsType);
fs.writeFileSync('../src/types/index.ts', types);
console.log('Types updated');
