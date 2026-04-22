import { DeviceEventEmitter } from 'react-native';
import { navigationRef } from '../navigation/navigationRef';

DeviceEventEmitter.addListener('guru.fgs.blocked', () => {
  // Navigation ref might not be ready if this happens very early
  if (navigationRef.isReady()) {
    navigationRef.navigate('SamsungBatterySheet');
  }
});
