import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  useNavigation,
  useFocusEffect,
  getFocusedRouteNameFromRoute,
} from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PomodoroBreakPayload, TabParamList } from './types';
import { ChatStackNav, HomeStackNav, MenuStackNav, SyllabusStackNav } from './tabStacks';
import { CustomTabBar } from './CustomTabBar';
import LectureReturnSheet from '../components/LectureReturnSheet';
import { EXTERNAL_APPS } from '../constants/externalApps';
import { linearTheme as n } from '../theme/linearTheme';
import { launchMedicalApp, type SupportedMedicalApp } from '../services/appLauncher';
import { useAppStore } from '../store/useAppStore';
import { BUNDLED_GROQ_KEY, BUNDLED_HF_TOKEN } from '../config/appConfig';
import { generateADHDNote, type LectureAnalysis } from '../services/transcriptionService';
import { showInfo, showSuccess, showError } from '../components/dialogService';
import { getSubjectByName } from '../db/queries/topics';
import { saveLectureTranscript } from '../db/queries/aiCache';
import { getDb } from '../db/database';
import {
  useLectureReturnRecovery,
  type LectureReturnSheetData,
} from '../hooks/useLectureReturnRecovery';
import ConfidenceSelector from '../components/ConfidenceSelector';
import TopicPillRow from '../components/TopicPillRow';
import SubjectChip from '../components/SubjectChip';
import SubjectSelectionCard from '../components/SubjectSelectionCard';
import LinearSurface from '../components/primitives/LinearSurface';
import LinearText from '../components/primitives/LinearText';
import { navigationRef } from './navigationRef';
import { HOME_GRID_STACK_BREAKPOINT } from '../components/home/homeLayout';

const Tab = createMaterialTopTabNavigator<TabParamList>();

const EXTERNAL_APP_ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  cerebellum: 'school-outline',
  dbmci: 'medkit-outline',
  marrow: 'flask-outline',
  prepladder: 'layers-outline',
  bhatia: 'person-outline',
  youtube: 'logo-youtube',
};

