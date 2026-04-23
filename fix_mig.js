const fs = require('fs');

let content = fs.readFileSync('babel.config.js', 'utf-8');

// The inline-import plugin config was applied. Let's make sure it handles babel-plugin-inline-import.
content = content.replace(/'inline-import'/, "'babel-plugin-inline-import'");

fs.writeFileSync('babel.config.js', content);
