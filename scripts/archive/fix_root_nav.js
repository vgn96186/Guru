const fs = require('fs');

let code = fs.readFileSync('../src/navigation/RootNavigator.tsx', 'utf-8');
code = code.replace("import TabNavigator from './TabNavigator';", "import TabNavigator from './TabNavigator';\nimport LockdownScreen from '../screens/LockdownScreen';");
fs.writeFileSync('../src/navigation/RootNavigator.tsx', code);
console.log('Fixed RootNavigator again');
