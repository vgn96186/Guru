import React, { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { type FlashListRef, type ListRenderItem } from '@shopify/flash-list';
import { AppFlashList } from '../primitives/AppFlashList';
import LinearText from '../primitives/LinearText';
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
  imageJobKey: string | null;
  expandedSourcesMessageId: string | null;
  flatListRef: React.RefObject<FlashListRef<ChatItem> | null>;
  viewportWidth: number;
  onToggleSources: (messageId: string) => void;
  onCopyMessage: (text: string) => void;
  onRegenerate: () => void;
  onGenerateImage: (message: ChatMessage, style: GeneratedStudyImageStyle) => void;
  onOpenSource: (url: string) => void;
  onSetLightboxUri: (uri: string) => void;
  onSelectStarter: (text: string) => void;
}

function getLatestGuruMessageId(messages: ChatMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'guru') {
      return messages[index].id;
    }
  }

  return null;
}

function getTypingLabel(isHydrating: boolean, isInitializing: boolean) {
  if (isHydrating) {
    return 'Loading conversation...';
  }

  if (isInitializing) {
    return 'Waking up on-device AI...';
  }

  return 'Thinking...';
}

type TypingIndicatorRowProps = {
  isHydrating: boolean;
  isInitializing: boolean;
  entryComplete: boolean;
};

const TypingIndicatorRow = memo(function TypingIndicatorRow({
  isHydrating,
  isInitializing,
  entryComplete,
}: TypingIndicatorRowProps) {
  return (
    <View style={[styles.msgRow, styles.msgRowGuru]}>
      <View style={styles.avatar}>
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
              {getTypingLabel(isHydrating, isInitializing)}
            </LinearText>
          </View>

          <View style={[styles.bubbleWrap, styles.bubbleWrapGuru]}>
            <View style={[styles.bubble, styles.guruBubble, styles.typingBubble]}>
              <TypingDots active={entryComplete && !isHydrating} />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
});

export const GuruChatMessageList = memo(function GuruChatMessageList({
  messages,
  chatItems,
  isLoading,
  isInitializing,
  isHydrating,
  entryComplete,
  showEmptyState,
  starters,
  sessionSummary,
  isGeneralChat,
  topicName,
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
}: GuruChatMessageListProps) {
  const latestGuruMessageId = getLatestGuruMessageId(messages);

  const renderItem = useCallback<ListRenderItem<ChatItem>>(
    ({ item }) => {
      if (item.type === 'typing') {
        return (
          <TypingIndicatorRow
            isHydrating={isHydrating}
            isInitializing={isInitializing}
            entryComplete={entryComplete}
          />
        );
      }

      return (
        <GuruChatMessageItem
          message={item.message}
          isLatestGuruMessage={item.message.id === latestGuruMessageId}
          isLoading={isLoading}
          isInitializing={isInitializing}
          isHydrating={isHydrating}
          entryComplete={entryComplete}
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
      entryComplete,
      expandedSourcesMessageId,
      imageJobKey,
      isHydrating,
      isInitializing,
      isLoading,
      latestGuruMessageId,
      onCopyMessage,
      onGenerateImage,
      onOpenSource,
      onRegenerate,
      onSetLightboxUri,
      onToggleSources,
    ],
  );

  if (showEmptyState) {
    return (
      <View style={styles.emptySurface}>
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
});

const styles = StyleSheet.create({
  contentWrap: {
    flex: 1,
    paddingHorizontal: n.spacing.sm,
    paddingBottom: n.spacing.sm,
    gap: 0,
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
  emptySurface: {
    flex: 1,
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: n.spacing.xs,
    paddingTop: n.spacing.sm,
    paddingBottom: 180,
    gap: n.spacing.sm,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    width: '100%',
  },
  msgRowGuru: {},
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    marginTop: 2,
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
    width: '92%',
    maxWidth: '92%',
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
  msgAuthor: {
    ...n.typography.caption,
    color: n.colors.textPrimary,
  },
  msgMetaDivider: {
    color: n.colors.textMuted,
    fontSize: 11,
  },
  msgMetaText: {
    ...n.typography.meta,
    color: n.colors.textSecondary,
  },
  bubbleWrap: {
    maxWidth: '100%',
    minWidth: 0,
    flexShrink: 1,
  },
  bubbleWrapGuru: {
    maxWidth: '92%',
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
    borderBottomLeftRadius: 8,
  },
  typingBubble: {
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
});
