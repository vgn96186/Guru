/* eslint-disable guru/prefer-screen-shell -- home screen root */
import React, { useEffect, useState } from 'react';
import {
  Animated,
  View,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  useWindowDimensions,
  InteractionManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import ErrorBoundary from '../components/ErrorBoundary';
import ScreenMotion from '../motion/ScreenMotion';
import StaggeredEntrance from '../motion/StaggeredEntrance';
import AgendaItem from '../components/home/AgendaItem';
import { AiStatusIndicator } from '../components/home/AiStatusIndicator';
import CompactQuickStatsBar from '../components/home/CompactQuickStatsBar';
import ExamCountdownChips from '../components/home/ExamCountdownChips';
import LinearSurface from '../components/primitives/LinearSurface';
import LinearText from '../components/primitives/LinearText';
import StartButton from '../components/StartButton';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { linearTheme as n } from '../theme/linearTheme';
import { motion } from '../motion/presets';
import { DEFAULT_INICET_DATE, DEFAULT_NEET_DATE } from '../config/appConfig';
import NextLectureSection from '../components/home/NextLectureSection';
import { HOME_GRID_STACK_BREAKPOINT } from '../components/home/homeLayout';
import { useSessionStore } from '../store/useSessionStore';
import { profileRepository } from '../db/repositories';

import { useHomeDashboardController } from './home/hooks/useHomeDashboardController';
import { HomeSkeleton } from './home/components/HomeSkeleton';
import { HomeSection } from './home/components/HomeSection';
import { styles } from './home/HomeScreen.styles';
import { homeSelectionReasonFromTopic } from './home/logic/homeHelpers';

export default function HomeScreen() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setReady(true);
    });
    return () => task.cancel();
  }, []);

  if (!ready) {
    return (
      <ErrorBoundary>
        <SafeAreaView style={styles.safe}>
          <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
          <HomeSkeleton />
        </SafeAreaView>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <HomeScreenContent />
    </ErrorBoundary>
  );
}

