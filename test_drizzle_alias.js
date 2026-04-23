const { sqliteTable, text, integer } = require('drizzle-orm/sqlite-core');
const { drizzle } = require('drizzle-orm/better-sqlite3');
const Database = require('better-sqlite3');
const { eq, and, sql, desc, asc, lt } = require('drizzle-orm');

const sqlite = new Database(':memory:');
const db = drizzle(sqlite);

const topics = sqliteTable('topics', { id: integer('id').primaryKey(), subjectId: integer('subject_id'), parentTopicId: integer('parent_topic_id'), name: text('name'), estimatedMinutes: integer('estimated_minutes'), inicetPriority: integer('inicet_priority'), });
const subjects = sqliteTable('subjects', { id: integer('id').primaryKey(), name: text('name'), shortCode: text('short_code'), colorHex: text('color_hex'), });

let query = db
    .select({
      id: topics.id,
      name: sql`${topics.name} AS topicName`,
      subjectName: sql`${subjects.name} AS subjectName`,
    })
    .from(topics)
    .innerJoin(subjects, eq(topics.subjectId, subjects.id));

console.log(query.toSQL().sql);
