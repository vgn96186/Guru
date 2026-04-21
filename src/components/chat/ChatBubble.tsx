import React, { memo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormattedGuruMessage } from './ChatFormatter';
import { ChatImagePreview } from './ChatImagePreview';
import { MessageSources } from './MessageSources';
import { TypingDots } from './TypingDots';
import LinearText from '../primitives/LinearText';
import { linearTheme as n } from '../../theme/linearTheme';
import { whiteAlpha, accentAlpha } from '../../theme/colorUtils';
import { ChatMessage } from '../../types/chat';
import { GeneratedStudyImageStyle } from '../../db/queries/generatedStudyImages';

interface ChatBubbleProps {
  message?: ChatMessage;
  type: 'message' | 'typing';
  isLatestGuruMessage: boolean;
  isTypingActive: boolean;
  expandedSourcesMessageId: string | null;
  imageJobKey: string | null;
  loading: boolean;
  isInitializing?: boolean;
  copyMessage: (text: string) => void;
  openSource: (url: string) => void;
  setLightboxUri: (uri: string) => void;
  setExpandedSourcesMessageId: (id: string | ((prev: string | null) => string | null)) => void;
  handleRegenerateReply: () => void;
  handleGenerateMessageImage: (message: ChatMessage, style: GeneratedStudyImageStyle) => void;
}

function isImageJobForMessage(imageJobKey: string | null, messageId: string | undefined) {
  return !!imageJobKey && !!messageId && imageJobKey.startsWith(`${messageId}:`);
}

