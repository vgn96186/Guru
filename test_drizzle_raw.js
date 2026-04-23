const { sql } = require('drizzle-orm');
console.log(sql.raw("SELECT * FROM foo").toQuery({ escapeName: () => '', escapeParam: () => '', escapeString: () => '' }).sql);
