import LinearBadge from '../components/primitives/LinearBadge';
import LinearButton from '../components/primitives/LinearButton';
import LinearDivider from '../components/primitives/LinearDivider';
import LinearSurface from '../components/primitives/LinearSurface';
import LinearText from '../components/primitives/LinearText';
import React from 'react';
import { View, TouchableOpacity, Pressable, StatusBar, ScrollView, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { incrementWrongCount, markTopicNeedsAttention } from '../db/queries/topics';
import { setContentFlagged } from '../db/queries/aiCache';
import { useProfileQuery } from '../hooks/queries/useProfile';
import LoadingOrb from '../components/LoadingOrb';
import { confirmDestructive } from '../components/dialogService';
import { MarkdownRender } from '../components/MarkdownRender';
import ContentCard from './ContentCard';
import ErrorBoundary from '../components/ErrorBoundary';
import BreakScreen from './BreakScreen';
import BrainDumpFab from '../components/BrainDumpFab';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { CONTENT_TYPE_LABELS } from '../constants/contentTypes';
import { linearTheme as n } from '../theme/linearTheme';

import { styles } from './session/SessionScreen.styles';
import { IconCircle } from '../components/primitives/IconCircle';
import { formatSessionModelLabel } from '../services/session/sessionFormatters';
import { useSessionController } from '../hooks/session/useSessionController';
import { WarmUpMomentumScreen } from './session/WarmUpMomentumScreen';
import { SessionDoneScreen } from './session/SessionDoneScreen';
import { HomeNav } from '../navigation/typedHooks';

export default function SessionScreen() {
  const navigation = HomeNav.useNav<'Session'>();
  const route = HomeNav.useRoute<'Session'>();
  const { data: profile } = useProfileQuery();
  const routeParams = route.params as any;
  const { mood, mode: forcedMode, forcedMinutes } = routeParams;

  const {
    sessionState,
    agenda,
    currentItemIndex,
    currentContentIndex,
    maxUnlockedContentIndex,
    currentContent,
    isLoadingContent,
    completedTopicIds,
    quizResults,
    isOnBreak,
    breakCountdown,
    isPaused,
    setPaused,
    jumpToContent,
    addQuizResult,
    handleContentDone,
    handleConfidenceRating,
    handleDowngrade,
    handleMarkForReview,
    handleBreakDone,
    finishSession,
    startPlanning,
    handleContinueWithoutAi,
    aiError,
    setAiError,
    contentRetryPending,
    setContentRetryPending,
    contentRetryTimer,
    contentRetryCount,
    menuVisible,
    setMenuVisible,
    showXp,
    setShowXp,
    sessionXpTotal,
    setSessionXpTotal,
    planningOverlayVisible,
    activeElapsedSeconds,
    xpAnim,
    panHandlers,
    currentMessage,
    presencePulse,
    toastOpacity,
    isStudying,
    triggerEvent,
    isManuallyPausedRef,
    setCurrentContent,
    resetSession,
  } = useSessionController({ navigation, routeParams });

  const currentTopic = agenda?.items?.[currentItemIndex]?.topic;

  // ── Render Path ──

  if (aiError && sessionState !== 'session_done') {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <ResponsiveContainer style={styles.errorContainer}>
          <IconCircle name="alert-circle" color={n.colors.error} size={56} />
          <LinearText variant="title" centered style={styles.errorTitle}>
            AI Unavailable
          </LinearText>
          <LinearSurface style={styles.errorMsgCard} padded={false}>
            <LinearText variant="body" tone="secondary" centered style={styles.errorMsg}>
              {aiError}
            </LinearText>
          </LinearSurface>
          <LinearButton
            label="Retry AI"
            variant="primary"
            style={styles.retryBtn}
            onPress={() => {
              if (contentRetryTimer.current) {
                clearTimeout(contentRetryTimer.current);
                contentRetryTimer.current = null;
              }
              contentRetryCount.current = 0;
              setContentRetryPending(false);
              setAiError(null);
              if (!agenda) startPlanning();
              else setCurrentContent(null);
            }}
            leftIcon={<Ionicons name="reload" size={16} color={n.colors.textInverse} />}
          />
          <LinearButton
            label={agenda ? 'Continue Without AI' : 'Start Manual Review'}
            variant="secondary"
            style={styles.manualBtn}
            textStyle={styles.manualBtnText}
            onPress={handleContinueWithoutAi}
            leftIcon={<Ionicons name="book-outline" size={16} color={n.colors.textPrimary} />}
          />
          <TouchableOpacity style={styles.leaveBtn} onPress={() => navigation.goBack()}>
            <View style={styles.btnRow}>
              <Ionicons name="arrow-back" size={14} color={n.colors.textMuted} />
              <LinearText variant="bodySmall" tone="muted" style={styles.leaveBtnText}>
                Leave Session
              </LinearText>
            </View>
          </TouchableOpacity>
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  if (sessionState === 'planning') {
    return (
      <SafeAreaView style={styles.safe} testID="session-planning">
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <View style={styles.planningContainer}>
          <LoadingOrb message="Guru is planning your session..." />
        </View>
      </SafeAreaView>
    );
  }

  if (sessionState === 'agenda_reveal' && agenda) {
    const uniqueTopicCount = new Set(agenda.items.map((i) => i.topic.id)).size;
    const totalCards = agenda.items.reduce((sum, i) => sum + (i.contentTypes?.length ?? 0), 0);
    const minutes = forcedMinutes ?? agenda.totalMinutes;
    const sanitizedFocusNote = (agenda.focusNote || '')
      .replace(/deep_dive/gi, 'deep dive')
      .replace(/_/g, ' ')
      .trim();
    const title = sanitizedFocusNote.length > 0 ? sanitizedFocusNote : 'Your session is ready';
    const modeChip =
      /\bdeep dive\b/i.test(sanitizedFocusNote) || agenda.mode === 'deep'
        ? {
            label: 'DEEP',
            bg: `${n.colors.error}22`,
            border: `${n.colors.error}55`,
            fg: n.colors.error,
          }
        : agenda.mode === 'sprint'
          ? {
              label: 'SPRINT',
              bg: `${n.colors.warning}22`,
              border: `${n.colors.warning}55`,
              fg: n.colors.warning,
            }
          : {
              label: 'STUDY',
              bg: `${n.colors.success}22`,
              border: `${n.colors.success}55`,
              fg: n.colors.success,
            };

    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <ScrollView
          contentContainerStyle={styles.revealScroll}
          showsVerticalScrollIndicator={false}
        >
          <ResponsiveContainer style={styles.revealContainer} testID="session-agenda-reveal">
            {/* Header */}
            <View style={styles.revealHeader}>
              <Ionicons name="sparkles" size={40} color={n.colors.accent} />
              <View style={styles.revealHeaderText}>
                <View style={styles.revealTitleRow}>
                  <LinearText variant="title" style={styles.revealFocus}>
                    {title}
                  </LinearText>
                  <View
                    style={[
                      styles.revealModeChip,
                      { backgroundColor: modeChip.bg, borderColor: modeChip.border },
                    ]}
                  >
                    <LinearText
                      variant="chip"
                      style={[styles.revealModeChipText, { color: modeChip.fg }]}
                    >
                      {modeChip.label}
                    </LinearText>
                  </View>
                </View>
                <LinearText variant="bodySmall" tone="secondary" style={styles.revealMeta}>
                  {uniqueTopicCount} topics · {totalCards} cards · {minutes}m
                </LinearText>
              </View>
            </View>

            {/* Guru message */}
            <LinearSurface style={styles.revealGuruCard} padded={false}>
              <View style={styles.revealGuruHeader}>
                <LinearText variant="chip" tone="muted" style={styles.revealGuruLabel}>
                  GURU’S PLAN
                </LinearText>
              </View>
              <View style={styles.revealGuru}>
                <MarkdownRender content={agenda.guruMessage} compact />
              </View>
            </LinearSurface>

            {/* Topic list */}
            <LinearText variant="chip" tone="muted" style={styles.revealSectionLabel}>
              TOPICS
            </LinearText>
            <View style={styles.revealTopicList}>
              {agenda.items.map((i, idx) => {
                const topicColor = i.topic.subjectColor || n.colors.accent;
                return (
                  <LinearSurface
                    key={`${i.topic.id}-${idx}`}
                    style={[styles.revealTopic, { borderLeftColor: topicColor }]}
                  >
                    <View style={styles.revealTopicRow}>
                      <View style={[styles.revealInitial, { backgroundColor: `${topicColor}22` }]}>
                        <LinearText
                          variant="chip"
                          style={[styles.revealInitialText, { color: topicColor }]}
                        >
                          {idx + 1}
                        </LinearText>
                      </View>
                      <View style={styles.revealTopicInfo}>
                        <LinearText variant="label" style={styles.revealTopicName} truncate>
                          {i.topic.name}
                        </LinearText>
                        <View style={styles.revealTopicMeta}>
                          <LinearText variant="meta" tone="secondary" style={styles.revealTopicSub}>
                            {i.topic.subjectCode}
                          </LinearText>
                          {i.contentTypes?.length > 0 && (
                            <LinearText variant="meta" tone="muted" style={styles.revealTopicCards}>
                              {i.contentTypes.length} card{i.contentTypes.length !== 1 ? 's' : ''}
                            </LinearText>
                          )}
                        </View>
                      </View>
                    </View>
                  </LinearSurface>
                );
              })}
            </View>

            {/* Footer */}
            <View style={styles.revealLiveRow}>
              <View style={styles.revealLiveDot} />
              <LinearText variant="caption" tone="secondary" style={styles.revealSub}>
                Auto-starting…
              </LinearText>
            </View>
          </ResponsiveContainer>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (isOnBreak) {
    const curItem = agenda?.items[currentItemIndex];
    return (
      <BreakScreen
        countdown={breakCountdown}
        totalSeconds={(profile?.breakDurationMinutes ?? 5) * 60}
        topicId={curItem?.topic.id}
        onDone={handleBreakDone}
        onEndSession={finishSession}
      />
    );
  }

  if (sessionState === 'session_done') {
    if (forcedMode === 'warmup') {
      const correctTotal = quizResults.reduce((s, r) => s + r.correct, 0);
      const answeredTotal = quizResults.reduce((s, r) => s + r.total, 0);
      return (
        <WarmUpMomentumScreen
          correctTotal={correctTotal}
          answeredTotal={answeredTotal}
          mood={mood}
          onMCQBlock={() => {
            resetSession();
            navigation.replace('Session', { mood, mode: 'mcq_block', forcedMinutes: 60 });
          }}
          onContinue={() => {
            resetSession();
            navigation.replace('Session', { mood });
          }}
          onLecture={() => {
            resetSession();
            try {
              navigation.popToTop();
            } catch {
              navigation.navigate('Home');
            }
          }}
          onDone={() => {
            resetSession();
            try {
              navigation.popToTop();
            } catch {
              navigation.navigate('Home');
            }
          }}
        />
      );
    }
    return (
      <SessionDoneScreen
        completedCount={completedTopicIds.length}
        elapsedSeconds={activeElapsedSeconds}
        xpTotal={sessionXpTotal}
        quizResults={quizResults}
        agendaItems={agenda?.items ?? []}
        onClose={() => {
          resetSession();
          try {
            navigation.popToTop();
          } catch {
            navigation.navigate('Home');
          }
        }}
        onReviewGaps={(topicIds) => {
          resetSession();
          navigation.replace('Session', {
            mood,
            focusTopicIds: topicIds,
            preferredActionType: 'review',
          });
        }}
      />
    );
  }

  if (sessionState === 'topic_done') {
    const curItem = agenda?.items[currentItemIndex];
    const nextItem = agenda?.items[currentItemIndex + 1];
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <ResponsiveContainer style={styles.topicDoneContainer}>
          <IconCircle name="checkmark-circle" color={n.colors.success} size={64} />
          <LinearText variant="title" centered style={styles.topicDoneName}>
            {curItem?.topic.name}
          </LinearText>
          <View style={styles.topicDoneDivider} />
          <LinearText variant="body" tone="secondary" centered style={styles.topicDoneSub}>
            Topic complete! Taking a {profile?.breakDurationMinutes ?? 5}-min break...
          </LinearText>
          {nextItem && (
            <LinearText variant="caption" tone="muted" centered style={styles.topicDoneNext}>
              Up next: {nextItem.topic.name}
            </LinearText>
          )}
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  const curItem = agenda?.items[currentItemIndex];
  const curContentType = curItem ? curItem.contentTypes[currentContentIndex] : null;

  if (!curItem || !curContentType) {
    return (
      <SafeAreaView style={styles.safe}>
        <ResponsiveContainer style={styles.errorContainer}>
          <LoadingOrb message="Loading..." />
        </ResponsiveContainer>
      </SafeAreaView>
    );
  }

  const totalSessionSeconds =
    (forcedMinutes
      ? forcedMinutes
      : forcedMode === 'sprint'
        ? 10
        : (profile?.preferredSessionLength ?? 45)) * 60;
  const timeProgressPercent = Math.min(
    100,
    Math.round((activeElapsedSeconds / totalSessionSeconds) * 100),
  );
  const showPausedOverlay = isPaused && sessionState === 'studying' && !isOnBreak;

  return (
    <SafeAreaView style={styles.safe} testID="session-studying">
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ResponsiveContainer>
        <View style={styles.storyBarContainer}>
          <View style={[styles.storyBarFill, { width: `${timeProgressPercent}%` }]} />
        </View>

        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.phaseRow}>
              <LinearBadge
                label={
                  isPaused
                    ? 'Paused'
                    : isOnBreak
                      ? 'Break'
                      : sessionState === 'studying'
                        ? 'Studying'
                        : 'Done'
                }
                variant={
                  isPaused
                    ? 'warning'
                    : isOnBreak
                      ? 'accent'
                      : sessionState === 'studying'
                        ? 'default'
                        : 'success'
                }
                style={styles.phaseBadge}
              />
              <LinearText variant="meta" tone="secondary" style={styles.topicProgress}>
                Topic {currentItemIndex + 1}/{agenda?.items.length ?? 0}
              </LinearText>
            </View>
            <LinearText
              variant="sectionTitle"
              style={styles.topicName}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {curItem.topic.name}
            </LinearText>
            <LinearText variant="caption" tone="accent" style={styles.subjectTag}>
              {curItem.topic.subjectCode}
            </LinearText>
            <LinearText variant="meta" tone="muted" style={styles.aiSourceLine}>
              {isLoadingContent
                ? 'AI · fetching card'
                : formatSessionModelLabel(currentContent?.modelUsed)}
            </LinearText>
          </View>
          <View style={styles.headerRight}>
            {isStudying && (
              <Animated.View style={[styles.guruDot, { transform: [{ scale: presencePulse }] }]} />
            )}
            <Pressable
              onPress={() => {
                const next = !isPaused;
                isManuallyPausedRef.current = next;
                setPaused(next);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }}
              style={styles.headerIconButton}
              accessibilityRole="button"
              accessibilityLabel={isPaused ? 'Resume session' : 'Pause session'}
            >
              <Ionicons name={isPaused ? 'play' : 'pause'} size={18} color={n.colors.accent} />
            </Pressable>
            <Pressable
              onPress={() => setMenuVisible(true)}
              style={styles.headerIconButton}
              accessibilityRole="button"
              accessibilityLabel="Session menu"
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={n.colors.textSecondary} />
            </Pressable>
          </View>
        </View>

        {/* Menu overlay */}
        {menuVisible && (
          <View style={styles.menuOverlay}>
            <TouchableOpacity
              style={styles.menuBackdrop}
              onPress={() => setMenuVisible(false)}
              activeOpacity={1}
            />
            <LinearSurface style={styles.menuDropdown} padded={false}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuVisible(false);
                  handleMarkForReview();
                }}
              >
                <LinearText style={styles.menuItemEmoji}>🚩</LinearText>
                <LinearText variant="bodySmall" style={styles.menuItemText}>
                  Mark for Review
                </LinearText>
              </TouchableOpacity>
              <LinearDivider style={styles.menuDivider} />
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuVisible(false);
                  handleDowngrade();
                }}
              >
                <LinearText style={styles.menuItemEmoji}>🆘</LinearText>
                <LinearText variant="bodySmall" style={styles.menuItemText}>
                  Downgrade to Sprint
                </LinearText>
              </TouchableOpacity>
              <LinearDivider style={styles.menuDivider} />
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuVisible(false);
                  finishSession();
                }}
              >
                <LinearText style={styles.menuItemEmoji}>🚪</LinearText>
                <LinearText variant="bodySmall" tone="error" style={styles.menuItemText}>
                  End Session
                </LinearText>
              </TouchableOpacity>
            </LinearSurface>
          </View>
        )}

        {currentMessage && isStudying && !showPausedOverlay && (
          <Animated.View style={{ opacity: toastOpacity }}>
            <LinearSurface style={styles.guruToast} padded={false}>
              <LinearText variant="bodySmall" tone="accent" style={styles.guruToastText}>
                {currentMessage}
              </LinearText>
            </LinearSurface>
          </Animated.View>
        )}

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 16 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.tabRowWrapper}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
              <View style={styles.contentTypeTabs}>
                {curItem.contentTypes.map((ct, idx) => {
                  const isActive = idx === currentContentIndex;
                  const isUnlocked = idx <= maxUnlockedContentIndex;
                  return (
                    <TouchableOpacity
                      key={ct}
                      onPress={() => {
                        if (!isUnlocked || isActive) return;
                        jumpToContent(idx);
                      }}
                      disabled={!isUnlocked || isActive}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !isUnlocked, selected: isActive }}
                      style={[
                        styles.contentTab,
                        isActive && styles.contentTabActive,
                        !isActive && isUnlocked && styles.contentTabDone,
                        !isUnlocked && styles.contentTabLocked,
                      ]}
                    >
                      <LinearText variant="chip" style={styles.contentTabText}>
                        {CONTENT_TYPE_LABELS[ct]}
                      </LinearText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
            <LinearText variant="meta" tone="muted" style={styles.cardCountText}>
              {currentContentIndex + 1}/{curItem.contentTypes.length}
            </LinearText>
          </View>

          <View style={styles.contentArea} {...panHandlers}>
            {isLoadingContent ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <LoadingOrb message="Fetching content..." />
              </View>
            ) : currentContent ? (
              <ErrorBoundary>
                <ContentCard
                  key={`${curItem.topic.id}-${currentContentIndex}-${curContentType}`}
                  content={currentContent}
                  topicId={curItem.topic.id}
                  onDone={handleConfidenceRating}
                  onSkip={handleContentDone}
                  onQuizAnswered={(c) => {
                    triggerEvent(c ? 'quiz_correct' : 'quiz_wrong');
                    if (!c && curItem.topic.id) {
                      void Promise.allSettled([
                        incrementWrongCount(curItem.topic.id),
                        markTopicNeedsAttention(curItem.topic.id),
                        setContentFlagged(curItem.topic.id, 'quiz', true),
                      ]);
                    }
                  }}
                  onQuizComplete={(correct, total) =>
                    addQuizResult({ topicId: curItem.topic.id, correct, total })
                  }
                />
              </ErrorBoundary>
            ) : (
              <LoadingOrb message="Loading..." />
            )}

            <Animated.View
              style={[
                styles.xpPop,
                {
                  opacity: xpAnim,
                  transform: [
                    {
                      translateY: xpAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -40] }),
                    },
                  ],
                },
              ]}
            >
              <LinearSurface style={styles.xpPopSurface} padded={false}>
                <LinearText variant="label" style={styles.xpPopText}>
                  +{showXp} XP
                </LinearText>
              </LinearSurface>
            </Animated.View>
          </View>
        </ScrollView>

        {showPausedOverlay && (
          <View style={styles.pausedOverlay}>
            <LinearSurface style={styles.pausedContent}>
              <Ionicons
                name="pause-circle"
                size={64}
                color={n.colors.accent}
                style={{ marginBottom: 16 }}
              />
              <LinearText variant="title" centered style={styles.pausedText}>
                Study Session Paused
              </LinearText>
              <LinearText variant="body" tone="secondary" centered style={styles.pausedSubText}>
                Keep the momentum going, Doctor!{'\n'}Ready to dive back in?
              </LinearText>
              <View style={styles.pausedActions}>
                <LinearButton
                  label="Resume Studying"
                  variant="primary"
                  style={styles.resumeOverlayBtn}
                  onPress={() => {
                    isManuallyPausedRef.current = false;
                    setPaused(false);
                  }}
                  leftIcon={<Ionicons name="play" size={18} color={n.colors.textInverse} />}
                />
                <LinearButton
                  label="End Session"
                  variant="secondary"
                  style={[styles.resumeOverlayBtn, styles.endBtn]}
                  textStyle={styles.resumeOverlayBtnText}
                  onPress={async () => {
                    const ok = await confirmDestructive(
                      'End Session?',
                      'This will finalize your current study session and award XP.',
                      { confirmLabel: 'End Session', cancelLabel: 'Keep Studying' },
                    );
                    if (ok) finishSession();
                  }}
                  leftIcon={<Ionicons name="stop" size={18} color={n.colors.textPrimary} />}
                />
              </View>
            </LinearSurface>
          </View>
        )}
        <BrainDumpFab />
      </ResponsiveContainer>
    </SafeAreaView>
  );
}
