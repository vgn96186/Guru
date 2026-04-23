/* eslint-disable guru/prefer-screen-shell -- topic detail uses custom layout with FlatList */
import React from 'react';
import { View, FlatList, StatusBar, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ScreenHeader from '../components/ScreenHeader';
import LinearBadge from '../components/primitives/LinearBadge';
import LinearText from '../components/primitives/LinearText';
import { ResponsiveContainer } from '../hooks/useResponsive';
import LoadingOverlay from '../components/LoadingOverlay';

import { linearTheme as n } from '../theme/linearTheme';
import { useTopicDetailController } from './topicDetail/hooks/useTopicDetailController';
import {
  STATUS_ORDER,
  STATUS_LABELS,
  STATUS_BADGE_VARIANTS,
} from './topicDetail/logic/topicDetailLogic';
import { TopicFilterControls } from './topicDetail/components/TopicFilterControls';
import { TopicListItem } from './topicDetail/components/TopicListItem';
import { styles } from './topicDetail/TopicDetailScreen.styles';

export default function TopicDetailScreen() {
  const ctrl = useTopicDetailController();

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ResponsiveContainer>
        <LoadingOverlay
          visible={ctrl.bulkOperationLoading}
          message={
            ctrl.activeFilter === 'due'
              ? 'Building review session...'
              : ctrl.activeFilter === 'high_yield'
                ? 'Preparing study session...'
                : 'Setting up deep dive...'
          }
        />
        <ScreenHeader title={ctrl.subjectName} titleNumberOfLines={1} showSettings>
          <View style={styles.headerCenter}>
            <View style={styles.progressRow}>
              <LinearText variant="caption" tone="secondary" style={styles.subtitle}>
                {ctrl.displayCount}/{ctrl.leafTopics.length} micro-topics
              </LinearText>
              <View
                style={[
                  styles.pctBadge,
                  ctrl.pct >= 50 && styles.pctBadgeGood,
                  ctrl.pct === 100 && styles.pctBadgeComplete,
                ]}
              >
                <LinearText
                  variant="caption"
                  style={[
                    styles.pctText,
                    ctrl.pct >= 50 && { color: n.colors.success },
                    ctrl.pct === 100 && { color: n.colors.warning },
                  ]}
                >
                  {ctrl.pct}%
                </LinearText>
              </View>
            </View>
            {ctrl.milestoneText ? (
              <LinearText variant="caption" tone="success" style={styles.milestoneText}>
                {ctrl.milestoneText}
              </LinearText>
            ) : null}
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, { width: ctrl.progressWidth }]} />
            </View>
          </View>
        </ScreenHeader>

        <TopicFilterControls
          isSingleTopicView={ctrl.isSingleTopicView}
          searchQuery={ctrl.searchQuery}
          setSearchQuery={ctrl.setSearchQuery}
          activeFilter={ctrl.activeFilter}
          setActiveFilter={ctrl.setActiveFilter}
          filterCounts={ctrl.filterCounts}
          dueTopics={ctrl.dueTopics}
          highYieldTopics={ctrl.highYieldTopics}
          weakTopics={ctrl.weakTopics}
          launchBatch={ctrl.launchBatch}
        />

        {!ctrl.isSingleTopicView ? (
          <View style={styles.legend}>
            {STATUS_ORDER.map((status) => (
              <LinearBadge
                key={status}
                label={STATUS_LABELS[status]}
                variant={STATUS_BADGE_VARIANTS[status]}
                style={styles.legendBadge}
              />
            ))}
          </View>
        ) : null}

        <FlatList
          data={ctrl.displayTopics}
          keyExtractor={(t) => t.id.toString()}
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.list}
          onRefresh={ctrl.refreshTopics}
          refreshing={ctrl.refreshing}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <LinearText variant="sectionTitle" centered style={styles.emptyText}>
                No topics match this view
              </LinearText>
            </View>
          }
          renderItem={({ item }) => {
            const isParent = (ctrl.childrenByParentId.get(item.id)?.length ?? 0) > 0;
            const depth = ctrl.topicDepthMap.get(item.id) ?? 0;
            const isCollapsed = ctrl.collapsedParents.has(item.id);
            const isHighYield = item.inicetPriority >= 8;
            const isDue =
              item.progress.status !== 'unseen' &&
              !!item.progress.fsrsDue &&
              item.progress.fsrsDue.slice(0, 10) <= ctrl.today;
            const isWeak =
              item.progress.timesStudied > 0 &&
              item.progress.confidence > 0 &&
              item.progress.confidence < 3;
            const parentChildren = ctrl.childrenByParentId.get(item.id) ?? [];
            const parentCompleted = parentChildren.filter(
              (child) => child.progress.status !== 'unseen',
            ).length;
            const parentDue = parentChildren.filter(
              (child) =>
                child.progress.status !== 'unseen' &&
                !!child.progress.fsrsDue &&
                child.progress.fsrsDue.slice(0, 10) <= ctrl.today,
            ).length;
            const parentHighYield = parentChildren.filter(
              (child) => child.inicetPriority >= 8,
            ).length;

            return (
              <TopicListItem
                item={item}
                isParent={isParent}
                depth={depth}
                isCollapsed={isCollapsed}
                isHighYield={isHighYield}
                isDue={isDue}
                isWeak={isWeak}
                parentChildren={parentChildren}
                parentCompleted={parentCompleted}
                parentDue={parentDue}
                parentHighYield={parentHighYield}
                handleTopicPress={ctrl.handleTopicPress}
                expandedId={ctrl.expandedId}
                noteText={ctrl.noteText}
                setNoteText={ctrl.setNoteText}
                savingNoteId={ctrl.savingNoteId}
                handleSaveNote={ctrl.handleSaveNote}
                confirmDiscardUnsavedNotes={ctrl.confirmDiscardUnsavedNotes}
                setExpandedId={ctrl.setExpandedId}
                navigateToSession={ctrl.navigateToSession}
                markTopicMastered={ctrl.markTopicMastered}
                masteringTopicId={ctrl.masteringTopicId}
                imageJobKey={ctrl.imageJobKey}
                handleGenerateNoteImage={ctrl.handleGenerateNoteImage}
                noteImages={ctrl.noteImages[item.id] ?? []}
                today={ctrl.today}
              />
            );
          }}
        />
      </ResponsiveContainer>
    </SafeAreaView>
  );
}
