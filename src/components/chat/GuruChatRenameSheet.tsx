import React, { memo } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import LinearSurface from '../primitives/LinearSurface';
import LinearText from '../primitives/LinearText';
import { linearTheme as n } from '../../theme/linearTheme';
import { whiteAlpha, accentAlpha } from '../../theme/colorUtils';

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
        <LinearText style={styles.renameTitle}>Rename Chat</LinearText>
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
          <Pressable style={({ pressed }) => [styles.renameBtn, pressed && styles.pressed]} onPress={onClose}>
            <LinearText style={styles.renameBtnText}>Cancel</LinearText>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.renameBtn, styles.renameBtnPrimary, pressed && styles.pressed]}
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
    backgroundColor: 'rgba(0,0,0,0.56)',
  },
  renameSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 16,
    shadowColor: n.colors.background,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 20,
  },
  renameTitle: {
    ...n.typography.sectionTitle,
    color: n.colors.textPrimary,
    textAlign: 'center',
  },
  renameInput: {
    backgroundColor: whiteAlpha['4'],
    borderRadius: n.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['10'],
    color: n.colors.textPrimary,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  renameActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  renameBtn: {
    borderRadius: n.radius.sm,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: whiteAlpha['4'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.border,
  },
  renameBtnPrimary: {
    backgroundColor: n.colors.accent,
    borderColor: n.colors.accent,
    shadowColor: '#5E6AD2',
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
