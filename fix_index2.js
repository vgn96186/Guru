const fs = require('fs');

let content = fs.readFileSync('src/screens/ContentCard/index.tsx', 'utf-8');

// Fix paths starting with './ContentCard/' to './'
content = content.replace(/from "\.\/ContentCard\//g, "from \"./");
content = content.replace(/from '\.\/ContentCard\//g, "from './");

fs.writeFileSync('src/screens/ContentCard/index.tsx', content);
