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
          <View style={styles.guruAvatarLarge}>
            <Ionicons name="sparkles" size={20} color={n.colors.accent} />
          </View>
          <View style={styles.heroCopy}>
            <LinearText style={styles.emptyTitle}>
              {isGeneralChat ? 'Ask anything medical' : `Let's work on ${topicName}`}
            </LinearText>
            <LinearText style={styles.emptyHint}>
              Ask a question or start with one of these prompts.
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
    padding: 16,
  },
  emptyPanel: {
    borderRadius: n.radius.lg,
    padding: 20,
    backgroundColor: whiteAlpha['2'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.border,
    gap: 20,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroCopy: {
    flex: 1,
  },
  guruAvatarLarge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${n.colors.accent}16`,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${n.colors.accent}52`,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#5E6AD2',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  emptyTitle: {
    ...n.typography.title,
    color: n.colors.textPrimary,
    fontSize: 22,
  },
  emptyHint: {
    ...n.typography.bodySmall,
    color: n.colors.textMuted,
    lineHeight: 20,
    marginTop: 4,
  },
  sessionSummaryInline: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: n.radius.md,
    backgroundColor: whiteAlpha['2'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.border,
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
    alignItems: 'center',
    gap: 10,
    borderRadius: n.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.border,
    backgroundColor: whiteAlpha['2'],
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexBasis: '47%',
    flexGrow: 1,
  },
  starterIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: accentAlpha['10'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentAlpha['20'],
  },
  starterChipText: {
    color: n.colors.textSecondary,
    fontSize: 12,
    flex: 1,
    lineHeight: 17,
    fontWeight: '500',
  },
  pressed: {
    opacity: n.alpha.pressed,
    transform: [{ scale: 0.98 }],
  },
});
