import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LinearSurface from '../primitives/LinearSurface';
import LinearText from '../primitives/LinearText';
import { AppFlashList } from '../primitives/AppFlashList';
import { linearTheme as n } from '../../theme/linearTheme';
import { whiteAlpha, blackAlpha, accentAlpha } from '../../theme/colorUtils';
import { GuruChatThread } from '../../db/queries/aiCache';
import { formatTime } from '../../utils/chatUtils';

interface GuruChatHistoryDrawerProps {
  visible: boolean;
  onClose: () => void;
  threads: GuruChatThread[];
  currentThreadId: number | null;
  onOpenThread: (thread: GuruChatThread) => void;
  onNewChat: () => void;
  onRenameThread: (thread: GuruChatThread) => void;
  onDeleteThread: (thread: GuruChatThread) => void;
}

export const GuruChatHistoryDrawer = memo(function GuruChatHistoryDrawer({
  visible,
  onClose,
  threads,
  currentThreadId,
  onOpenThread,
  onNewChat,
  onRenameThread,
  onDeleteThread,
}: GuruChatHistoryDrawerProps) {
  if (!visible) return null;

  const renderHistoryItem = ({ item }: { item: GuruChatThread }) => {
    const isActive = item.id === currentThreadId;
    return (
      <Pressable
        style={({ pressed }) => [
          styles.historyItem,
          isActive && styles.historyItemActive,
          pressed && styles.pressed,
        ]}
        onPress={() => onOpenThread(item)}
      >
        <View style={styles.historyItemMain}>
          <LinearText style={styles.historyItemTitle} numberOfLines={2}>
            {item.title}
          </LinearText>
          <LinearText style={styles.historyItemTopic} numberOfLines={2}>
            {item.topicName}
          </LinearText>
          <LinearText style={styles.historyItemPreview} numberOfLines={3}>
            {item.lastMessagePreview || 'No messages yet'}
          </LinearText>
        </View>
        <View style={styles.historyItemSide}>
          <LinearText style={styles.historyItemTime}>{formatTime(item.lastMessageAt)}</LinearText>
          <View style={styles.historyItemActions}>
            <Pressable
              style={({ pressed }) => [styles.historyActionBtn, pressed && styles.pressed]}
              onPress={() => onRenameThread(item)}
              hitSlop={6}
            >
              <Ionicons name="pencil-outline" size={14} color={n.colors.accent} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.historyActionBtn, pressed && styles.pressed]}
              onPress={() => onDeleteThread(item)}
              hitSlop={6}
            >
              <Ionicons name="trash-outline" size={14} color={n.colors.textMuted} />
            </Pressable>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.historyOverlay} pointerEvents="box-none">
      <Pressable style={styles.historyBackdrop} onPress={onClose} />
      <LinearSurface padded={false} style={styles.historyDrawer}>
        <View style={styles.historyHeader}>
          <View>
            <LinearText style={styles.historyEyebrow}>Chats</LinearText>
            <LinearText style={styles.historyTitle}>History</LinearText>
          </View>
          <Pressable
            style={({ pressed }) => [styles.historyCloseBtn, pressed && styles.pressed]}
            onPress={onClose}
          >
            <Ionicons name="close" size={18} color={n.colors.textMuted} />
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [styles.historyNewBtn, pressed && styles.pressed]}
          onPress={onNewChat}
        >
          <Ionicons name="add-outline" size={18} color={n.colors.accent} />
          <LinearText style={styles.historyNewBtnText}>New Chat</LinearText>
        </Pressable>

        <AppFlashList
          data={threads}
          keyExtractor={(item) => item.id.toString()}
          style={styles.historyList}
          contentContainerStyle={styles.historyListContent}
          renderItem={renderHistoryItem}
          ListEmptyComponent={
            <View style={styles.historyEmpty}>
              <LinearText style={styles.historyEmptyText}>No chats yet</LinearText>
            </View>
          }
        />
      </LinearSurface>
    </View>
  );
});

const styles = StyleSheet.create({
  historyOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 28,
  },
  historyBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: blackAlpha['52'],
  },
  historyDrawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '82%',
    maxWidth: 340,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: whiteAlpha['6'],
    paddingTop: 58,
    paddingHorizontal: 18,
    paddingBottom: 18,
    backgroundColor: n.colors.background,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  historyEyebrow: {
    color: n.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  historyTitle: {
    ...n.typography.title,
    color: n.colors.textPrimary,
    fontSize: 24,
  },
  historyCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: whiteAlpha['2'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
  },
  historyNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 18,
    paddingVertical: 13,
    marginBottom: 14,
    backgroundColor: whiteAlpha['2'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
  },
  historyNewBtnText: {
    ...n.typography.label,
    color: n.colors.textPrimary,
  },
  historyList: {
    flex: 1,
  },
  historyListContent: {
    gap: 0,
    paddingBottom: 20,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: whiteAlpha['1.5'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    marginBottom: 8,
  },
  historyItemActive: {
    backgroundColor: accentAlpha['8'],
    borderColor: accentAlpha['20'],
  },
  historyItemMain: {
    flex: 1,
    minWidth: 0,
  },
  historyItemTitle: {
    ...n.typography.label,
    color: n.colors.textPrimary,
    lineHeight: 20,
  },
  historyItemTopic: {
    ...n.typography.caption,
    color: n.colors.textMuted,
    lineHeight: 18,
    marginTop: 2,
  },
  historyItemPreview: {
    ...n.typography.caption,
    color: n.colors.textMuted,
    lineHeight: 19,
    marginTop: 6,
  },
  historyItemSide: {
    alignItems: 'flex-end',
    gap: 8,
  },
  historyItemTime: {
    color: n.colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  historyItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historyActionBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: whiteAlpha['2'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
  },
  historyEmpty: {
    paddingVertical: 28,
    alignItems: 'center',
  },
  historyEmptyText: {
    ...n.typography.caption,
    color: n.colors.textMuted,
  },
  pressed: {
    opacity: n.alpha.pressed,
  },
});