export default function TabNavigator() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const profile = useAppStore((state) => state.profile);
  const refreshProfile = useAppStore((state) => state.refreshProfile);
  const faceTrackingEnabled = profile?.faceTrackingEnabled ?? false;
  const groqKey = (profile?.groqApiKey || BUNDLED_GROQ_KEY || '').trim();
  const deepgramKey = (profile?.deepgramApiKey || '').trim();
  const huggingFaceToken = (profile?.huggingFaceToken || BUNDLED_HF_TOKEN || '').trim();
  const huggingFaceModel = profile?.huggingFaceTranscriptionModel?.trim();
  const localWhisperPath =
    profile?.useLocalWhisper && profile?.localWhisperPath ? profile.localWhisperPath : undefined;
  const [isActionHubOpen, setIsActionHubOpen] = useState(false);
  const isActionHubOpenRef = useRef(false);
  isActionHubOpenRef.current = isActionHubOpen;
  const sheetAnim = useRef(new Animated.Value(0)).current;
  const sheetDragY = useRef(new Animated.Value(0)).current;
  const bottomInset = Math.max(insets.bottom, 8);
  const [dueCount, setDueCount] = useState(0);
  const [returnSheet, setReturnSheet] = useState<LectureReturnSheetData | null>(null);
  const actionHubNarrow = windowWidth < HOME_GRID_STACK_BREAKPOINT;
  /** Phone-class devices (portrait or landscape): 3 icons per row → 2 rows for 6 apps. */
  const externalAppsTwoRowLayout =
    Math.min(windowWidth, windowHeight) < HOME_GRID_STACK_BREAKPOINT;
  const externalChipLayout = useMemo(() => {
    const gridGap = 12;
    const sheetPadX =
      (windowWidth < HOME_GRID_STACK_BREAKPOINT ? n.spacing.xl : n.spacing.lg) * 2;
    const sheetOuterW = Math.min(windowWidth * 0.94, 680);
    const innerW = Math.max(0, sheetOuterW - sheetPadX);
    if (externalAppsTwoRowLayout) {
      const cols = 3;
      const w = (innerW - gridGap * (cols - 1)) / cols;
      return { chipWidth: Math.max(88, w) };
    }
    return {
      chipWidth: windowWidth >= 520 ? ('16.66%' as const) : ('31.5%' as const),
    };
  }, [windowWidth, externalAppsTwoRowLayout]);

  const refreshDueCount = useCallback(() => {
    getDb()
      .getFirstAsync<{ c: number }>(
        "SELECT COUNT(*) as c FROM topic_progress WHERE next_review_date <= datetime('now') AND status != 'unseen'",
      )
      .then((r) => setDueCount(r?.c ?? 0));
  }, []);

  useEffect(() => {
    refreshDueCount();
  }, [refreshDueCount]);

  useFocusEffect(
    useCallback(() => {
      refreshDueCount();
    }, [refreshDueCount]),
  );

  // Tab bar height for positioning the sheet just above it
  const TAB_BAR_HEIGHT = 60 + bottomInset;

  useEffect(() => {
    Animated.spring(sheetAnim, {
      toValue: isActionHubOpen ? 1 : 0,
      tension: 80,
      friction: 12,
      useNativeDriver: true,
    }).start();
  }, [isActionHubOpen, sheetAnim]);

  useEffect(() => {
    if (isActionHubOpen) {
      sheetDragY.setValue(0);
    }
  }, [isActionHubOpen, sheetDragY]);

  // Intercept Android hardware/gesture back to close the sheet instead of popping navigator
  useEffect(() => {
    if (!isActionHubOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setIsActionHubOpen(false);
      return true; // consumed — prevents navigator from going back
    });
    return () => sub.remove();
  }, [isActionHubOpen]);

  async function launchExternalAction(appId: SupportedMedicalApp) {
    setIsActionHubOpen(false);
    try {
      await launchMedicalApp(appId, faceTrackingEnabled, {
        groqKey: groqKey || undefined,
        deepgramKey: deepgramKey || undefined,
        huggingFaceToken: huggingFaceToken || undefined,
        huggingFaceModel: huggingFaceModel || undefined,
        localWhisperPath,
      });
    } catch (error: any) {
      void showError(error, 'Could not open app');
    }
  }

  const [uploadReview, setUploadReview] = useState<LectureAnalysis | null>(null);
  const [uploadConfidence, setUploadConfidence] = useState<1 | 2 | 3 | null>(null);
  const [uploadSubjectRequired, setUploadSubjectRequired] = useState(false);
  const [selectedUploadSubjectName, setSelectedUploadSubjectName] = useState<string | null>(null);
  const [isSavingUpload, setIsSavingUpload] = useState(false);
  const dismissThreshold = 60;
  const dismissVelocity = 1;
  const sheetPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        isActionHubOpenRef.current && gs.dy > 10 && Math.abs(gs.dy) > Math.abs(gs.dx) * 1.5,
      onMoveShouldSetPanResponderCapture: (_, gs) =>
        isActionHubOpenRef.current && gs.dy > 10 && Math.abs(gs.dy) > Math.abs(gs.dx) * 1.5,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, gs) => {
        // Clamp to positive so dragging up beyond origin is ignored
        sheetDragY.setValue(Math.max(0, gs.dy));
      },
      onPanResponderRelease: (_, gs) => {
        const shouldDismiss = gs.dy > dismissThreshold || gs.vy > dismissVelocity;
        if (shouldDismiss) {
          Animated.parallel([
            Animated.spring(sheetDragY, {
              toValue: 300,
              velocity: gs.vy,
              tension: 50,
              friction: 10,
              useNativeDriver: true,
            }),
            Animated.timing(sheetAnim, {
              toValue: 0,
              duration: 180,
              useNativeDriver: true,
            }),
          ]).start(() => {
            setIsActionHubOpen(false);
          });
          return;
        }
        Animated.spring(sheetDragY, {
          toValue: 0,
          velocity: gs.vy,
          tension: 65,
          friction: 11,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(sheetDragY, {
          toValue: 0,
          tension: 65,
          friction: 11,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  useLectureReturnRecovery({
    onRecovered: setReturnSheet,
    onPomodoroBreak: (payload?: PomodoroBreakPayload) => {
      if (!navigationRef.isReady()) return;
      (navigationRef as any).navigate(
        'PomodoroQuiz',
        payload ? { breakPayload: payload } : undefined,
      );
    },
  });

  const handleSaveUploadedAudio = useCallback(async () => {
    if (!uploadReview) return;
    if (uploadSubjectRequired && !selectedUploadSubjectName) {
      void showInfo('Subject required', 'Choose the lecture subject before saving this upload.');
      return;
    }

    setIsSavingUpload(true);
    try {
      const subjectName = selectedUploadSubjectName ?? uploadReview.subject;
      const finalConfidence = uploadConfidence ?? (uploadReview.estimatedConfidence as 1 | 2 | 3);
      const analysisToSave = {
        ...uploadReview,
        subject: subjectName,
        estimatedConfidence: finalConfidence,
      };
      const note = await generateADHDNote(analysisToSave);
      const sub = await getSubjectByName(subjectName);
      await saveLectureTranscript({
        subjectId: sub?.id ?? null,
        subjectName: subjectName,
        note,
        transcript: analysisToSave.transcript,
        summary: analysisToSave.lectureSummary,
        topics: analysisToSave.topics,
        appName: 'Upload',
        confidence: finalConfidence,
        embedding: analysisToSave.embedding,
      });
      refreshProfile();
      setUploadReview(null);
      setUploadConfidence(null);
      setUploadSubjectRequired(false);
      setSelectedUploadSubjectName(null);
      void showSuccess('Success', 'Audio transcribed and added to notes vault.');
    } catch (e: any) {
      void showError(e.message, 'Error');
    } finally {
      setIsSavingUpload(false);
    }
  }, [
    refreshProfile,
    selectedUploadSubjectName,
    uploadConfidence,
    uploadReview,
    uploadSubjectRequired,
  ]);

  function openRoute(tab: keyof TabParamList, screen?: string, params?: object) {
    setIsActionHubOpen(false);
    if (screen) {
      navigation.navigate('Tabs', { screen: tab, params: { screen, params } });
      return;
    }
    navigation.navigate('Tabs', { screen: tab });
  }

  const actionHubExternalApps = EXTERNAL_APPS.slice(0, 6);
  const renderActionHubExternalChip = (app: (typeof EXTERNAL_APPS)[number]) => (
    <Pressable
      key={app.id}
      style={({ pressed }) => [
        styles.externalChip,
        { width: externalChipLayout.chipWidth },
        pressed && styles.actionPressed,
      ]}
      android_ripple={{ color: `${app.color}22` }}
      onPress={() => launchExternalAction(app.id as SupportedMedicalApp)}
      testID={`action-hub-external-${app.id}`}
      accessibilityRole="button"
      accessibilityLabel={`Open ${app.name}`}
    >
      <View
        style={[
          styles.externalIconCircle,
          { backgroundColor: `${app.color}1E`, borderColor: `${app.color}4A` },
        ]}
      >
        <Ionicons
          name={EXTERNAL_APP_ICON_MAP[app.id] ?? 'apps-outline'}
          size={22}
          color={app.color}
        />
      </View>
      <LinearText
        variant="meta"
        style={styles.externalChipLabel}
        numberOfLines={2}
        ellipsizeMode="tail"
        centered
      >
        {app.name}
      </LinearText>
    </Pressable>
  );

  return (
    <View style={styles.flex}>
      <Tab.Navigator
        tabBarPosition="bottom"
        tabBar={(props) => (
          <CustomTabBar
            tabBarProps={props}
            dueCount={dueCount}
            isActionHubOpen={isActionHubOpen}
            onToggleActionHub={() => setIsActionHubOpen((v) => !v)}
            onCloseActionHub={() => setIsActionHubOpen(false)}
            bottomInset={bottomInset}
          />
        )}
        screenOptions={{
          lazy: true,
          lazyPreloadDistance: 1,
          animationEnabled: false, // Disables slide on tap (jumps instantly, cleanly)
          swipeEnabled: true, // Re-enables native swipe gestures
        }}
        style={{ backgroundColor: n.colors.background }}
      >
        <Tab.Screen name="HomeTab" component={HomeStackNav} />
        <Tab.Screen name="SyllabusTab" component={SyllabusStackNav} />
        <Tab.Screen name="ChatTab" component={ChatStackNav} />
        <Tab.Screen
          name="MenuTab"
          component={MenuStackNav}
          options={({ route }) => {
            const routeName = getFocusedRouteNameFromRoute(route) ?? 'MenuHome';
            return { swipeEnabled: routeName !== 'MindMap' };
          }}
        />
      </Tab.Navigator>

      <View style={styles.sheetRoot} pointerEvents="box-none">
        <Animated.View
          style={[styles.sheetBackdrop, { opacity: sheetAnim }]}
          pointerEvents={isActionHubOpen ? 'auto' : 'none'}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setIsActionHubOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close action hub"
          />
        </Animated.View>
        <Animated.View
          {...sheetPanResponder.panHandlers}
          pointerEvents={isActionHubOpen ? 'auto' : 'none'}
          style={[
            styles.sheet,
            {
              paddingBottom: bottomInset + n.spacing.lg,
              bottom: TAB_BAR_HEIGHT + 8,
              maxHeight: windowHeight * 0.65,
              ...(actionHubNarrow ? { paddingHorizontal: n.spacing.xl } : {}),
            },
            {
              opacity: sheetAnim.interpolate({
                inputRange: [0, 0.4, 1],
                outputRange: [0, 0.9, 1],
              }),
              transform: [
                {
                  // Drag-down offset drives toward button on dismiss
                  translateY: sheetDragY.interpolate({
                    inputRange: [0, 300],
                    outputRange: [0, 120],
                    extrapolate: 'clamp',
                  }),
                },
                {
                  // Scale from the button: starts small, springs to full
                  scale: Animated.multiply(
                    sheetAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.3, 1],
                    }),
                    sheetDragY.interpolate({
                      inputRange: [0, 300],
                      outputRange: [1, 0.6],
                      extrapolate: 'clamp',
                    }),
                  ),
                },
              ],
            },
          ]}
        >
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.015)', 'rgba(255,255,255,0.0)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.sheetGlassLayer}
          />
          <View pointerEvents="none" style={styles.sheetFrostLayer} />
          <View style={styles.sheetHandleHitbox}>
            <View style={styles.sheetHandle} />
          </View>
          <View style={[styles.sheetContent, actionHubNarrow && styles.sheetContentNarrow]}>
            <LinearText
              variant="meta"
              style={[styles.sheetEyebrow, actionHubNarrow && styles.sheetEyebrowNarrow]}
            >
              ACTION HUB
            </LinearText>
            <View style={styles.topActionRow}>
              <Pressable
                style={({ pressed }) => [styles.topActionTile, pressed && styles.actionPressed]}
                android_ripple={{ color: '#ffffff18' }}
                onPress={() => openRoute('HomeTab', 'LectureMode', {})}
                testID="action-hub-record-lecture"
                accessibilityRole="button"
                accessibilityLabel="Record lecture"
              >
                <Ionicons name="mic-outline" size={18} color={n.colors.textPrimary} />
                <LinearText variant="body" style={styles.topActionTitle}>
                  Record Lecture
                </LinearText>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.topActionTile, pressed && styles.actionPressed]}
                android_ripple={{ color: '#ffffff18' }}
                onPress={() => openRoute('HomeTab', 'GlobalTopicSearch')}
                testID="action-hub-search-topics"
                accessibilityRole="button"
                accessibilityLabel="Search any topic"
              >
                <Ionicons name="search-outline" size={18} color={n.colors.textPrimary} />
                <LinearText variant="body" style={styles.topActionTitle}>
                  Search Topics
                </LinearText>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.topActionTile, pressed && styles.actionPressed]}
                android_ripple={{ color: '#ffffff18' }}
                onPress={() => openRoute('MenuTab', 'NotesVault')}
                testID="action-hub-notes-vault"
                accessibilityRole="button"
                accessibilityLabel="Open notes vault"
              >
                <Ionicons name="library-outline" size={18} color={n.colors.textPrimary} />
                <LinearText variant="body" style={styles.topActionTitle}>
                  Notes Vault
                </LinearText>
              </Pressable>
            </View>

            <View style={styles.manualActionsContainer}>
              <Pressable
                style={({ pressed }) => [styles.topActionTile, pressed && styles.actionPressed]}
                onPress={() => openRoute('HomeTab', 'DailyChallenge')}
                testID="action-hub-daily-challenge"
                accessibilityRole="button"
                accessibilityLabel="Open daily challenge"
              >
                <Ionicons name="flash-outline" size={15} color={n.colors.textSecondary} />
                <LinearText variant="bodySmall" style={styles.manualActionText}>
                  Daily Challenge
                </LinearText>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.topActionTile, pressed && styles.actionPressed]}
                onPress={() => openRoute('HomeTab', 'BossBattle')}
                testID="action-hub-boss-battle"
                accessibilityRole="button"
                accessibilityLabel="Open boss battle"
              >
                <Ionicons name="shield-half-outline" size={15} color={n.colors.textSecondary} />
                <LinearText variant="bodySmall" style={styles.manualActionText}>
                  Boss Battle
                </LinearText>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.topActionTile, pressed && styles.actionPressed]}
                onPress={() => openRoute('MenuTab', 'RecordingVault')}
                testID="action-hub-recording-vault"
                accessibilityRole="button"
                accessibilityLabel="Open recording vault"
              >
                <Ionicons name="mic-outline" size={15} color={n.colors.textSecondary} />
                <LinearText variant="bodySmall" style={styles.manualActionText}>
                  Upload Audio
                </LinearText>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.topActionTile, pressed && styles.actionPressed]}
                onPress={() => openRoute('MenuTab', 'TranscriptVault')}
                testID="action-hub-transcript-vault"
                accessibilityRole="button"
                accessibilityLabel="Open transcript vault"
              >
                <Ionicons name="clipboard-outline" size={15} color={n.colors.textSecondary} />
                <LinearText variant="bodySmall" style={styles.manualActionText}>
                  Transcript Tools
                </LinearText>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.topActionTile, pressed && styles.actionPressed]}
                onPress={() => navigation.navigate('BrainDumpReview' as never)}
                testID="action-hub-parked-thoughts"
                accessibilityRole="button"
                accessibilityLabel="Review parked thoughts"
              >
                <Ionicons name="bulb-outline" size={15} color={n.colors.textSecondary} />
                <LinearText variant="bodySmall" style={styles.manualActionText}>
                  Parked thoughts
                </LinearText>
              </Pressable>
            </View>

            <View
              style={[
                styles.externalHeader,
                (actionHubNarrow || externalAppsTwoRowLayout) && styles.externalHeaderNarrow,
              ]}
            >
              <LinearText
                variant="meta"
                style={[
                  styles.externalTitle,
                  externalAppsTwoRowLayout && styles.externalTitleCentered,
                ]}
              >
                Launch External App
              </LinearText>
            </View>
            {externalAppsTwoRowLayout ? (
              <View style={styles.externalRowsPhone}>
                <View style={styles.externalRowCentered}>
                  {actionHubExternalApps.slice(0, 3).map(renderActionHubExternalChip)}
                </View>
                <View style={styles.externalRowCentered}>
                  {actionHubExternalApps.slice(3, 6).map(renderActionHubExternalChip)}
                </View>
              </View>
            ) : (
              <View style={styles.externalGrid}>{actionHubExternalApps.map(renderActionHubExternalChip)}</View>
            )}
          </View>
        </Animated.View>
      </View>

      {returnSheet ? (
        <LectureReturnSheet
          visible
          appName={returnSheet.appName}
          durationMinutes={returnSheet.durationMinutes}
          recordingPath={returnSheet.recordingPath}
          logId={returnSheet.logId}
          groqKey={groqKey}
          bottomOffset={66 + bottomInset + 12}
          onDone={() => setReturnSheet(null)}
          onCreateMindMap={(topicName) => {
            setReturnSheet(null);
            navigation.navigate('MenuTab', { screen: 'MindMap', params: { topicName } });
          }}
        />
      ) : null}

      <Modal
        visible={!!uploadReview}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setUploadReview(null);
          setUploadConfidence(null);
          setUploadSubjectRequired(false);
          setSelectedUploadSubjectName(null);
        }}
      >
        <View style={styles.uploadModalOverlay}>
          <LinearSurface padded={false} style={styles.uploadModalSheet}>
            <View style={styles.uploadModalContent}>
              <LinearText variant="title" style={styles.uploadModalTitle}>
                Lecture Transcribed
              </LinearText>
              {uploadReview ? (
                <>
                  {uploadSubjectRequired ? (
                    <SubjectSelectionCard
                      detectedSubjectName={uploadReview.subject}
                      selectedSubjectName={selectedUploadSubjectName}
                      onSelectSubject={setSelectedUploadSubjectName}
                    />
                  ) : (
                    <SubjectChip subject={selectedUploadSubjectName ?? uploadReview.subject} />
                  )}
                  <LinearText
                    variant="bodySmall"
                    style={styles.uploadModalSummary}
                    numberOfLines={4}
                  >
                    {uploadReview.lectureSummary}
                  </LinearText>
                  {uploadReview.topics.length > 0 ? (
                    <>
                      <LinearText variant="meta" style={styles.uploadModalLabel}>
                        TOPICS DETECTED
                      </LinearText>
                      <TopicPillRow topics={uploadReview.topics} />
                      <LinearText variant="meta" style={styles.uploadModalLabel}>
                        YOUR CONFIDENCE LEVEL
                      </LinearText>
                      <ConfidenceSelector
                        value={uploadConfidence ?? (uploadReview.estimatedConfidence as 1 | 2 | 3)}
                        onChange={setUploadConfidence}
                      />
                    </>
                  ) : null}
                </>
              ) : null}

              <Pressable
                style={({ pressed }) => [
                  styles.uploadSaveBtn,
                  pressed && styles.actionPressed,
                  (isSavingUpload ||
                    !uploadReview?.topics.length ||
                    (uploadSubjectRequired && !selectedUploadSubjectName)) &&
                    styles.uploadSaveBtnDisabled,
                ]}
                onPress={handleSaveUploadedAudio}
                disabled={
                  isSavingUpload ||
                  !uploadReview?.topics.length ||
                  (uploadSubjectRequired && !selectedUploadSubjectName)
                }
                accessibilityRole="button"
                accessibilityLabel="Save uploaded audio"
              >
                <LinearText variant="label" tone="inverse" style={styles.uploadSaveBtnText}>
                  {isSavingUpload ? 'Saving...' : 'Save to Notes Vault'}
                </LinearText>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.uploadDismissBtn, pressed && styles.actionPressed]}
                onPress={() => {
                  setUploadReview(null);
                  setUploadConfidence(null);
                  setUploadSubjectRequired(false);
                  setSelectedUploadSubjectName(null);
                }}
                accessibilityRole="button"
                accessibilityLabel="Discard uploaded audio result"
              >
                <LinearText variant="label" tone="secondary" style={styles.uploadDismissBtnText}>
                  Discard
                </LinearText>
              </Pressable>
            </View>
          </LinearSurface>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: n.colors.background,
  },
  sheetRoot: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 4, 8, 0.58)',
  },
  uploadModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.76)',
    padding: 16,
  },
  uploadModalSheet: {
    borderColor: n.colors.borderHighlight,
  },
  uploadModalContent: {
    padding: 20,
    gap: 14,
  },
  uploadModalTitle: {
    color: n.colors.textPrimary,
  },
  uploadModalSummary: {
    color: n.colors.textSecondary,
    lineHeight: 20,
  },
  uploadModalLabel: {
    color: n.colors.textMuted,
    letterSpacing: 0.8,
  },
  uploadSaveBtn: {
    backgroundColor: n.colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: `${n.colors.accent}88`,
  },
  uploadSaveBtnDisabled: {
    opacity: 0.5,
  },
  uploadSaveBtnText: {
    color: n.colors.textInverse,
  },
  uploadDismissBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  uploadDismissBtnText: {
    color: n.colors.textSecondary,
  },
  sheet: {
    position: 'absolute',
    backgroundColor: n.colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: n.colors.borderHighlight,
    paddingHorizontal: n.spacing.lg,
    paddingTop: n.spacing.sm,
    width: '94%',
    maxWidth: 680,
    alignSelf: 'center',
    overflow: 'hidden',
  },
  sheetGlassLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetFrostLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: n.colors.surfaceInset,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: n.colors.borderHighlight,
  },
  sheetHandleHitbox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
    paddingBottom: 8,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 999,
    backgroundColor: n.colors.textMuted,
    opacity: 0.45,
  },
  sheetContent: {
    gap: 10,
    paddingBottom: 12,
  },
  sheetContentNarrow: {
    width: '100%',
    alignSelf: 'stretch',
    alignItems: 'stretch',
  },
  sheetEyebrow: {
    ...n.typography.meta,
    color: n.colors.textSecondary,
    fontSize: 10,
    letterSpacing: 1.6,
  },
  sheetEyebrowNarrow: {
    alignSelf: 'stretch',
    textAlign: 'left',
  },
  topActionRow: {
    flexDirection: 'column',
    gap: 0,
  },
  topActionTile: {
    width: '100%',
    minHeight: 38,
    backgroundColor: 'transparent',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: n.colors.border,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  topActionTitle: {
    ...n.typography.body,
    color: n.colors.textPrimary,
    fontSize: 14,
    textAlign: 'left',
  },
  manualActionsContainer: {
    flexDirection: 'column',
    gap: 0,
  },
  manualActionText: {
    ...n.typography.bodySmall,
    color: n.colors.textSecondary,
    fontSize: 13,
    textAlign: 'left',
  },
  primaryAction: {
    backgroundColor: n.colors.surfaceHover,
    borderRadius: n.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.accent,
    padding: n.spacing.lg,
    gap: n.spacing.sm,
  },
  secondaryAction: {
    backgroundColor: n.colors.surfaceHover,
    borderRadius: n.radius.lg,
    padding: n.spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.borderHighlight,
    gap: n.spacing.sm,
  },
  actionPressed: {
    opacity: n.alpha.pressed,
    transform: [{ scale: 0.98 }],
  },
  primaryActionTitle: {
    ...n.typography.sectionTitle,
    color: n.colors.textPrimary,
  },
  primaryActionSubtitle: {
    ...n.typography.bodySmall,
    color: n.colors.accent,
  },
  secondaryActionTitle: {
    ...n.typography.sectionTitle,
    color: n.colors.textPrimary,
  },
  secondaryActionSubtitle: {
    ...n.typography.bodySmall,
    color: n.colors.textSecondary,
  },
  externalHeader: {
    gap: 2,
  },
  externalHeaderNarrow: {
    alignSelf: 'stretch',
  },
  externalTitle: {
    ...n.typography.meta,
    color: n.colors.textSecondary,
    fontSize: 10,
    letterSpacing: 1.6,
  },
  externalTitleCentered: {
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  externalRowsPhone: {
    width: '100%',
    gap: 12,
  },
  externalRowCentered: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 12,
    width: '100%',
  },
  externalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    gap: 12,
  },
  externalChip: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 0,
  },
  externalIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.borderHighlight,
    backgroundColor: n.colors.surfaceHover,
    alignItems: 'center',
    justifyContent: 'center',
  },
  externalChipLabel: {
    ...n.typography.meta,
    color: n.colors.textSecondary,
    textAlign: 'center',
    width: '100%',
    fontSize: 11,
    lineHeight: 14,
  },
});
