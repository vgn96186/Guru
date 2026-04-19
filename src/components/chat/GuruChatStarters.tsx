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
    <View style={styles.emptyWrap}>
      <View style={styles.emptyPanel}>
        <View style={styles.heroRow}>
          <View style={styles.heroCopy}>
            <LinearText style={styles.eyebrow}>Guru</LinearText>
            <LinearText style={styles.emptyTitle}>
              {isGeneralChat ? 'How can I help you today?' : `How can I help with ${topicName}?`}
            </LinearText>
            <LinearText style={styles.emptyHint}>
              Start with a prompt below or ask anything about your prep.
            </LinearText>
          </View>
        </View>

        {sessionSummary ? (
          <View style={styles.sessionSummaryInline}>
            <LinearText style={styles.sessionSummaryInlineText} numberOfLines={3}>
              {sessionSummary}
            </LinearText>
          </View>
        ) : null}

        <View style={styles.starterGrid}>
          {starters.map((starter) => (
            <Pressable
              key={starter.text}
              style={({ pressed }) => [styles.starterChip, pressed && styles.pressed]}
              android_ripple={{ color: `${n.colors.accent}22` }}
              onPress={() => onSelectStarter(starter.text)}
              disabled={isLoading}
            >
              <View style={styles.starterIconWrap}>
                <Ionicons
                  name={starter.icon as keyof typeof Ionicons.glyphMap}
                  size={14}
                  color={n.colors.accent}
                />
              </View>
              <LinearText style={styles.starterChipText} numberOfLines={3}>
                {starter.text}
              </LinearText>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 24,
  },
  emptyPanel: {
    gap: 18,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  heroCopy: {
    flex: 1,
  },
  eyebrow: {
    color: n.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  emptyTitle: {
    ...n.typography.title,
    color: n.colors.textPrimary,
    fontSize: 28,
    lineHeight: 34,
  },
  emptyHint: {
    ...n.typography.bodySmall,
    color: n.colors.textMuted,
    lineHeight: 21,
    marginTop: 8,
  },
  sessionSummaryInline: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: whiteAlpha['1.5'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
  },
  sessionSummaryInlineText: {
    ...n.typography.caption,
    color: n.colors.textSecondary,
    lineHeight: 19,
  },
  starterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  starterChip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
    backgroundColor: whiteAlpha['1.5'],
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexBasis: '47%',
    flexGrow: 1,
  },
  starterIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
  },
  starterChipText: {
    color: n.colors.textPrimary,
    fontSize: 13,
    flex: 1,
    lineHeight: 19,
    fontWeight: '600',
  },
  pressed: {
    opacity: n.alpha.pressed,
    transform: [{ scale: 0.98 }],
  },
});