const ChatBubbleComponent = ({
  message,
  type,
  isLatestGuruMessage,
  isTypingActive,
  expandedSourcesMessageId,
  imageJobKey,
  loading,
  isInitializing = false,
  copyMessage,
  openSource,
  setLightboxUri,
  setExpandedSourcesMessageId,
  handleRegenerateReply,
  handleGenerateMessageImage,
}: ChatBubbleProps) => {
  if (type === 'typing') {
    return (
      <View style={[styles.msgRow, styles.msgRowGuru]}>
        <View style={styles.guruAvatarTiny}>
          <Ionicons name="sparkles" size={11} color={n.colors.accent} />
        </View>
        <View style={[styles.msgContent, styles.msgContentGuru]}>
          <View style={[styles.messageStack, styles.messageStackGuru]}>
            <View style={styles.msgMetaRow}>
              <LinearText variant="meta" style={styles.msgAuthor}>
                Guru
              </LinearText>
              <LinearText variant="meta" tone="muted" style={styles.msgMetaDivider}>
                •
              </LinearText>
              <LinearText variant="meta" tone="muted" style={styles.msgMetaText}>
                {isInitializing ? 'Waking up on-device AI...' : 'Thinking...'}
              </LinearText>
            </View>
            <View style={[styles.bubbleWrap, styles.bubbleWrapGuru]}>
              <View style={[styles.bubble, styles.guruBubble, styles.typingBubble]}>
                <TypingDots active={isTypingActive} />
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (!message) return null;

  const role = message.role;
  const isUser = role === 'user';
  const modelTag = message.modelUsed?.split('/').pop() ?? null;
  const hasSources = !!message.sources?.length;
  const sourcesExpanded = expandedSourcesMessageId === message.id;
  const guruGeneratedImages = role === 'guru' ? (message.images ?? []) : [];
  const guruReferenceImages =
    role === 'guru'
      ? (message.referenceImages ?? []).filter((s) => {
          const uri = s.imageUrl?.trim();
          if (!uri || !/^https?:\/\//i.test(uri)) return false;
          return !/\.(pdf|svg|djvu?|tiff?)(?:[?#]|$)/i.test(uri);
        })
      : [];
  const hasGuruImages = guruGeneratedImages.length > 0 || guruReferenceImages.length > 0;

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowGuru]}>
      {!isUser && (
        <View style={styles.guruAvatarTiny}>
          <Ionicons name="sparkles" size={11} color={n.colors.accent} />
        </View>
      )}

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
            {!isUser && modelTag && (
              <View style={styles.msgModelPill}>
                <LinearText variant="badge" style={styles.msgModelPillText}>
                  {modelTag}
                </LinearText>
              </View>
            )}
          </View>

          {hasGuruImages ? (
            <View style={{ width: '100%' }}>
              <View style={[styles.bubbleWrap, styles.bubbleWrapGuru]}>
                <View style={[styles.bubble, styles.guruBubble]}>
                  <FormattedGuruMessage text={message.text} />
                </View>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalImagesContent}
              >
                {guruReferenceImages.map((image) => (
                  <ChatImagePreview
                    key={`${message.id}-reference-${image.id}`}
                    uri={image.imageUrl!}
                    style={[styles.generatedImage, { width: 160, height: 160 }]}
                    onPress={() => setLightboxUri(image.imageUrl!)}
                    onLongPress={() => openSource(image.url)}
                    accessibilityLabel="View reference image"
                  />
                ))}
                {guruGeneratedImages.map((image) => (
                  <ChatImagePreview
                    key={`${message.id}-image-${image.id}`}
                    uri={image.localUri}
                    style={[styles.generatedImage, { width: 160, height: 160 }]}
                    onPress={() => setLightboxUri(image.localUri)}
                    accessibilityLabel="View enlarged image"
                  />
                ))}
              </ScrollView>
            </View>
          ) : (
            <View
              style={[styles.bubbleWrap, isUser ? styles.bubbleWrapUser : styles.bubbleWrapGuru]}
            >
              <View style={[styles.bubble, isUser ? styles.userBubble : styles.guruBubble]}>
                {isUser ? (
                  <LinearText
                    variant="body"
                    style={[styles.bubbleText, styles.userBubbleText]}
                    textBreakStrategy="simple"
                  >
                    {message.text}
                  </LinearText>
                ) : (
                  <FormattedGuruMessage text={message.text} />
                )}
              </View>
            </View>
          )}

          {!isUser && message.sources && message.sources.length > 0 && (
            <MessageSources
              sources={message.sources}
              messageId={message.id}
              expanded={sourcesExpanded}
              setLightboxUri={setLightboxUri}
              openSource={openSource}
            />
          )}

          {!isUser && (
            <View style={styles.responseActionsRow}>
              {isLatestGuruMessage && !loading && (
                <Pressable
                  style={({ pressed }) => [
                    styles.responseActionBtn,
                    styles.responseActionBtnActive,
                    pressed && styles.pressed,
                  ]}
                  onPress={handleRegenerateReply}
                >
                  <Ionicons name="refresh-outline" size={15} color={n.colors.textPrimary} />
                </Pressable>
              )}
              <Pressable
                style={({ pressed }) => [styles.responseActionBtn, pressed && styles.pressed]}
                onPress={() => copyMessage(message.text)}
              >
                <Ionicons name="copy-outline" size={15} color={n.colors.accent} />
              </Pressable>
              {hasSources && (
                <Pressable
                  style={({ pressed }) => [
                    styles.responseActionBtn,
                    sourcesExpanded && styles.responseActionBtnActive,
                    pressed && styles.pressed,
                  ]}
                  onPress={() =>
                    setExpandedSourcesMessageId((current) =>
                      current === message.id ? null : message.id,
                    )
                  }
                >
                  <Ionicons
                    name="link-outline"
                    size={15}
                    color={sourcesExpanded ? n.colors.textPrimary : n.colors.accent}
                  />
                </Pressable>
              )}
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
                    onPress={() => handleGenerateMessageImage(message, style)}
                    disabled={!!imageJobKey}
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
          )}

          {!isUser && imageJobKey?.startsWith(`${message.id}:`) && (
            <View style={styles.responseStatusRow}>
              <ActivityIndicator size="small" color={n.colors.accent} />
              <LinearText style={styles.responseStatusText}>
                {imageJobKey.endsWith(':chart')
                  ? 'Generating chart...'
                  : 'Generating illustration...'}
              </LinearText>
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

function areChatBubblePropsEqual(prev: ChatBubbleProps, next: ChatBubbleProps) {
  if (prev.type !== next.type) {
    return false;
  }

  if (prev.type === 'typing' || next.type === 'typing') {
    return prev.isTypingActive === next.isTypingActive;
  }

  if (prev.message !== next.message) {
    return false;
  }

  const messageId = prev.message?.id;
  if (prev.isLatestGuruMessage !== next.isLatestGuruMessage) {
    return false;
  }

  const prevExpanded = prev.expandedSourcesMessageId === messageId;
  const nextExpanded = next.expandedSourcesMessageId === messageId;
  if (prevExpanded !== nextExpanded) {
    return false;
  }

  const prevImageJobActive = isImageJobForMessage(prev.imageJobKey, messageId);
  const nextImageJobActive = isImageJobForMessage(next.imageJobKey, messageId);
  if (prevImageJobActive !== nextImageJobActive) {
    return false;
  }

  if (prevImageJobActive && prev.imageJobKey !== next.imageJobKey) {
    return false;
  }

  if ((prev.isLatestGuruMessage || next.isLatestGuruMessage) && prev.loading !== next.loading) {
    return false;
  }

  return true;
}

export const ChatBubble = memo(ChatBubbleComponent, areChatBubblePropsEqual);

const styles = StyleSheet.create({
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, width: '100%' },
  msgRowUser: { flexDirection: 'row-reverse' },
  msgRowGuru: {},
  guruAvatarTiny: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: accentAlpha['10'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentAlpha['25'],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginBottom: 4,
  },
  msgContent: { flex: 1, maxWidth: '100%' },
  msgContentUser: { alignItems: 'stretch' },
  msgContentGuru: { alignItems: 'stretch' },
  messageStack: { flexShrink: 1 },
  messageStackUser: { maxWidth: '60%', alignSelf: 'flex-end', alignItems: 'flex-end' },
  messageStackGuru: {
    width: '88%',
    maxWidth: '88%',
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  msgMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  msgMetaRowUser: { justifyContent: 'flex-end' },
  msgMetaRowGuru: { justifyContent: 'flex-start' },
  msgAuthor: { ...n.typography.caption, color: n.colors.textPrimary },
  msgMetaDivider: { color: '#66718C', fontSize: 11 },
  msgMetaText: { ...n.typography.meta, color: n.colors.textSecondary },
  msgModelPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: accentAlpha['8'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: accentAlpha['18'],
  },
  msgModelPillText: { color: n.colors.accent, fontSize: 10, fontWeight: '700' },
  bubble: {
    alignSelf: 'flex-start',
    minWidth: 0,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  userBubble: {
    backgroundColor: accentAlpha['14'],
    borderColor: accentAlpha['35'],
    borderBottomRightRadius: 6,
  },
  guruBubble: {
    backgroundColor: whiteAlpha['3'],
    borderColor: whiteAlpha['8'],
    borderBottomLeftRadius: 6,
  },
  typingBubble: { paddingVertical: 16, paddingHorizontal: 18 },
  bubbleText: {
    ...n.typography.body,
    color: n.colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    flexShrink: 1,
    paddingRight: 4,
  },
  userBubbleText: { color: n.colors.textPrimary, fontWeight: '600' },
  bubbleWrap: { maxWidth: '100%', minWidth: 0, flexShrink: 1 },
  bubbleWrapUser: { maxWidth: '60%', alignSelf: 'flex-end' },
  bubbleWrapGuru: { maxWidth: '88%', minWidth: 0, alignSelf: 'flex-start' },
  horizontalImagesContent: { paddingHorizontal: 4, paddingVertical: 6, gap: 8 },
  generatedImage: {
    width: 220,
    height: 220,
    borderRadius: 16,
    backgroundColor: n.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.border,
  },
  responseActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignSelf: 'flex-start',
    gap: 2,
    marginTop: 4,
  },
  responseActionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: n.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.borderHighlight,
  },
  responseActionBtnActive: {
    backgroundColor: `${n.colors.accent}16`,
    borderColor: `${n.colors.accent}52`,
  },
  responseStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    marginTop: 6,
    paddingHorizontal: 2,
  },
  responseStatusText: { color: n.colors.textMuted, fontSize: 12, fontWeight: '600' },
  pressed: { opacity: n.alpha.pressed },
});
