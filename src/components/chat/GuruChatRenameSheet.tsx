import React, { memo } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import LinearSurface from '../primitives/LinearSurface';
import LinearText from '../primitives/LinearText';
import { linearTheme as n } from '../../theme/linearTheme';
import { blackAlpha, whiteAlpha } from '../../theme/colorUtils';

interface GuruChatRenameSheetProps {
  visible: boolean;
  onClose: () => void;
  currentTitle: string;
  onTitleChange: (title: string) => void;
  onSave: () => void;
}

export const GuruChatRenameSheet = memo(function GuruChatRenameSheet({
  visible,
  onClose,
  currentTitle,
  onTitleChange,
  onSave,
}: GuruChatRenameSheetProps) {
  if (!visible) return null;

  return (
    <View style={styles.sheetOverlay} pointerEvents="box-none">
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />
      <LinearSurface
        padded={false}
        borderColor={n.colors.borderHighlight}
        style={styles.renameSheet}
      >
        <LinearText style={styles.renameEyebrow}>Chat</LinearText>
        <LinearText style={styles.renameTitle}>Rename conversation</LinearText>
        <TextInput
          style={styles.renameInput}
          value={currentTitle}
          onChangeText={onTitleChange}
          placeholder="Chat title"
          placeholderTextColor={n.colors.textMuted}
          autoFocus
          maxLength={80}
        />
        <View style={styles.renameActions}>
          <Pressable
            style={({ pressed }) => [styles.renameBtn, pressed && styles.pressed]}
            onPress={onClose}
          >
            <LinearText style={styles.renameBtnText}>Cancel</LinearText>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.renameBtn,
              styles.renameBtnPrimary,
              pressed && styles.pressed,
            ]}
            onPress={onSave}
          >
            <LinearText style={styles.renameBtnTextPrimary}>Save</LinearText>
          </Pressable>
        </View>
      </LinearSurface>
    </View>
  );
});

const styles = StyleSheet.create({
  sheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 30,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: blackAlpha['56'],
  },
  renameSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 16,
    shadowColor: n.colors.background,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 20,
  },
  renameEyebrow: {
    color: n.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textAlign: 'center',
    marginBottom: -6,
  },
  renameTitle: {
    ...n.typography.title,
    color: n.colors.textPrimary,
    textAlign: 'center',
    fontSize: 22,
  },
  renameInput: {
    backgroundColor: whiteAlpha['2'],
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
    color: n.colors.textPrimary,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  renameActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  renameBtn: {
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: whiteAlpha['2'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
  },
  renameBtnPrimary: {
    backgroundColor: n.colors.accent,
    borderColor: n.colors.accent,
    shadowColor: n.colors.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  renameBtnText: {
    color: n.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  renameBtnTextPrimary: {
    color: n.colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  pressed: {
    opacity: n.alpha.pressed,
    transform: [{ scale: 0.98 }],
  },
});
