const fs = require('fs');
let c = fs.readFileSync('src/constants/syllabus.ts', 'utf8');
c = c.replace(/â€”/g, '-');
fs.writeFileSync('src/constants/syllabus.ts', c, 'utf8');
console.log('Fixed encoding artifacts.');
