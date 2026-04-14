import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ResilientImage } from '../ResilientImage';
import LinearText from '../primitives/LinearText';
import { linearTheme as n } from '../../theme/linearTheme';
import { whiteAlpha, accentAlpha } from '../../theme/colorUtils';
import { MedicalGroundingSource } from '../../services/aiService';

interface MessageSourcesProps {
  sources: MedicalGroundingSource[];
  messageId: string;
  expanded: boolean;
  setLightboxUri: (uri: string) => void;
  openSource: (url: string) => void;
}

const MessageSourcesComponent = ({
  sources,
  messageId,
  expanded,
  setLightboxUri,
  openSource,
}: MessageSourcesProps) => {
  if (!sources || sources.length === 0 || !expanded) return null;

  return (
    <View style={styles.sourcesWrap}>
      <View style={styles.sourcesHeader}>
        <Ionicons name="documents-outline" size={13} color={n.colors.accent} />
        <LinearText style={styles.sourcesLabel}>Sources ({sources.length})</LinearText>
      </View>
      {sources.map((source, index) => (
        <View key={`${messageId}-${source.id}`} style={styles.sourceCard}>
          <View style={styles.sourceNumBadge}>
            <LinearText style={styles.sourceNum}>{index + 1}</LinearText>
          </View>
          {source.imageUrl ? (
            <Pressable
              onPress={() => setLightboxUri(source.imageUrl!)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Enlarge source thumbnail"
            >
              <ResilientImage
                uri={source.imageUrl}
                style={styles.sourceImage}
                resizeMode="cover"
                showRetry={false}
              />
            </Pressable>
          ) : null}
          <Pressable
            style={({ pressed }) => [styles.sourceBodyPress, pressed && styles.pressed]}
            onPress={() => openSource(source.url)}
            android_ripple={{ color: `${n.colors.accent}22` }}
          >
            <LinearText style={styles.sourceTitle} numberOfLines={2}>
              {source.title}
            </LinearText>
            <LinearText style={styles.sourceMeta}>
              {source.source}
              {source.publishedAt ? `  ·  ${source.publishedAt}` : ''}
            </LinearText>
          </Pressable>
          <Pressable
            style={({ pressed }) => [pressed && styles.pressed]}
            onPress={() => openSource(source.url)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Open source in browser"
          >
            <Ionicons name="open-outline" size={13} color={n.colors.textMuted} />
          </Pressable>
        </View>
      ))}
    </View>
  );
};

export const MessageSources = memo(MessageSourcesComponent);

const styles = StyleSheet.create({
  sourcesWrap: {
    width: '100%',
    marginTop: 8,
    borderRadius: n.radius.md,
    backgroundColor: whiteAlpha['2'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.border,
    overflow: 'hidden',
  },
  sourcesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: accentAlpha['4'],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: n.colors.border,
  },
  sourcesLabel: {
    color: n.colors.accent,
    fontSize: 12,
    fontWeight: '800',
  },
  sourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: n.colors.border,
  },
  sourceNumBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: `${n.colors.accent}16`,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${n.colors.accent}33`,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sourceNum: {
    color: n.colors.accent,
    fontSize: 11,
    fontWeight: '800',
  },
  sourceImage: {
    width: 36,
    height: 36,
    borderRadius: 10,
    flexShrink: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
    backgroundColor: n.colors.surfaceHover,
  },
  sourceBodyPress: {
    flex: 1,
    minWidth: 0,
  },
  pressed: {
    opacity: n.alpha.pressed,
  },
  sourceTitle: {
    color: n.colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  sourceMeta: {
    color: n.colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
});
