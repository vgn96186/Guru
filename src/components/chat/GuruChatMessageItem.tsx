import React, { memo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ImageStyle,
  type StyleProp,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LinearText from '../primitives/LinearText';
import { ChatImagePreview } from './ChatImagePreview';
import { FormattedGuruMessage } from './FormattedGuruMessage';
import { MessageSources } from './MessageSources';
import { TypingDots } from './TypingDots';
import { linearTheme as n } from '../../theme/linearTheme';
import { accentAlpha, whiteAlpha } from '../../theme/colorUtils';
import { ChatMessage } from '../../types/chat';
import { GeneratedStudyImageStyle } from '../../db/queries/generatedStudyImages';
import { MedicalGroundingSource } from '../../services/ai/types';
import { formatTime, getShortModelLabel } from '../../utils/chatUtils';

interface GuruChatMessageItemProps {
  message: ChatMessage;
  isLatestGuruMessage: boolean;
  isLoading: boolean;
  isInitializing: boolean;
  /** When true, typing animation in the in-bubble placeholder stays idle (matches list typing row). */
  isHydrating?: boolean;
  /** Gate typing-dot animation until screen motion has settled. */
  entryComplete?: boolean;
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
  if (!uri) {
    return false;
  }

  if (!/^https?:\/\//i.test(uri)) {
    return false;
  }

  return !/\.(pdf|svg|djvu?|tiff?)(?:[?#]|$)/i.test(uri);
}

type ActionButtonProps = {
  accessibilityLabel: string;
  active?: boolean;
  disabled?: boolean;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  loading?: boolean;
  onPress: () => void;
};

function ActionButton({
  accessibilityLabel,
  active = false,
  disabled = false,
  icon,
  loading = false,
  onPress,
}: ActionButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.responseActionBtn,
        active && styles.responseActionBtnActive,
        (pressed || disabled) && styles.pressed,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {loading ? (
        <ActivityIndicator size="small" color={n.colors.textPrimary} />
      ) : (
        <Ionicons name={icon} size={17} color={active ? n.colors.textPrimary : n.colors.accent} />
      )}
    </Pressable>
  );
}

export const GuruChatMessageItem = memo(function GuruChatMessageItem({
  message,
  isLatestGuruMessage,
  isLoading,
  isInitializing,
  isHydrating = false,
  entryComplete = true,
  imageJobKey,
  expandedSourcesMessageId,
  onToggleSources,
  onCopyMessage,
  onRegenerate,
  onGenerateImage,
  onOpenSource,
  onSetLightboxUri,
}: GuruChatMessageItemProps) {
  const isUser = message.role === 'user';
  const modelTag = getShortModelLabel(message.modelUsed);
  const hasSources = !!message.sources?.length;
  const sourcesExpanded = expandedSourcesMessageId === message.id;
  const guruGeneratedImages = isUser ? [] : (message.images ?? []);
  const guruReferenceImages = isUser
    ? []
    : (message.referenceImages ?? []).filter(isDisplayableReferenceImage);
  const hasGuruImages = guruGeneratedImages.length > 0 || guruReferenceImages.length > 0;
  const isGeneratingImage = !!imageJobKey?.startsWith(`${message.id}:`);
  const canShowLatestGuruActions = !isUser && isLatestGuruMessage && !isLoading;
  const showPendingState = !isUser && isLatestGuruMessage && isLoading && isInitializing;
  const showStreamPlaceholder =
    !isUser && isLatestGuruMessage && isLoading && !String(message.text ?? '').trim();

  const avatar = (
    <View style={[styles.avatar, isUser ? styles.avatarUser : styles.avatarGuru]}>
      {isUser ? (
        <LinearText style={styles.userAvatarInitials}>V</LinearText>
      ) : (
        <Ionicons name="sparkles" size={11} color={n.colors.accent} />
      )}
    </View>
  );

  return (
    <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowGuru]}>
      {!isUser ? avatar : null}

      <View style={[styles.msgContent, isUser ? styles.msgContentUser : styles.msgContentGuru]}>
        <View
          style={[styles.messageStack, isUser ? styles.messageStackUser : styles.messageStackGuru]}
        >
          <View style={[styles.msgMetaRow, isUser ? styles.msgMetaRowUser : styles.msgMetaRowGuru]}>
            <LinearText variant="meta" style={styles.msgAuthor}>
              {isUser ? 'You' : 'Guru'}
            </LinearText>
            <LinearText variant="meta" tone="muted" style={styles.msgMetaDivider}>
              •
            </LinearText>
            <LinearText variant="meta" tone="muted" style={styles.msgMetaText}>
              {formatTime(message.timestamp)}
            </LinearText>
            {showStreamPlaceholder ? (
              <>
                <LinearText variant="meta" tone="muted" style={styles.msgMetaDivider}>
                  •
                </LinearText>
                <LinearText
                  variant="meta"
                  tone="muted"
                  style={styles.msgMetaText}
                  numberOfLines={1}
                >
                  {isInitializing ? 'Waking up on-device AI...' : 'Thinking...'}
                </LinearText>
              </>
            ) : null}
            {!isUser && modelTag ? (
              <View style={styles.msgModelPill}>
                <LinearText variant="badge" style={styles.msgModelPillText}>
                  {modelTag}
                </LinearText>
              </View>
            ) : null}
          </View>

          <View style={[styles.bubbleWrap, isUser ? styles.bubbleWrapUser : styles.bubbleWrapGuru]}>
            <View
              style={[
                styles.bubble,
                isUser ? styles.userBubble : styles.guruBubble,
                !isUser && showStreamPlaceholder ? styles.guruTypingBubble : null,
              ]}
            >
              {isUser ? (
                <LinearText variant="body" style={styles.userBubbleText} textBreakStrategy="simple">
                  {message.text}
                </LinearText>
              ) : showStreamPlaceholder ? (
                <TypingDots active={entryComplete && !isHydrating} />
              ) : (
                <FormattedGuruMessage text={message.text} />
              )}
            </View>
          </View>

          {!isUser && hasGuruImages ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.inlineImagesContent}
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
          ) : null}

          {!isUser && !(isLatestGuruMessage && isLoading) ? (
            <>
              <View style={styles.responseActionsRow}>
                <ActionButton
                  accessibilityLabel="Copy response"
                  icon="copy-outline"
                  onPress={() => onCopyMessage(message.text)}
                />

                {hasSources ? (
                  <ActionButton
                    accessibilityLabel={sourcesExpanded ? 'Hide sources' : 'Show sources'}
                    active={sourcesExpanded}
                    icon="link-outline"
                    onPress={() => onToggleSources(message.id)}
                  />
                ) : null}

                {canShowLatestGuruActions ? (
                  <ActionButton
                    accessibilityLabel="Regenerate response"
                    icon="refresh-outline"
                    onPress={onRegenerate}
                  />
                ) : null}

                {canShowLatestGuruActions
                  ? (['illustration', 'chart'] as GeneratedStudyImageStyle[]).map((style) => {
                      const isGenerating = imageJobKey === `${message.id}:${style}`;

                      return (
                        <ActionButton
                          key={`${message.id}-${style}`}
                          accessibilityLabel={
                            style === 'illustration' ? 'Generate illustration' : 'Generate chart'
                          }
                          active={isGenerating}
                          disabled={!!imageJobKey}
                          icon={style === 'illustration' ? 'image-outline' : 'git-network-outline'}
                          loading={isGenerating}
                          onPress={() => onGenerateImage(message, style)}
                        />
                      );
                    })
                  : null}
              </View>

              {hasSources ? (
                <MessageSources
                  sources={message.sources ?? []}
                  messageId={message.id}
                  expanded={sourcesExpanded}
                  setLightboxUri={onSetLightboxUri}
                  openSource={onOpenSource}
                />
              ) : null}

              {isGeneratingImage ? (
                <View style={styles.responseStatusRow}>
                  <ActivityIndicator size="small" color={n.colors.accent} />
                  <LinearText style={styles.responseStatusText}>
                    {imageJobKey?.endsWith(':chart')
                      ? 'Generating chart...'
                      : 'Generating illustration...'}
                  </LinearText>
                </View>
              ) : null}

              {showPendingState ? (
                <View style={styles.responseStatusRow}>
                  <ActivityIndicator size="small" color={n.colors.accent} />
                  <LinearText style={styles.responseStatusText}>Finishing response...</LinearText>
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      </View>

      {isUser ? avatar : null}
    </View>
  );
});

const styles = StyleSheet.create({
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    width: '100%',
  },
  msgRowUser: {
    justifyContent: 'flex-end',
  },
  msgRowGuru: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
    overflow: 'hidden',
  },
  avatarUser: {
    borderColor: accentAlpha['20'],
    backgroundColor: accentAlpha['8'],
  },
  avatarGuru: {
    borderColor: whiteAlpha['8'],
    backgroundColor: 'transparent',
  },
  userAvatarInitials: {
    color: n.colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  msgContent: {
    flex: 1,
    maxWidth: '100%',
  },
  msgContentUser: {
    alignItems: 'flex-end',
  },
  msgContentGuru: {
    alignItems: 'flex-start',
  },
  messageStack: {
    minWidth: 0,
    flexShrink: 1,
  },
  messageStackUser: {
    width: '76%',
    maxWidth: '76%',
    alignItems: 'flex-end',
    alignSelf: 'flex-end',
  },
  messageStackGuru: {
    width: '94%',
    maxWidth: '94%',
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
  },
  msgMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  msgMetaRowUser: {
    justifyContent: 'flex-end',
    paddingRight: 2,
  },
  msgMetaRowGuru: {
    justifyContent: 'flex-start',
    paddingLeft: 2,
  },
  msgAuthor: {
    ...n.typography.label,
    color: n.colors.textSecondary,
    fontWeight: '700',
    fontSize: 13,
  },
  msgMetaDivider: {
    color: n.colors.textMuted,
    fontSize: 11,
  },
  msgMetaText: {
    ...n.typography.meta,
    color: n.colors.textMuted,
  },
  msgModelPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: accentAlpha['10'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentAlpha['25'],
  },
  msgModelPillText: {
    color: n.colors.accent,
    fontSize: 10,
    fontWeight: '700',
  },
  bubbleWrap: {
    maxWidth: '100%',
    minWidth: 0,
    flexShrink: 1,
  },
  bubbleWrapUser: {
    alignSelf: 'flex-end',
    maxWidth: '100%',
  },
  bubbleWrapGuru: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  bubble: {
    minWidth: 0,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: accentAlpha['10'],
    borderColor: accentAlpha['20'],
    borderBottomRightRadius: 8,
  },
  guruBubble: {
    alignSelf: 'flex-start',
    width: '100%',
    backgroundColor: whiteAlpha['3'],
    borderColor: whiteAlpha['8'],
    borderBottomLeftRadius: 10,
  },
  guruTypingBubble: {
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  userBubbleText: {
    ...n.typography.body,
    color: n.colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    includeFontPadding: false,
  },
  inlineImagesContent: {
    paddingTop: 8,
    paddingBottom: 2,
    gap: 8,
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
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: whiteAlpha['3'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['12'],
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
