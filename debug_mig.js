const fs = require('fs');

let content = fs.readFileSync('src/db/database.ts', 'utf-8');
content = content.replace(/await migrate\(getDrizzleDb\(\), migrations\);/g, "console.log('MIGRATIONS OBJ:', typeof migrations, migrations?.migrations?.m0000 ? migrations.migrations.m0000.substring(0, 50) : 'MISSING m0000');\n    await migrate(getDrizzleDb(), migrations);");

fs.writeFileSync('src/db/database.ts', content);
