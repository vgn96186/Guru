const { sqliteTable, text, integer } = require('drizzle-orm/sqlite-core');
const { drizzle } = require('drizzle-orm/better-sqlite3');
const Database = require('better-sqlite3');
const sqlite = new Database(':memory:');
const db = drizzle(sqlite);
const { eq } = require('drizzle-orm');

const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name')
});
const posts = sqliteTable('posts', {
  id: integer('id').primaryKey(),
  authorId: integer('author_id'),
  name: text('name')
});

const q = db.select({ uid: users.id, uname: users.name, pid: posts.id, pname: posts.name }).from(users).innerJoin(posts, eq(users.id, posts.authorId));
console.log(q.toSQL());
