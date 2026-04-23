const fs = require('fs');

let content = fs.readFileSync('src/db/repositories/topicsRepository.drizzle.ts', 'utf-8');

// Fix mapTopicRow to handle topicName alias
content = content.replace(/const tname = r\.name \|\| 'Unnamed Topic';/g, "const tname = r.topicName || r.name || 'Unnamed Topic';");

// Fix raw queries
content = content.replace(/t\.name, /g, 't.name as topicName, ');

fs.writeFileSync('src/db/repositories/topicsRepository.drizzle.ts', content);
