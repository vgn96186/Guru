import { registerRootComponent } from 'expo';
import { LogBox } from 'react-native';
import App from './App';

// Ignore specific warnings
LogBox.ignoreLogs([
  'Setting a timer',
  'AsyncStorage has been extracted',
]);

// Register the root component
registerRootComponent(App);