function HomeScreenContent() {
  const { width } = useWindowDimensions();
  const stackHomeGrid = width < HOME_GRID_STACK_BREAKPOINT;

  const controller = useHomeDashboardController();
  const {
    navigation,
    tabsNavigation,
    profile,
    isProfilePending,
    levelInfo,
    weakTopics,
    todayTasks,
    todayMinutes,
    completedSessions,
    isLoading,
    loadError,
    reloadHomeDashboard,
    mood,
    moreExpanded,
    setMoreExpanded,
    sessionResumeValid,
    setEntryComplete,
    weakTopicOffset,
    setWeakTopicOffset,
    moreAnim,
    openStudyPlan,
    heroCtaLabel,
    heroCtaSublabel,
    bootPhase,
    startButtonRef,
    handleRefreshExamDates,
  } = controller;

  if (isLoading || isProfilePending || !profile || !levelInfo) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
        <HomeSkeleton />
      </SafeAreaView>
    );
  }

  const progressClamped = Math.min(
    100,
    Math.max(0, Math.round((todayMinutes / (profile.dailyGoalMinutes || 120)) * 100)),
  );
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';
  const firstName = profile.displayName?.split(' ')[0] || 'Doctor';

  const heroCta = (() => {
    if (sessionResumeValid) {
      return {
        label: heroCtaLabel,
        sublabel: heroCtaSublabel,
        onPress: () => {
          useSessionStore.getState().resetSession();
          navigation.navigate('Session', { mood, mode: 'warmup' });
        },
      };
    }
    if (todayTasks.length > 0) {
      const next = todayTasks[0];
      return {
        label: heroCtaLabel,
        sublabel: heroCtaSublabel,
        onPress: () =>
          navigation.navigate('Session', {
            mood,
            focusTopicId: next.topic.id,
            preferredActionType: next.type,
          }),
      };
    }
    return {
      label: heroCtaLabel,
      sublabel: heroCtaSublabel,
      onPress: () => navigation.navigate('Session', { mood, mode: 'warmup' }),
    };
  })();

  const daysToInicet = profileRepository.getDaysToExam(profile.inicetDate || DEFAULT_INICET_DATE);
  const daysToNeetPg = profileRepository.getDaysToExam(profile.neetDate || DEFAULT_NEET_DATE);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />

      <ScrollView
        testID="home-scroll"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <ResponsiveContainer style={styles.content}>
          <ScreenMotion
            style={styles.motionShell}
            animateOnFocus={false}
            isEntryComplete={() => setEntryComplete(true)}
          >
            <StaggeredEntrance index={0}>
              <View style={styles.headerRow}>
                <View style={styles.headerLeft}>
                  <LinearText variant="title" style={styles.greetingText}>
                    {greeting},{' '}
                    <LinearText variant="title" style={styles.greetingName}>
                      {firstName}
                    </LinearText>
                  </LinearText>
                  <ExamCountdownChips
                    daysToInicet={daysToInicet}
                    daysToNeetPg={daysToNeetPg}
                    onRefreshExamDates={handleRefreshExamDates}
                  />
                </View>
                <View style={styles.headerRight}>
                  <AiStatusIndicator profile={profile} />
                  <TouchableOpacity
                    style={styles.settingsBtn}
                    onPress={() => tabsNavigation?.navigate('MenuTab', { screen: 'Settings' })}
                    accessibilityRole="button"
                    accessibilityLabel="Open settings"
                  >
                    <Ionicons name="settings-sharp" size={22} color={n.colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            </StaggeredEntrance>

            <StaggeredEntrance index={1}>
              <View style={styles.heroSection}>
                <StartButton
                  ref={startButtonRef}
                  onPress={heroCta.onPress}
                  label={heroCta.label}
                  sublabel={heroCta.sublabel}
                  hidden={bootPhase !== 'done'}
                />
              </View>
            </StaggeredEntrance>

            <StaggeredEntrance index={2}>
              <CompactQuickStatsBar
                progressPercent={progressClamped}
                todayMinutes={todayMinutes}
                dailyGoal={profile.dailyGoalMinutes || 120}
                streak={profile.streakCurrent}
                level={levelInfo.level}
                completedSessions={completedSessions}
              />
            </StaggeredEntrance>

            {loadError && (
              <View style={styles.loadErrorRow}>
                <LinearText variant="bodySmall" tone="error" style={styles.loadErrorText}>
                  Couldn&apos;t load agenda.
                </LinearText>
                <TouchableOpacity
                  onPress={() => reloadHomeDashboard()}
                  style={styles.retryButton}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading"
                >
                  <LinearText variant="label" tone="error" style={styles.retryButtonText}>
                    Retry
                  </LinearText>
                </TouchableOpacity>
              </View>
            )}

            <StaggeredEntrance index={3}>
              <View
                style={[
                  styles.gridLandscape,
                  styles.twoColumnGrid,
                  stackHomeGrid && styles.homeGridStacked,
                ]}
              >
                <View style={[styles.leftColumn, stackHomeGrid && styles.homeGridStackedColumn]}>
                  <NextLectureSection />
                </View>

                <View style={[styles.rightColumn, stackHomeGrid && styles.homeGridStackedColumn]}>
                  <HomeSection
                    label="DO NOW"
                    accessibilityLabel="Do now"
                    headerAction={
                      weakTopics.length > 1 ? (
                        <TouchableOpacity
                          onPress={() => setWeakTopicOffset((o) => (o + 1) % weakTopics.length)}
                          activeOpacity={0.7}
                          style={styles.headerActionButton}
                          accessibilityRole="button"
                          accessibilityLabel="Shuffle topic suggestion"
                        >
                          <Ionicons name="shuffle" size={14} color={n.colors.accent} />
                          <LinearText variant="meta" tone="accent" style={styles.headerActionText}>
                            Shuffle
                          </LinearText>
                        </TouchableOpacity>
                      ) : undefined
                    }
                  >
                    {weakTopics.length === 0 ? (
                      <TouchableOpacity
                        style={styles.fullWidthPressable}
                        onPress={() => navigation.navigate('Session', { mood })}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel="Start a session to get suggestions"
                      >
                        <LinearSurface compact style={styles.agendaItemWrap}>
                          <View style={styles.emptySectionTouchable}>
                            <LinearText
                              variant="bodySmall"
                              tone="secondary"
                              style={styles.emptySectionText}
                            >
                              No weak topic highlighted — start a session or open Study Plan.
                            </LinearText>
                          </View>
                        </LinearSurface>
                      </TouchableOpacity>
                    ) : (
                      (() => {
                        const t = weakTopics[weakTopicOffset % weakTopics.length];
                        return (
                          <LinearSurface compact key={t.id} style={styles.agendaItemWrap}>
                            <AgendaItem
                              time="Now"
                              title={t.name}
                              type={t.progress.status === 'unseen' ? 'new' : 'deep_dive'}
                              subjectName={t.subjectName}
                              priority={t.inicetPriority}
                              rationale={homeSelectionReasonFromTopic(
                                t,
                                t.progress.status === 'unseen' ? 'new' : 'deep_dive',
                              )}
                              onPress={() =>
                                navigation.navigate('Session', {
                                  mood,
                                  focusTopicId: t.id,
                                  preferredActionType:
                                    t.progress.status === 'unseen' ? 'study' : 'deep_dive',
                                })
                              }
                            />
                          </LinearSurface>
                        );
                      })()
                    )}
                  </HomeSection>
                  <View style={styles.rightColumnSectionGap}>
                    <HomeSection
                      label="UP NEXT"
                      accessibilityLabel="Up next"
                      headerAction={
                        <TouchableOpacity
                          style={styles.headerActionButton}
                          onPress={openStudyPlan}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel="Open study plan"
                        >
                          <LinearText variant="meta" tone="accent" style={styles.headerActionText}>
                            Open plan
                          </LinearText>
                          <Ionicons name="chevron-forward" size={14} color={n.colors.accent} />
                        </TouchableOpacity>
                      }
                    >
                      {todayTasks.length === 0 ? (
                        <TouchableOpacity
                          onPress={openStudyPlan}
                          style={styles.fullWidthPressable}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel="Open Study Plan"
                        >
                          <LinearSurface compact style={styles.agendaItemWrap}>
                            <View style={styles.emptySectionTouchable}>
                              <LinearText
                                variant="bodySmall"
                                tone="secondary"
                                style={styles.emptySectionText}
                              >
                                Nothing scheduled — tap to open Study Plan.
                              </LinearText>
                            </View>
                          </LinearSurface>
                        </TouchableOpacity>
                      ) : (
                        (() => {
                          const t = todayTasks[0];
                          return (
                            <LinearSurface compact style={styles.agendaItemWrap}>
                              <AgendaItem
                                time={t.timeLabel.split(' ')[0]}
                                title={t.topic.name}
                                type={
                                  t.type === 'study'
                                    ? 'new'
                                    : (t.type as 'review' | 'deep_dive' | 'new')
                                }
                                subjectName={t.topic.subjectName}
                                priority={t.topic.inicetPriority}
                                rationale={homeSelectionReasonFromTopic(
                                  t.topic,
                                  t.type === 'study'
                                    ? 'new'
                                    : (t.type as 'review' | 'deep_dive' | 'new'),
                                )}
                                onPress={() =>
                                  navigation.navigate('Session', {
                                    mood,
                                    focusTopicId: t.topic.id,
                                    preferredActionType: t.type,
                                    forcedMinutes: t.duration,
                                  })
                                }
                              />
                            </LinearSurface>
                          );
                        })()
                      )}
                    </HomeSection>
                  </View>
                </View>
              </View>
            </StaggeredEntrance>
          </ScreenMotion>

          <TouchableOpacity
            testID="tools-library-header"
            style={styles.moreHeader}
            onPress={() => {
              setMoreExpanded(!moreExpanded);
              motion
                .to(moreAnim, {
                  toValue: moreExpanded ? 0 : 1,
                  duration: 200,
                  useNativeDriver: true,
                })
                .start();
            }}
            accessibilityRole="button"
            accessibilityLabel={
              moreExpanded ? 'Collapse Tools and Advanced' : 'Expand Tools and Advanced'
            }
          >
            <LinearText variant="label" tone="muted" style={styles.moreHeaderLabel}>
              TOOLS & ADVANCED
            </LinearText>
            <Animated.View
              style={{
                transform: [
                  {
                    rotate: moreAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '180deg'],
                    }),
                  },
                ],
              }}
            >
              <Ionicons name="chevron-down" size={16} color={n.colors.textMuted} />
            </Animated.View>
          </TouchableOpacity>

          {moreExpanded && (
            <View style={styles.moreContent}>
              <LinearSurface compact style={styles.toolRow}>
                <TouchableOpacity
                  style={styles.toolRowInner}
                  onPress={() => tabsNavigation?.navigate('MenuTab', { screen: 'StudyPlan' })}
                  accessibilityRole="button"
                  accessibilityLabel="Open Study Plan"
                >
                  <Ionicons name="calendar-outline" size={18} color={n.colors.accent} />
                  <LinearText variant="bodySmall" style={styles.toolRowText}>
                    Study Plan
                  </LinearText>
                  <Ionicons name="chevron-forward" size={16} color={n.colors.textMuted} />
                </TouchableOpacity>
              </LinearSurface>
              <LinearSurface compact style={styles.toolRow}>
                <TouchableOpacity
                  style={styles.toolRowInner}
                  onPress={() => tabsNavigation?.navigate('MenuTab', { screen: 'NotesVault' })}
                  accessibilityRole="button"
                  accessibilityLabel="Open Notes Vault"
                >
                  <Ionicons name="library-outline" size={18} color={n.colors.success} />
                  <LinearText variant="bodySmall" style={styles.toolRowText}>
                    Notes Vault
                  </LinearText>
                  <Ionicons name="chevron-forward" size={16} color={n.colors.textMuted} />
                </TouchableOpacity>
              </LinearSurface>
              <LinearSurface compact style={styles.toolRow}>
                <TouchableOpacity
                  style={styles.toolRowInner}
                  onPress={() => navigation.navigate('Inertia')}
                  accessibilityRole="button"
                  accessibilityLabel="Open Inertia"
                >
                  <Ionicons name="flash-outline" size={18} color={n.colors.warning} />
                  <LinearText variant="bodySmall" style={styles.toolRowText}>
                    Inertia
                  </LinearText>
                  <Ionicons name="chevron-forward" size={16} color={n.colors.textMuted} />
                </TouchableOpacity>
              </LinearSurface>
              <LinearSurface compact style={styles.toolRow}>
                <TouchableOpacity
                  style={styles.toolRowInner}
                  onPress={() => tabsNavigation?.navigate('ChatTab', { screen: 'GuruChat' })}
                  accessibilityRole="button"
                  accessibilityLabel="Open Guru Chat"
                >
                  <Ionicons name="chatbubbles-outline" size={18} color={n.colors.accent} />
                  <LinearText variant="bodySmall" style={styles.toolRowText}>
                    Guru Chat
                  </LinearText>
                  <Ionicons name="chevron-forward" size={16} color={n.colors.textMuted} />
                </TouchableOpacity>
              </LinearSurface>
              <LinearSurface compact style={styles.toolRow}>
                <TouchableOpacity
                  style={styles.toolRowInner}
                  onPress={() => navigation.navigate('Inertia')}
                  testID="task-paralysis-btn"
                  accessibilityRole="button"
                  accessibilityLabel="Open Task Paralysis helper"
                >
                  <Ionicons name="flash-outline" size={18} color={n.colors.textMuted} />
                  <LinearText variant="bodySmall" style={styles.toolRowText}>
                    Task Paralysis
                  </LinearText>
                  <Ionicons name="chevron-forward" size={16} color={n.colors.textMuted} />
                </TouchableOpacity>
              </LinearSurface>
              <LinearSurface compact style={styles.toolRow}>
                <TouchableOpacity
                  style={styles.toolRowInner}
                  onPress={() => navigation.getParent()?.navigate('DoomscrollGuide')}
                  accessibilityRole="button"
                  accessibilityLabel="Open Harassment Mode"
                >
                  <Ionicons name="alert-circle-outline" size={18} color={n.colors.textMuted} />
                  <LinearText variant="bodySmall" style={styles.toolRowText}>
                    Harassment Mode
                  </LinearText>
                  <Ionicons name="chevron-forward" size={16} color={n.colors.textMuted} />
                </TouchableOpacity>
              </LinearSurface>
              <LinearSurface compact style={styles.toolRow}>
                <TouchableOpacity
                  style={styles.toolRowInner}
                  onPress={() => navigation.getParent()?.navigate('SleepMode')}
                  accessibilityRole="button"
                  accessibilityLabel="Open Nightstand Mode"
                >
                  <Ionicons name="moon-outline" size={18} color={n.colors.textMuted} />
                  <LinearText variant="bodySmall" style={styles.toolRowText}>
                    Nightstand Mode
                  </LinearText>
                  <Ionicons name="chevron-forward" size={16} color={n.colors.textMuted} />
                </TouchableOpacity>
              </LinearSurface>
              <LinearSurface compact style={styles.toolRow}>
                <TouchableOpacity
                  style={styles.toolRowInner}
                  onPress={() => navigation.navigate('FlaggedReview')}
                  accessibilityRole="button"
                  accessibilityLabel="Open Flagged Review"
                >
                  <Ionicons name="flag-outline" size={18} color={n.colors.textMuted} />
                  <LinearText variant="bodySmall" style={styles.toolRowText}>
                    Flagged Review
                  </LinearText>
                  <Ionicons name="chevron-forward" size={16} color={n.colors.textMuted} />
                </TouchableOpacity>
              </LinearSurface>
            </View>
          )}
        </ResponsiveContainer>
      </ScrollView>
    </SafeAreaView>
  );
}
