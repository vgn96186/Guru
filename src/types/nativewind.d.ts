import 'react-native';

declare module 'react-native' {
  interface ViewProps {
    className?: string;
  }
  interface TextProps {
    className?: string;
  }
  interface TouchableOpacityProps {
    className?: string;
  }
  interface ScrollViewProps {
    className?: string;
  }
  interface TextInputProps {
    className?: string;
  }
  interface ImageProps {
    className?: string;
  }
}

declare module 'react-native-safe-area-context' {
  import { NativeSafeAreaViewProps } from 'react-native-safe-area-context';
  export interface NativeSafeAreaViewProps {
    className?: string;
  }
}
