import React, { memo } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
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
  const canSend = input.trim().length > 0 && !isLoading;

  return (
    <View style={styles.composerOuter}>
      {showQuickReplies ? (
        <View style={styles.quickRepliesWrap}>
          {QUICK_REPLY_OPTIONS.map((option) => (
            <Pressable
              key={option.key}
              onPress={() => onSend(option.prompt)}
              disabled={isLoading}
              className="bg-white/10 border border-white/20 px-4 py-2 rounded-full mx-1 my-1"
              accessibilityRole="button"
              accessibilityLabel={`Send quick reply: ${option.label}`}
            >
              <LinearText
                tone="primary"
                className="text-[13px] font-semibold"
                numberOfLines={1}
              >
                {option.label}
              </LinearText>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View className="flex-1 px-3 py-2 rounded-[24px] bg-[#1A1A1A] border border-white/10 mx-3">
        <View className="flex-row items-center gap-2 min-h-[38px]">
          <Pressable
            onPress={onModelPress}
            className="flex-row items-center gap-1 px-2 py-1 rounded-full border border-white/10 bg-white/5 shrink"
            accessibilityRole="button"
            accessibilityLabel={`Current model: ${currentModelLabel}. Tap to change.`}
          >
            <Ionicons name="hardware-chip-outline" size={13} color={n.colors.textMuted} />
            <LinearText tone="secondary" className="text-[12px] shrink" numberOfLines={1}>
              {currentModelLabel}
            </LinearText>
            <Ionicons name="chevron-down" size={13} color={n.colors.textMuted} />
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
            returnKeyType="send"
            enterKeyHint="send"
            onSubmitEditing={() => {
              if (canSend) onSend();
            }}
            selectionColor={n.colors.accent}
            textAlignVertical={Platform.OS === 'android' ? 'top' : 'center'}
            underlineColorAndroid="transparent"
          />

          <Pressable
            style={({ pressed }) => [
              styles.sendBtn,
              !canSend && styles.sendBtnDisabled,
              pressed && canSend && styles.pressed,
            ]}
            android_ripple={{ color: whiteAlpha['12'], radius: 20 }}
            onPress={() => onSend()}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <Ionicons
              name={isLoading ? 'ellipsis-horizontal' : 'arrow-up'}
              size={20}
              color={canSend ? '#FFFFFF' : n.colors.textMuted}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  composerOuter: {
    width: '100%',
    alignSelf: 'stretch',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    backgroundColor: n.colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
  },
  quickRepliesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    width: '100%',
  },
  quickReplyChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: n.colors.accent,
    backgroundColor: 'rgba(94, 106, 210, 0.15)',
    margin: 4,
  },
  quickReplyChipDisabled: {
    opacity: 0.5,
  },
  quickReplyChipText: {
    color: n.colors.accent,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
  },
  composerWrap: {
    alignSelf: 'stretch',
    width: '100%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 24,
    backgroundColor: '#1A1A1A', // Slightly lighter than pure black to be seen
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    minHeight: 36,
  },
  modelInlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 132,
    minHeight: 36,
    paddingHorizontal: 9,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
    backgroundColor: whiteAlpha['2'],
    flexShrink: 0,
  },
  modelInlineText: {
    ...n.typography.meta,
    color: n.colors.textSecondary,
    flexShrink: 1,
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 120,
    color: n.colors.textPrimary,
    backgroundColor: n.colors.surfaceInset,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    lineHeight: 20,
    paddingHorizontal: 4,
    paddingTop: Platform.OS === 'android' ? 8 : 8,
    paddingBottom: Platform.OS === 'android' ? 8 : 8,
    borderRadius: n.radius.sm,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: n.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    shadowColor: n.colors.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  sendBtnDisabled: {
    backgroundColor: whiteAlpha['4'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
    shadowOpacity: 0,
    elevation: 0,
  },
  pressed: {
    opacity: n.alpha.pressed,
    transform: [{ scale: 0.97 }],
  },
  pressedSubtle: {
    opacity: n.alpha.pressed,
  },
});
