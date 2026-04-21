import React, { memo } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LinearText from '../primitives/LinearText';
import { linearTheme as n } from '../../theme/linearTheme';
import { whiteAlpha } from '../../theme/colorUtils';
import { QUICK_REPLY_OPTIONS } from '../../utils/chatUtils';

interface GuruChatInputProps {
  input: string;
  onChangeText: (text: string) => void;
  onSend: (text?: string) => void;
  onModelPress: () => void;
  currentModelLabel: string;
  isLoading: boolean;
  autoFocus?: boolean;
  /** When false, hides Explain / Don't know / etc. chips above the composer. */
  showQuickReplies?: boolean;
}

export const GuruChatInput = memo(function GuruChatInput({
  input,
  onChangeText,
  onSend,
  onModelPress,
  currentModelLabel,
  isLoading,
  autoFocus,
  showQuickReplies = true,
}: GuruChatInputProps) {
  return (
    <View style={styles.composerOuter}>
      {showQuickReplies ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.quickRepliesContent}
          style={styles.quickRepliesScroll}
        >
          {QUICK_REPLY_OPTIONS.map((option) => (
            <Pressable
              key={option.key}
              style={({ pressed }) => [
                styles.quickReplyChip,
                pressed && !isLoading && styles.pressed,
                isLoading && styles.quickReplyChipDisabled,
              ]}
              onPress={() => onSend(option.prompt)}
              disabled={isLoading}
              accessibilityRole="button"
              accessibilityLabel={`Send quick reply: ${option.label}`}
            >
              <LinearText style={styles.quickReplyChipText} numberOfLines={1}>
                {option.label}
              </LinearText>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.composerWrap}>
        <View style={styles.composerRow}>
          <Pressable
            style={({ pressed }) => [styles.modelPillInline, pressed && styles.pressed]}
            onPress={onModelPress}
            accessibilityRole="button"
            accessibilityLabel={`Current model: ${currentModelLabel}. Tap to change.`}
          >
            <View style={styles.modelDot} />
            <LinearText style={styles.modelPillText} numberOfLines={1}>
              {currentModelLabel}
            </LinearText>
            <Ionicons name="chevron-down" size={11} color={n.colors.textMuted} />
          </Pressable>

          <TextInput
            style={styles.input}
            placeholder="Ask Guru anything..."
            placeholderTextColor={n.colors.textMuted}
            value={input}
            autoFocus={autoFocus}
            onChangeText={onChangeText}
            multiline
            blurOnSubmit={false}
            maxLength={1000}
            selectionColor={n.colors.accent}
            textAlignVertical={Platform.OS === 'android' ? 'top' : 'center'}
            underlineColorAndroid="transparent"
          />

          <Pressable
            style={({ pressed }) => [
              styles.sendBtn,
              (!input.trim() || isLoading) && styles.sendBtnDisabled,
              pressed && input.trim() && !isLoading && styles.pressed,
            ]}
            android_ripple={{ color: '#ffffff18', radius: 20 }}
            onPress={() => onSend()}
            disabled={!input.trim() || isLoading}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <Ionicons
              name={isLoading ? 'ellipse-outline' : 'arrow-up'}
              size={17}
              color={n.colors.textPrimary}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
});

/** Solid fill (no alpha) so chat messages never bleed through behind the composer or TextInput. */
const COMPOSER_SURFACE = '#12151c';

const styles = StyleSheet.create({
  composerOuter: {
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'stretch',
    paddingHorizontal: 0,
    paddingTop: 6,
    paddingBottom: 0,
    backgroundColor: n.colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: n.colors.border,
  },
  quickRepliesScroll: {
    alignSelf: 'stretch',
    maxHeight: 40,
    marginBottom: 8,
  },
  quickRepliesContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 2,
  },
  quickReplyChip: {
    flexShrink: 0,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['12'],
    backgroundColor: '#1a1e28',
  },
  quickReplyChipDisabled: {
    opacity: 0.45,
  },
  quickReplyChipText: {
    color: n.colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  composerWrap: {
    alignSelf: 'stretch',
    width: '100%',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: COMPOSER_SURFACE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['10'],
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    minHeight: 34,
  },
  modelPillInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 132,
    height: 34,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
    backgroundColor: '#1a1e28',
    paddingHorizontal: 9,
    flexShrink: 0,
  },
  modelPillText: {
    color: n.colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 1,
  },
  modelDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: n.colors.accent,
    shadowColor: '#5E6AD2',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
  },
  input: {
    flex: 1,
    minHeight: 34,
    maxHeight: 96,
    color: n.colors.textPrimary,
    backgroundColor: COMPOSER_SURFACE,
    fontSize: 15,
    lineHeight: 20,
    paddingHorizontal: 4,
    paddingTop: Platform.OS === 'android' ? 6 : 5,
    paddingBottom: Platform.OS === 'android' ? 6 : 5,
    borderRadius: 10,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: n.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    shadowColor: '#5E6AD2',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  sendBtnDisabled: {
    backgroundColor: whiteAlpha['4'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  pressed: {
    opacity: n.alpha.pressed,
    transform: [{ scale: 0.98 }],
  },
});
