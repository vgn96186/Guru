import React from 'react';
import { Pressable, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BannerIconButton from '../../components/BannerIconButton';
import Icon from '../../components/primitives/Icon';
import LinearText from '../../components/primitives/LinearText';
import ScreenHeader from '../../components/ScreenHeader';
import { linearTheme as n } from '../../theme/linearTheme';
import { whiteAlpha } from '../../theme/colorUtils';
import { ChatSkeleton } from './chatHelpers';

type GuruChatHeaderProps = {
  canGoBack: boolean;
  onBackPress: () => void;
  onOpenHistory: () => void;
  onNewChat: () => void;
};

export function GuruChatSkeletonFrame() {
  return (
    // eslint-disable-next-line guru/prefer-screen-shell -- SafeAreaView needed here
    <SafeAreaView style={styles.safe} testID="guru-chat-screen">
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ChatSkeleton />
    </SafeAreaView>
  );
}

export function GuruChatHeader({
  canGoBack,
  onBackPress,
  onOpenHistory,
  onNewChat,
}: GuruChatHeaderProps) {
  return (
    <ScreenHeader
      title="Guru Chat"
      titleNumberOfLines={1}
      onBackPress={canGoBack ? onBackPress : undefined}
      rightElement={
        <View style={styles.minimalHeaderRight}>
          <BannerIconButton
            onPress={onOpenHistory}
            accessibilityLabel="Open chat history"
            style={styles.minimalHeaderIcon}
          >
            <Icon name="reorder-three-outline" size="md" color={n.colors.textSecondary} />
          </BannerIconButton>
          <BannerIconButton
            onPress={onNewChat}
            accessibilityLabel="New chat"
            style={styles.minimalHeaderIcon}
          >
            <Icon name="create-outline" size="md" color={n.colors.textSecondary} />
          </BannerIconButton>
        </View>
      }
      showSettings
    />
  );
}

type GuruChatInfoBannerProps = {
  onDismiss: () => void;
};

export function GuruChatInfoBanner({ onDismiss }: GuruChatInfoBannerProps) {
  return (
    <View style={styles.infoBanner}>
      <View style={styles.bannerIcon}>
        <Icon name="library-outline" size="sm" color={n.colors.accent} />
      </View>
      <LinearText style={styles.infoText}>
        Grounded with Wikipedia, Europe PMC and PubMed. Sources are linked inline.
      </LinearText>
      <Pressable onPress={onDismiss} hitSlop={8}>
        <Icon name="close" size="sm" color={n.colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: n.colors.background,
  },
  minimalHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  minimalHeaderIcon: {
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginHorizontal: 4,
    marginTop: 4,
    borderRadius: 16,
    backgroundColor: whiteAlpha['2'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: whiteAlpha['8'],
  },
  bannerIcon: {
    marginTop: 0,
  },
  infoText: {
    ...n.typography.caption,
    color: n.colors.textSecondary,
    flex: 1,
  },
});
