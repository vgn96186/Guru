const fs = require('fs');

let queries = fs.readFileSync('../src/db/queries/progress.ts', 'utf-8');

// I need to add FSRS logic to logTopicProgress
// For that, I need to see what's in progress.ts first. Let's dump the file.
fs.writeFileSync('temp_queries.log', queries);
