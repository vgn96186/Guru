const fs = require('fs');
const code = fs.readFileSync('src/services/ai/contentGeneration.unit.test.ts', 'utf8');
console.log(code.includes("createGuruFallbackModel"));
