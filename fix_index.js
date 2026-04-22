const fs = require('fs');

let content = fs.readFileSync('src/screens/ContentCard/index.tsx', 'utf-8');

// Fix paths starting with '../' to '../../'
content = content.replace(/from '\.\.\/components/g, "from '../../components");
content = content.replace(/from '\.\.\/motion/g, "from '../../motion");
content = content.replace(/from '\.\.\/theme/g, "from '../../theme");
content = content.replace(/from '\.\.\/utils/g, "from '../../utils");
content = content.replace(/from '\.\.\/services/g, "from '../../services");
content = content.replace(/from '\.\.\/db/g, "from '../../db");
content = content.replace(/from '\.\.\/types/g, "from '../../types");

// Fix paths starting with './ContentCard/' to './'
content = content.replace(/from '\.\/ContentCard\//g, "from './");

fs.writeFileSync('src/screens/ContentCard/index.tsx', content);
