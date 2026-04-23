const fs = require('fs');

let code = fs.readFileSync('src/db/repositories/topicsRepository.drizzle.ts', 'utf-8');

const oldQ = /SELECT id, name, short_code as shortCode, color_hex as colorHex, inicet_weight as inicetWeight, neet_weight as neetWeight, display_order as displayOrder, created_at as createdAt\s*FROM subjects\s*ORDER BY display_order ASC/m;
const newQ = `SELECT id, name, short_code as shortCode, color_hex as colorHex, inicet_weight as inicetWeight, neet_weight as neetWeight, display_order as displayOrder
      FROM subjects
      ORDER BY display_order ASC`;

code = code.replace(oldQ, newQ);

fs.writeFileSync('src/db/repositories/topicsRepository.drizzle.ts', code);
