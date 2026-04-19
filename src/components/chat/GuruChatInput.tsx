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
  onSend: () => void;
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
    onChangeText(prompt);
    // Send after a brief delay to allow state update
    setTimeout(() => onSend(), 0);
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
            style={({ pressed }) => [styles.modelIconBtn, pressed && styles.pressed]}
            onPress={onModelPress}
            accessibilityRole="button"
            accessibilityLabel={`Current model: ${currentModelLabel}. Tap to change.`}
          >
            <View style={styles.modelDot} />
            <Ionicons name="chevron-down" size={8} color={n.colors.textMuted} />
          </Pressable>
          <TextInput
            style={styles.input}
            placeholder="Ask Guru anything..."
            placeholderTextColor={n.colors.textMuted}
            value={input}
            autoFocus={autoFocus}
            onChangeText={onChangeText}
            onSubmitEditing={onSend}
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
            onPress={onSend}
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
    gap: 4,
  },
  quickActionsCenterWrap: {
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  quickActionsCenter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    maxWidth: '96%',
  },
  quickActionChip: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['10'],
    backgroundColor: whiteAlpha['3'],
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  quickActionChipDisabled: {
    opacity: 0.4,
  },
  quickActionText: {
    color: n.colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  composerWrap: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: n.radius.lg,
    backgroundColor: whiteAlpha['2.5'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.border,
    marginHorizontal: 4,
    marginBottom: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  modelIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: whiteAlpha['4'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['10'],
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 2,
    flexShrink: 0,
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
    minHeight: 42,
    color: n.colors.textPrimary,
    fontSize: 15,
    lineHeight: 20,
    paddingHorizontal: 4,
    paddingVertical: 8,
    textAlignVertical: 'center',
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
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
