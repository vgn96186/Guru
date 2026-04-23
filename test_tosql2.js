const { sqliteTable, text, integer } = require('drizzle-orm/sqlite-core');
const { drizzle } = require('drizzle-orm/better-sqlite3');
const Database = require('better-sqlite3');
const sqlite = new Database(':memory:');
const db = drizzle(sqlite);
const { eq } = require('drizzle-orm');

const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  firstName: text('first_name')
});
const q = db.select({ theId: users.id, name: users.firstName }).from(users);
console.log(q.toSQL());
