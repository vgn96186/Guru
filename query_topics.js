const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('local_database.sqlite'); // wait, the DB is probably handled by expo-sqlite. We can't query it from node directly unless we know where the sqlite file is.
