const fs = require('fs');

let code = fs.readFileSync('../src/screens/InertiaScreen.tsx', 'utf-8');
code = code.replace(
  "navigation.navigate('Session', { mood: 'distracted', mode: 'sprint' });",
  "navigation.navigate('Session', { mood: 'distracted', mode: 'sprint', forcedMinutes: 5 });"
);
fs.writeFileSync('../src/screens/InertiaScreen.tsx', code);
console.log('Patched InertiaScreen.tsx to pass forcedMinutes: 5');
