const fs = require('fs');

let content = fs.readFileSync('babel.config.js', 'utf-8');
console.log(content);
