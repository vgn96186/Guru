const fs = require('fs');
const path = require('path');

let content = fs.readFileSync(
  path.join(__dirname, 'src/db/repositories/progressRepository.drizzle.ts'),
  'utf8',
);

// We just write a clean progressRepository.drizzle.ts
