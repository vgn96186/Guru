const fs = require('fs');

let sync = fs.readFileSync('../src/services/deviceSyncService.ts', 'utf-8');
sync = sync.replace(
  "| { type: 'NOTE_SAVED'; note: string };",
  "| { type: 'NOTE_SAVED'; note: string }\n  | { type: 'BREAK_STARTED'; durationSeconds: number }\n  | { type: 'LECTURE_RESUMED' };"
);
fs.writeFileSync('../src/services/deviceSyncService.ts', sync);

let navTypes = fs.readFileSync('../src/navigation/types.ts', 'utf-8');
if (!navTypes.includes('BreakEnforcer:')) {
  navTypes = navTypes.replace(
    "export type RootStackParamList = {",
    "export type RootStackParamList = {\n  BreakEnforcer: { durationSeconds: number };"
  );
  fs.writeFileSync('../src/navigation/types.ts', navTypes);
}

console.log('Updated types for Break Enforcer');
