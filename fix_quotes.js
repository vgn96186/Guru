const fs = require('fs');

let tRepo = fs.readFileSync('src/components/LoadingOverlay.tsx', 'utf-8');

tRepo = tRepo.replace(/tone=\\"secondary\\"/g, 'tone="secondary"');

fs.writeFileSync('src/components/LoadingOverlay.tsx', tRepo);
