import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenBannerFrame from './ScreenBannerFrame';

export interface PersistentScreenBannerConfig {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  searchElement?: React.ReactNode;
  rightElement?: React.ReactNode;
  titleStyle?: any;
  subtitleStyle?: any;
  titleNumberOfLines?: number;
  onBackPress?: () => void;
  showBack?: boolean;
  backButtonTestID?: string;
}

interface PersistentScreenBannerContextValue {
  banner: PersistentScreenBannerConfig | null;
  setBanner: (ownerId: string, banner: PersistentScreenBannerConfig) => void;
  clearBanner: (ownerId: string) => void;
  reservedHeight: number;
}

const DEFAULT_RESERVED_HEIGHT = 112;

const PersistentScreenBannerContext = createContext<PersistentScreenBannerContextValue | null>(null);

export function PersistentScreenBannerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{
    ownerId: string | null;
    banner: PersistentScreenBannerConfig | null;
  }>({
    ownerId: null,
    banner: null,
  });
  const [reservedHeight, setReservedHeight] = useState(DEFAULT_RESERVED_HEIGHT);
  const setBanner = useCallback((ownerId: string, banner: PersistentScreenBannerConfig) => {
    setState((prev) => {
      if (prev.ownerId === ownerId && prev.banner === banner) {
        return prev;
      }
      return { ownerId, banner };
    });
  }, []);
  const clearBanner = useCallback((ownerId: string) => {
    setState((prev) => (prev.ownerId === ownerId ? { ownerId: null, banner: null } : prev));
  }, []);
  const value = useMemo(
    () => ({
      banner: state.banner,
      setBanner,
      clearBanner,
      reservedHeight,
    }),
    [clearBanner, reservedHeight, setBanner, state.banner],
  );

  return (
    <PersistentScreenBannerContext.Provider value={value}>
      {children}
      <PersistentScreenBannerHost
        reservedHeight={reservedHeight}
        onMeasuredHeight={(height) => {
          if (height > 0 && height !== reservedHeight) {
            setReservedHeight(height);
          }
        }}
      />
    </PersistentScreenBannerContext.Provider>
  );
}

export function usePersistentScreenBanner() {
  return useContext(PersistentScreenBannerContext);
}

function PersistentScreenBannerHost({
  reservedHeight,
  onMeasuredHeight,
}: {
  reservedHeight: number;
  onMeasuredHeight: (height: number) => void;
}) {
  const context = usePersistentScreenBanner();
  const insets = useSafeAreaInsets();

  if (!context?.banner) return null;

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <View
        style={[styles.content, { paddingTop: insets.top + 8 }]}
        onLayout={(event) => {
          const nextHeight = Math.ceil(event.nativeEvent.layout.height);
          if (nextHeight > 0 && nextHeight !== reservedHeight) {
            onMeasuredHeight(nextHeight);
          }
        }}
      >
        <ScreenBannerFrame {...context.banner} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
    zIndex: 50,
    elevation: 50,
    pointerEvents: 'box-none',
  },
  content: {
    paddingHorizontal: 16,
  },
});
