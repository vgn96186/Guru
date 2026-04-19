import React, { memo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  ActivityIndicator,
  type ImageStyle,
  type StyleProp,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LinearText from '../primitives/LinearText';
import { ChatImagePreview } from './ChatImagePreview';
import { MessageSources } from './MessageSources';
import { FormattedGuruMessage } from './FormattedGuruMessage';
import { TypingDots } from './TypingDots';
import { linearTheme as n } from '../../theme/linearTheme';
import { whiteAlpha, accentAlpha } from '../../theme/colorUtils';
import { ChatMessage } from '../../types/chat';
import { MedicalGroundingSource } from '../../services/ai/types';
import { GeneratedStudyImageStyle } from '../../db/queries/generatedStudyImages';
import { formatTime, getShortModelLabel } from '../../utils/chatUtils';

interface GuruChatMessageItemProps {
  message: ChatMessage;
  isLatestGuruMessage: boolean;
  isLoading: boolean;
  isInitializing: boolean;
  imageJobKey: string | null;
  expandedSourcesMessageId: string | null;
  onToggleSources: (messageId: string) => void;
  onCopyMessage: (text: string) => void;
  onRegenerate: () => void;
  onGenerateImage: (message: ChatMessage, style: GeneratedStudyImageStyle) => void;
  onOpenSource: (url: string) => void;
  onSetLightboxUri: (uri: string) => void;
}

function isDisplayableReferenceImage(source: MedicalGroundingSource): boolean {
  const uri = source.imageUrl?.trim();
  if (!uri) return false;
  if (!/^https?:\/\//i.test(uri)) return false;
  return !/\.(pdf|svg|djvu?|tiff?)(?:[?#]|$)/i.test(uri);
}

export const GuruChatMessageItem = memo(function GuruChatMessageItem({
  message,
  isLatestGuruMessage,
  isLoading,
  isInitializing,
  imageJobKey,
  expandedSourcesMessageId,
  onToggleSources,
  onCopyMessage,
  onRegenerate,
  onGenerateImage,
  onOpenSource,
  onSetLightboxUri,
}: GuruChatMessageItemProps) {
  const modelTag = getShortModelLabel(message.modelUsed);
  const hasSources = !!message.sources?.length;
  const sourcesExpanded = expandedSourcesMessageId === message.id;
  const guruGeneratedImages = message.role === 'guru' ? (message.images ?? []) : [];
  const guruReferenceImages =
    message.role === 'guru'
      ? (message.referenceImages ?? []).filter(isDisplayableReferenceImage)
      : [];
  const hasGuruImages = guruGeneratedImages.length > 0 || guruReferenceImages.length > 0;

  return (
    <View style={[styles.msgRow, styles.msgRowGuru]}>
      <View style={styles.guruAvatarTiny}>
        {message.role === 'guru' ? (
          <Ionicons name="sparkles" size={11} color={n.colors.accent} />
        ) : (
          <LinearText style={styles.userAvatarInitials}>V</LinearText>
        )}
      </View>

      <View style={[styles.msgContent, styles.msgContentGuru]}>
        <View style={[styles.messageStack, styles.messageStackGuru]}>
          <View style={[styles.msgMetaRow, styles.msgMetaRowGuru]}>
            <LinearText variant="meta" style={styles.msgAuthor}>
              {message.role === 'user' ? 'You' : 'Guru'}
            </LinearText>
            <LinearText variant="meta" tone="muted" style={styles.msgMetaDivider}>
              •
            </LinearText>
            <LinearText variant="meta" tone="muted" style={styles.msgMetaText}>
              {formatTime(message.timestamp)}
            </LinearText>
            {message.role === 'guru' && modelTag ? (
              <View style={styles.msgModelPill}>
                <LinearText variant="badge" style={styles.msgModelPillText}>
                  {modelTag}
                </LinearText>
              </View>
            ) : null}
          </View>

          {hasGuruImages ? (
            <View style={{ width: '100%' }}>
              <Pressable
                style={[styles.bubbleWrap, styles.bubbleWrapGuru]}
                onLongPress={() => onCopyMessage(message.text)}
                delayLongPress={400}
              >
                <View style={[styles.bubble, styles.guruBubble]}>
                  <FormattedGuruMessage text={message.text} />
                </View>
              </Pressable>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 4, paddingVertical: 6, gap: 8 }}
              >
                {guruReferenceImages.map((image) => (
                  <ChatImagePreview
                    key={`${message.id}-reference-${image.id}`}
                    uri={image.imageUrl!}
                    style={styles.generatedImageInline as StyleProp<ImageStyle>}
                    onPress={() => onSetLightboxUri(image.imageUrl!)}
                    onLongPress={() => onOpenSource(image.url)}
                    accessibilityLabel="View reference image"
                  />
                ))}
                {guruGeneratedImages.map((image) => (
                  <ChatImagePreview
                    key={`${message.id}-image-${image.id}`}
                    uri={image.localUri}
                    style={styles.generatedImageInline as StyleProp<ImageStyle>}
                    onPress={() => onSetLightboxUri(image.localUri)}
                    accessibilityLabel="View enlarged image"
                  />
                ))}
              </ScrollView>
            </View>
          ) : (
            <View style={[styles.bubbleWrap, styles.bubbleWrapGuru]}>
              <View style={[styles.bubble, styles.guruBubble]}>
                {message.role === 'guru' ? (
                  <FormattedGuruMessage text={message.text} />
                ) : (
                  <LinearText variant="body" style={styles.bubbleText} textBreakStrategy="simple">
                    {message.text}
                  </LinearText>
                )}
              </View>
            </View>
          )}

          {message.role === 'guru' && hasGuruImages && !hasGuruImages ? (
            <View style={styles.generatedImagesWrap}>
              {guruReferenceImages.map((image) => (
                <ChatImagePreview
                  key={`${message.id}-reference-${image.id}`}
                  uri={image.imageUrl!}
                  style={styles.generatedImage as StyleProp<ImageStyle>}
                  onPress={() => onSetLightboxUri(image.imageUrl!)}
                  onLongPress={() => onOpenSource(image.url)}
                  accessibilityLabel="View reference image"
                />
              ))}
              {guruGeneratedImages.map((image) => (
                <ChatImagePreview
                  key={`${message.id}-image-${image.id}`}
                  uri={image.localUri}
                  style={styles.generatedImage as StyleProp<ImageStyle>}
                  onPress={() => onSetLightboxUri(image.localUri)}
                  accessibilityLabel="View enlarged image"
                />
              ))}
            </View>
          ) : null}

          {message.role === 'guru' && message.sources && message.sources.length > 0 ? (
            <MessageSources
              sources={message.sources}
              messageId={message.id}
              expanded={sourcesExpanded}
              setLightboxUri={onSetLightboxUri}
              openSource={onOpenSource}
            />
          ) : null}

          {message.role === 'guru' ? (
            <>
              <View style={styles.responseActionsRow}>
                {isLatestGuruMessage && !isLoading ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.responseActionBtn,
                      styles.responseActionBtnActive,
                      pressed && styles.pressed,
                    ]}
                    onPress={onRegenerate}
                    accessibilityRole="button"
                    accessibilityLabel="Regenerate response"
                  >
                    <Ionicons name="refresh-outline" size={15} color={n.colors.textPrimary} />
                  </Pressable>
                ) : null}
                <Pressable
                  style={({ pressed }) => [styles.responseActionBtn, pressed && styles.pressed]}
                  onPress={() => onCopyMessage(message.text)}
                  accessibilityRole="button"
                  accessibilityLabel="Copy response"
                >
                  <Ionicons name="copy-outline" size={15} color={n.colors.accent} />
                </Pressable>
                {hasSources ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.responseActionBtn,
                      sourcesExpanded && styles.responseActionBtnActive,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => onToggleSources(message.id)}
                    accessibilityRole="button"
                    accessibilityLabel={sourcesExpanded ? 'Hide sources' : 'Show sources'}
                  >
                    <Ionicons
                      name="link-outline"
                      size={15}
                      color={sourcesExpanded ? n.colors.textPrimary : n.colors.accent}
                    />
                  </Pressable>
                ) : null}
                {(['illustration', 'chart'] as GeneratedStudyImageStyle[]).map((style) => {
                  const isGenerating = imageJobKey === `${message.id}:${style}`;
                  return (
                    <Pressable
                      key={`${message.id}-${style}`}
                      style={({ pressed }) => [
                        styles.responseActionBtn,
                        isGenerating && styles.responseActionBtnActive,
                        pressed && styles.pressed,
                      ]}
                      onPress={() => onGenerateImage(message, style)}
                      disabled={!!imageJobKey}
                      accessibilityRole="button"
                      accessibilityLabel={
                        style === 'illustration' ? 'Generate illustration' : 'Generate chart'
                      }
                    >
                      {isGenerating ? (
                        <ActivityIndicator size="small" color={n.colors.textPrimary} />
                      ) : (
                        <Ionicons
                          name={style === 'illustration' ? 'image-outline' : 'git-network-outline'}
                          size={15}
                          color={n.colors.accent}
                        />
                      )}
                    </Pressable>
                  );
                })}
              </View>
              {imageJobKey?.startsWith(`${message.id}:`) ? (
                <View style={styles.responseStatusRow}>
                  <ActivityIndicator size="small" color={n.colors.accent} />
                  <LinearText style={styles.responseStatusText}>
                    {imageJobKey.endsWith(':chart')
                      ? 'Generating chart...'
                      : 'Generating illustration...'}
                  </LinearText>
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    width: '100%',
  },
  msgRowUser: {},
  msgRowGuru: {},
  guruAvatarTiny: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
    overflow: 'hidden',
  },
  userAvatarInitials: {
    color: n.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  msgContent: {
    flex: 1,
    maxWidth: '100%',
  },
  msgContentUser: {
    alignItems: 'stretch',
  },
  msgContentGuru: {
    alignItems: 'stretch',
  },
  messageStack: {
    flexShrink: 1,
  },
  messageStackUser: {},
  messageStackGuru: {
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubbleWrap: {
    maxWidth: '100%',
    minWidth: 0,
    flexShrink: 1,
    paddingRight: 16,
  },
  bubbleWrapUser: {},
  bubbleWrapGuru: {
    maxWidth: '100%',
    minWidth: 0,
    alignSelf: 'flex-start',
  },
  msgMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  msgMetaRowUser: {},
  msgMetaRowGuru: {
    justifyContent: 'flex-start',
  },
  msgAuthor: {
    ...n.typography.label,
    color: n.colors.textSecondary,
    fontWeight: '700',
    fontSize: 14,
  },
  msgMetaDivider: {
    color: '#66718C',
    fontSize: 11,
  },
  msgMetaText: {
    ...n.typography.meta,
    color: n.colors.textMuted,
  },
  msgModelPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: whiteAlpha['2'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
  },
  msgModelPillText: {
    color: n.colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  bubble: {
    alignSelf: 'flex-start',
    minWidth: 0,
  },
  userBubble: {},
  guruBubble: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderBottomLeftRadius: 20,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  bubbleText: {
    ...n.typography.body,
    color: n.colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    includeFontPadding: false,
    flexShrink: 1,
    paddingRight: 4,
  },
  generatedImagesWrap: {
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  generatedImage: {
    width: 248,
    height: 248,
    borderRadius: 16,
    backgroundColor: n.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.border,
    shadowColor: n.colors.background,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  generatedImageInline: {
    width: 176,
    height: 176,
    borderRadius: 18,
    backgroundColor: n.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.border,
  },
  responseActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 10,
    opacity: 0.6,
  },
  responseStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    marginTop: 6,
    paddingHorizontal: 2,
  },
  responseStatusText: {
    color: n.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  responseActionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: whiteAlpha['2'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
  },
  responseActionBtnActive: {
    backgroundColor: accentAlpha['10'],
    borderColor: accentAlpha['20'],
  },
  pressed: {
    opacity: n.alpha.pressed,
    transform: [{ scale: 0.98 }],
  },
});
