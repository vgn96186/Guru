import React, { useEffect, useMemo, useRef } from 'react';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme } from '../../theme/linearTheme';
import LinearText from './LinearText';

export interface AppBottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  snapPoints?: Array<string | number>;
  scrollable?: boolean;
  children: React.ReactNode;
}

export default function AppBottomSheet({
  open,
  onClose,
  title,
  subtitle,
  snapPoints = ['70%'],
  scrollable = false,
  children,
}: AppBottomSheetProps) {
  const modalRef = useRef<BottomSheetModal>(null);
  const resolvedSnapPoints = useMemo(() => snapPoints, [snapPoints]);

  useEffect(() => {
    if (open) {
      modalRef.current?.present();
      return;
    }
    modalRef.current?.dismiss();
  }, [open]);

  return (
    <BottomSheetModal
      ref={modalRef}
      index={0}
      snapPoints={resolvedSnapPoints}
      onDismiss={onClose}
      enablePanDownToClose
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      handleIndicatorStyle={styles.handleIndicator}
      backgroundStyle={styles.background}
      backdropComponent={(props) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.56} />
      )}
    >
      {scrollable ? (
        <BottomSheetScrollView
          style={styles.body}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {(title || subtitle) && (
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                {title ? <LinearText style={styles.title}>{title}</LinearText> : null}
                {subtitle ? <LinearText style={styles.subtitle}>{subtitle}</LinearText> : null}
              </View>
              <Pressable style={styles.closeBtn} onPress={onClose}>
                <Ionicons name="close" size={18} color={linearTheme.colors.textMuted} />
              </Pressable>
            </View>
          )}
          {children}
        </BottomSheetScrollView>
      ) : (
        <BottomSheetView style={styles.body}>
          {(title || subtitle) && (
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                {title ? <LinearText style={styles.title}>{title}</LinearText> : null}
                {subtitle ? <LinearText style={styles.subtitle}>{subtitle}</LinearText> : null}
              </View>
              <Pressable style={styles.closeBtn} onPress={onClose}>
                <Ionicons name="close" size={18} color={linearTheme.colors.textMuted} />
              </Pressable>
            </View>
          )}
          {children}
        </BottomSheetView>
      )}
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  background: {
    backgroundColor: 'rgba(8, 10, 16, 0.96)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  handleIndicator: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    width: 42,
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingBottom: 14,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: linearTheme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    color: linearTheme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
});
