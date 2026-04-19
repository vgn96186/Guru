import React, { memo } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LinearText from '../primitives/LinearText';
import { linearTheme as n } from '../../theme/linearTheme';
import { whiteAlpha, accentAlpha } from '../../theme/colorUtils';

const QUICK_REPLY_OPTIONS = [
  { key: 'explain', label: 'Explain', prompt: 'Explain' },
  { key: 'dont-know', label: "Don't know", prompt: "Don't know" },
  { key: 'change-topic', label: 'Change topic', prompt: 'Change topic' },
  { key: 'quiz-me', label: 'Quiz me', prompt: 'Quiz me' },
  { key: 'continue', label: 'Continue', prompt: 'Continue' },
] as const;

interface GuruChatInputProps {
  input: string;
  onChangeText: (text: string) => void;
  onSend: (text?: string) => void;
  onModelPress: () => void;
  currentModelLabel: string;
  isLoading: boolean;
  autoFocus?: boolean;
}

export const GuruChatInput = memo(function GuruChatInput({
  input,
  onChangeText,
  onSend,
  onModelPress,
  currentModelLabel,
  isLoading,
  autoFocus,
}: GuruChatInputProps) {
  const handleQuickReply = (prompt: string) => {
    onSend(prompt);
  };

  return (
    <View style={styles.composerToolsWrap}>
      <View style={styles.quickActionsCenterWrap}>
        <View style={styles.quickActionsCenter}>
          {QUICK_REPLY_OPTIONS.map((option) => (
            <Pressable
              key={option.key}
              style={({ pressed }) => [
                styles.quickActionChip,
                isLoading && styles.quickActionChipDisabled,
                pressed && !isLoading && styles.pressed,
              ]}
              onPress={() => handleQuickReply(option.prompt)}
              disabled={isLoading}
            >
              <LinearText style={styles.quickActionText}>{option.label}</LinearText>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.composerWrap}>
        <View style={styles.inputRow}>
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
            placeholder="Message Guru..."
            placeholderTextColor={n.colors.textMuted}
            value={input}
            autoFocus={autoFocus}
            onChangeText={onChangeText}
            onSubmitEditing={() => onSend()}
            returnKeyType="send"
            multiline={false}
            blurOnSubmit={false}
            maxLength={1000}
            selectionColor={n.colors.accent}
          />
          <Pressable
            style={({ pressed }) => [
              styles.sendBtn,
              (!input.trim() || isLoading) && styles.sendBtnDisabled,
              pressed && input.trim() && !isLoading && styles.pressed,
            ]}
            android_ripple={{ color: '#ffffff18', radius: 22 }}
            onPress={() => onSend()}
            disabled={!input.trim() || isLoading}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <Ionicons
              name={isLoading ? 'ellipse-outline' : 'send'}
              size={18}
              color={n.colors.textPrimary}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  composerToolsWrap: {
    gap: 8,
  },
  quickActionsCenterWrap: {
    alignItems: 'flex-start',
    paddingHorizontal: 4,
  },
  quickActionsCenter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 6,
    maxWidth: '100%',
  },
  quickActionChip: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
    backgroundColor: 'transparent',
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  quickActionChipDisabled: {
    opacity: 0.4,
  },
  quickActionText: {
    color: n.colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  composerWrap: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 22,
    backgroundColor: whiteAlpha['2'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
    marginHorizontal: 4,
    marginBottom: 4,
  },
  modelPillInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 132,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
    backgroundColor: whiteAlpha['2.5'],
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexShrink: 1,
  },
  modelPillText: {
    color: n.colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 2,
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
    minHeight: 40,
    color: n.colors.textPrimary,
    fontSize: 14,
    lineHeight: 18,
    paddingHorizontal: 4,
    paddingVertical: 8,
    textAlignVertical: 'center',
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: n.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
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
