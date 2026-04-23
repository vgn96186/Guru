const fs = require('fs');

let code = fs.readFileSync('src/db/queries/aiCache.ts', 'utf-8');

code = code.replace(/tx\.delete/g, 'getDrizzleDb().delete');

fs.writeFileSync('src/db/queries/aiCache.ts', code);
