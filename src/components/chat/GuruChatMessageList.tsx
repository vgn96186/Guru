import React, { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { type FlashListRef, type ListRenderItem } from '@shopify/flash-list';
import { AppFlashList } from '../primitives/AppFlashList';
import { GuruChatMessageItem } from './GuruChatMessageItem';
import { GuruChatStarters } from './GuruChatStarters';
import { TypingDots } from './TypingDots';
import { linearTheme as n } from '../../theme/linearTheme';
import { whiteAlpha } from '../../theme/colorUtils';
import { ChatItem, ChatMessage } from '../../types/chat';
import { GeneratedStudyImageStyle } from '../../db/queries/generatedStudyImages';

interface GuruChatMessageListProps {
  messages: ChatMessage[];
  chatItems: ChatItem[];
  isLoading: boolean;
  isInitializing: boolean;
  isHydrating: boolean;
  entryComplete: boolean;
  showEmptyState: boolean;
  starters: Array<{ icon: string; text: string }>;
  sessionSummary?: string;
  isGeneralChat: boolean;
  topicName: string;
  bannerVisible: boolean;
  imageJobKey: string | null;
  expandedSourcesMessageId: string | null;
  flatListRef: React.RefObject<FlashListRef<ChatItem>>;
  viewportWidth: number;
  onToggleSources: (messageId: string) => void;
  onCopyMessage: (text: string) => void;
  onRegenerate: () => void;
  onGenerateImage: (message: ChatMessage, style: GeneratedStudyImageStyle) => void;
  onOpenSource: (url: string) => void;
  onSetLightboxUri: (uri: string) => void;
  onSelectStarter: (text: string) => void;
  onBannerDismiss: () => void;
}

export const GuruChatMessageList = memo(function GuruChatMessageList({
  messages,
  chatItems,
  isLoading,
  isInitializing,
  entryComplete,
  showEmptyState,
  starters,
  sessionSummary,
  isGeneralChat,
  topicName,
  bannerVisible,
  imageJobKey,
  expandedSourcesMessageId,
  flatListRef,
  viewportWidth,
  onToggleSources,
  onCopyMessage,
  onRegenerate,
  onGenerateImage,
  onOpenSource,
  onSetLightboxUri,
  onSelectStarter,
  onBannerDismiss,
}: GuruChatMessageListProps) {
  const latestGuruMessageId = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'guru') return messages[i].id;
    }
    return null;
  })();

  const renderItem = useCallback<ListRenderItem<ChatItem>>(
    (info) => {
      const { item } = info;
      if (item.type === 'typing') {
        return (
          <View style={[styles.msgRow, styles.msgRowGuru]}>
            <View style={styles.guruAvatarTiny}>
              <></>
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
                    <TypingDots active={entryComplete} />
                  </View>
                </View>
              </View>
            </View>
          </View>
        );
      }

      return (
        <GuruChatMessageItem
          message={item.message}
          isLatestGuruMessage={item.message.id === latestGuruMessageId}
          isLoading={isLoading}
          isInitializing={isInitializing}
          imageJobKey={imageJobKey}
          expandedSourcesMessageId={expandedSourcesMessageId}
          onToggleSources={onToggleSources}
          onCopyMessage={onCopyMessage}
          onRegenerate={onRegenerate}
          onGenerateImage={onGenerateImage}
          onOpenSource={onOpenSource}
          onSetLightboxUri={onSetLightboxUri}
        />
      );
    },
    [
      isInitializing,
      entryComplete,
      latestGuruMessageId,
      isLoading,
      imageJobKey,
      expandedSourcesMessageId,
      onToggleSources,
      onCopyMessage,
      onRegenerate,
      onGenerateImage,
      onOpenSource,
      onSetLightboxUri,
    ],
  );

  if (showEmptyState) {
    return (
      <View style={styles.chatSurface}>
        <GuruChatStarters
          starters={starters}
          sessionSummary={sessionSummary}
          isGeneralChat={isGeneralChat}
          topicName={topicName}
          onSelectStarter={onSelectStarter}
          isLoading={isLoading}
        />
      </View>
    );
  }

  return (
    <View style={styles.contentWrap}>
      {bannerVisible && (
        <View style={styles.infoBanner}>
          <Ionicons name="library-outline" size={14} color={n.colors.accent} style={styles.bannerIcon} />
          <LinearText style={styles.infoText}>
            Grounded with Wikipedia, Europe PMC and PubMed. Sources are linked inline.
          </LinearText>
          <Pressable onPress={onBannerDismiss} hitSlop={8}>
            <Ionicons name="close" size={14} color={n.colors.textMuted} />
          </Pressable>
        </View>
      )}

      <View style={styles.chatSurface}>
        <AppFlashList
          key={`chat-list-${viewportWidth}`}
          ref={flatListRef}
          data={chatItems}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          maintainVisibleContentPosition={{
            autoscrollToBottomThreshold: 0.2,
            startRenderingFromBottom: true,
          }}
        />
      </View>
    </View>
  );
}
);

// Need to import these for the inline typing indicator
import LinearText from '../primitives/LinearText';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';

const styles = StyleSheet.create({
  contentWrap: {
    flex: 1,
    paddingHorizontal: n.spacing.sm,
    paddingBottom: n.spacing.sm,
    gap: 0,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 4,
    marginTop: 4,
    borderRadius: n.radius.md,
    backgroundColor: `${n.colors.accent}10`,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${n.colors.accent}25`,
  },
  bannerIcon: {
    marginTop: 0,
  },
  infoText: {
    ...n.typography.caption,
    color: n.colors.textSecondary,
    flex: 1,
  },
  chatSurface: {
    flex: 1,
    borderRadius: n.radius.lg,
    backgroundColor: whiteAlpha['1.5'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.border,
    marginTop: 6,
    overflow: 'hidden',
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: n.spacing.xs,
    paddingTop: n.spacing.sm,
    paddingBottom: n.spacing.md,
    gap: n.spacing.sm,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  // Inline typing indicator styles (copied from GuruChatMessageItem for the inline use)
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    width: '100%',
  },
  msgRowGuru: {},
  guruAvatarTiny: {
    width: 28,
    height: 28,
  },
  msgContent: {
    flex: 1,
    maxWidth: '100%',
  },
  msgContentGuru: {
    alignItems: 'stretch',
  },
  messageStack: {
    flexShrink: 1,
  },
  messageStackGuru: {
    width: '88%',
    maxWidth: '88%',
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubbleWrap: {
    maxWidth: '100%',
    minWidth: 0,
    flexShrink: 1,
  },
  bubbleWrapGuru: {
    maxWidth: '88%',
    minWidth: 0,
    alignSelf: 'flex-start',
  },
  bubble: {
    alignSelf: 'flex-start',
    minWidth: 0,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  guruBubble: {
    backgroundColor: whiteAlpha['3'],
    borderColor: whiteAlpha['8'],
    borderBottomLeftRadius: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: whiteAlpha['12'],
  },
  typingBubble: {
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  msgMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  msgAuthor: {
    ...n.typography.caption,
    color: n.colors.textPrimary,
  },
  msgMetaDivider: {
    color: '#66718C',
    fontSize: 11,
  },
  msgMetaText: {
    ...n.typography.meta,
    color: n.colors.textSecondary,
  },
});
