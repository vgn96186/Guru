const fs = require('fs');

let types = fs.readFileSync('../src/types/index.ts', 'utf-8');
if (!types.includes('syncCode: string | null;')) {
  types = types.replace(/lastActiveDate: string \| null;/, 'lastActiveDate: string | null;\n  syncCode: string | null;');
  fs.writeFileSync('../src/types/index.ts', types);
}

let progress = fs.readFileSync('../src/db/queries/progress.ts', 'utf-8');
if (!progress.includes('sync_code: string | null;')) {
  progress = progress.replace(/last_active_date: string \| null;/, 'last_active_date: string | null; sync_code: string | null;');
  progress = progress.replace(/lastActiveDate: null,/, 'lastActiveDate: null, syncCode: null,');
  progress = progress.replace(/lastActiveDate: r\.last_active_date,/, 'lastActiveDate: r.last_active_date,\n    syncCode: r.sync_code,');
  progress = progress.replace(/lastActiveDate: 'last_active_date',/, "lastActiveDate: 'last_active_date', syncCode: 'sync_code',");
  fs.writeFileSync('../src/db/queries/progress.ts', progress);
}

console.log('Types and Progress queries updated for syncCode');
