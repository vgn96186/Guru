const fs = require('fs');

let dbFile = fs.readFileSync('src/db/database.ts', 'utf-8');

// remove static import
dbFile = dbFile.replace(/import \{ getDrizzleDb \} from '\.\/drizzle';\n/g, '');

// dynamic import
dbFile = dbFile.replace(/await migrate\(getDrizzleDb\(\), migrations\);/g, "const { getDrizzleDb } = require('./drizzle');\n    await migrate(getDrizzleDb(), migrations);");

fs.writeFileSync('src/db/database.ts', dbFile);

// remove resetDbSingleton from drizzle.ts
let drFile = fs.readFileSync('src/db/drizzle.ts', 'utf-8');
drFile = drFile.replace(/export \{ resetDbSingleton \};\n/g, '');
fs.writeFileSync('src/db/drizzle.ts', drFile);

