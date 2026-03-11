const fs = require('fs');

let nav = fs.readFileSync('../src/navigation/RootNavigator.tsx', 'utf-8');
nav = nav.replace("import AppNavigator from './AppNavigator';", "import AppNavigator from './AppNavigator';\nimport LockdownScreen from '../screens/LockdownScreen';");
fs.writeFileSync('../src/navigation/RootNavigator.tsx', nav);
console.log('Fixed RootNavigator imports');
