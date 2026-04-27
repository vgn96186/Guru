import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LinearText from '../primitives/LinearText';
import { linearTheme as n } from '../../theme/linearTheme';
import { whiteAlpha, accentAlpha } from '../../theme/colorUtils';

interface StarterItem {
  icon: string;
  text: string;
}

interface GuruChatStartersProps {
  starters: StarterItem[];
  sessionSummary?: string;
  isGeneralChat: boolean;
  topicName: string;
  onSelectStarter: (text: string) => void;
  isLoading: boolean;
}

export const GuruChatStarters = memo(function GuruChatStarters({
  starters,
  sessionSummary,
  isGeneralChat,
  topicName,
  onSelectStarter,
  isLoading,
}: GuruChatStartersProps) {
  return (
    <View className="flex-1 justify-center self-center w-full max-w-[680px] px-4 pt-4 pb-8 gap-4">
      <View className="gap-1.5 items-center mb-2">
        <View className="w-8 h-8 rounded-full items-center justify-center bg-accent/10 border border-accent/20 mb-1">
          <Ionicons name="sparkles" size={12} color={n.colors.accent} />
        </View>
        <LinearText variant="title" centered className="text-textPrimary">
          {isGeneralChat ? 'How can I help?' : `Let's tackle ${topicName}`}
        </LinearText>
        <LinearText variant="bodySmall" tone="muted" centered className="max-w-[280px]">
          Ask a doubt, start a quiz, or pick a ready prompt.
        </LinearText>
      </View>

      {sessionSummary ? (
        <View className="flex-row items-start gap-3 px-4 py-3 rounded-xl bg-white/2 border border-white/8">
          <Ionicons name="bookmark-outline" size={13} color={n.colors.textMuted} />
          <LinearText style={styles.sessionSummaryText} numberOfLines={3}>
            {sessionSummary}
          </LinearText>
        </View>
      ) : null}

      <View className="flex-row flex-wrap justify-center gap-2 mt-2 px-2">
        {starters.map((starter) => (
          <Pressable
            key={starter.text}
            onPress={() => onSelectStarter(starter.text)}
            disabled={isLoading}
            className="flex-row items-center gap-2 px-4 py-2.5 rounded-full border border-white/10 bg-white/5"
            accessibilityRole="button"
            accessibilityLabel={`Use prompt: ${starter.text}`}
          >
            <Ionicons
              name={starter.icon as keyof typeof Ionicons.glyphMap}
              size={14}
              color={n.colors.accent}
            />
            <LinearText tone="primary" className="text-[13px] font-medium">
              {starter.text}
            </LinearText>
          </Pressable>
        ))}
      </View>

      <View className="flex-row items-center justify-center gap-2 px-4">
        <Ionicons name="library-outline" size={13} color={n.colors.textMuted} />
        <LinearText variant="caption" tone="muted" centered>
          Medical sources appear inline when Guru uses them.
        </LinearText>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 680,
    paddingHorizontal: n.spacing.md,
    paddingTop: n.spacing.md,
    paddingBottom: n.spacing.lg,
    gap: n.spacing.md,
  },
  heroWrap: {
    gap: n.spacing.sm,
    alignItems: 'center',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: accentAlpha['10'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentAlpha['25'],
  },
  emptyTitle: {
    color: n.colors.textPrimary,
    textAlign: 'center',
  },
  emptyHint: {
    textAlign: 'center',
    maxWidth: 360,
  },
  sessionSummary: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: n.radius.lg,
    backgroundColor: whiteAlpha['2'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
  },
  sessionSummaryText: {
    ...n.typography.caption,
    color: n.colors.textSecondary,
    lineHeight: 19,
    flex: 1,
  },
  starterGrid: {
    gap: n.spacing.sm,
  },
  starterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: n.radius.md,
    borderWidth: 1,
    borderColor: whiteAlpha['20'],
    backgroundColor: whiteAlpha['10'],
    paddingHorizontal: n.spacing.md,
    paddingVertical: 13,
    minHeight: 62,
  },
  starterIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: accentAlpha['20'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentAlpha['35'],
    flexShrink: 0,
  },
  starterTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  starterChipText: {
    color: n.colors.textPrimary,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    lineHeight: 22,
    includeFontPadding: false,
  },
  pressed: {
    opacity: n.alpha.pressed,
    transform: [{ scale: 0.98 }],
  },
  sourceNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: n.spacing.sm,
  },
  sourceNoteText: {
    textAlign: 'center',
  },
});
