const fs = require('fs');
console.log(JSON.parse(fs.readFileSync('src/db/drizzle-migrations/meta/_journal.json')).entries[0]);
