import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  BackHandler,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  useNavigation,
  useFocusEffect,
  getFocusedRouteNameFromRoute,
} from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  ChatStackParamList,
  HomeStackParamList,
  MenuStackParamList,
  PomodoroBreakPayload,
  SyllabusStackParamList,
  TabParamList,
} from './types';
import HomeScreen from '../screens/HomeScreen';
import SessionScreen from '../screens/SessionScreen';
import LectureModeScreen from '../screens/LectureModeScreen';
import GuruChatScreen from '../screens/GuruChatScreen';
import MockTestScreen from '../screens/MockTestScreen';
import SyllabusScreen from '../screens/SyllabusScreen';
import TopicDetailScreen from '../screens/TopicDetailScreen';
import StatsScreen from '../screens/StatsScreen';
import FlashcardsScreen from '../screens/FlashcardsScreen';
import MindMapScreen from '../screens/MindMapScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ReviewScreen from '../screens/ReviewScreen';
import NotesHubScreen from '../screens/NotesHubScreen';
import NotesSearchScreen from '../screens/NotesSearchScreen';
import BossBattleScreen from '../screens/BossBattleScreen';
import InertiaScreen from '../screens/InertiaScreen';
import ManualLogScreen from '../screens/ManualLogScreen';
import StudyPlanScreen from '../screens/StudyPlanScreen';
import DailyChallengeScreen from '../screens/DailyChallengeScreen';
import FlaggedReviewScreen from '../screens/FlaggedReviewScreen';
import TranscriptHistoryScreen from '../screens/TranscriptHistoryScreen';
import QuestionBankScreen from '../screens/QuestionBankScreen';
import MenuScreen from '../screens/MenuScreen';
import GlobalTopicSearchScreen from '../screens/GlobalTopicSearchScreen';
import DeviceLinkScreen from '../screens/DeviceLinkScreen';
import ManualNoteCreationScreen from '../screens/ManualNoteCreationScreen';
import RecordingVaultScreen from '../screens/RecordingVaultScreen';
import ImageVaultScreen from '../screens/ImageVaultScreen';
import NotesVaultScreen from '../screens/NotesVaultScreen';
import TranscriptVaultScreen from '../screens/TranscriptVaultScreen';
import LectureReturnSheet from '../components/LectureReturnSheet';
import { EXTERNAL_APPS } from '../constants/externalApps';
import { theme } from '../constants/theme';
import { linearTheme as n } from '../theme/linearTheme';
import { launchMedicalApp, type SupportedMedicalApp } from '../services/appLauncher';
import { useAppStore } from '../store/useAppStore';
import { BUNDLED_GROQ_KEY, BUNDLED_HF_TOKEN } from '../config/appConfig';
import * as DocumentPicker from 'expo-document-picker';
import {
  transcribeAudio,
  generateADHDNote,
  isMeaningfulLectureAnalysis,
  type LectureAnalysis,
} from '../services/transcriptionService';
import { resolveLectureSubjectRequirement } from '../services/lecture/lectureSubjectRequirement';
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
import { navigationRef } from './navigationRef';
import type { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';

const Tab = createMaterialTopTabNavigator<TabParamList>();

const TAB_ITEMS: Array<{
  name: keyof TabParamList;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconFocused: keyof typeof Ionicons.glyphMap;
  testID: string;
}> = [
  { name: 'HomeTab', label: 'Home', icon: 'home-outline', iconFocused: 'home', testID: 'tab-home' },
  {
    name: 'SyllabusTab',
    label: 'Syllabus',
    icon: 'grid-outline',
    iconFocused: 'grid',
    testID: 'tab-syllabus',
  },
  {
    name: 'ChatTab',
    label: 'Chat',
    icon: 'chatbubbles-outline',
    iconFocused: 'chatbubbles',
    testID: 'tab-chat',
  },
  { name: 'MenuTab', label: 'Menu', icon: 'menu-outline', iconFocused: 'menu', testID: 'tab-menu' },
];
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const SyllabusStack = createNativeStackNavigator<SyllabusStackParamList>();
const ChatStack = createNativeStackNavigator<ChatStackParamList>();
const MenuStack = createNativeStackNavigator<MenuStackParamList>();

function HomeStackNav() {
  return (
    <HomeStack.Navigator
      screenOptions={{
        headerShown: false,
        freezeOnBlur: true,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: n.colors.background },
      }}
    >
      <HomeStack.Screen name="Home" component={HomeScreen} />
      <HomeStack.Screen name="Session" component={SessionScreen} />
      <HomeStack.Screen name="LectureMode" component={LectureModeScreen} />
      <HomeStack.Screen name="MockTest" component={MockTestScreen} />
      <HomeStack.Screen name="Review" component={ReviewScreen} />
      <HomeStack.Screen name="BossBattle" component={BossBattleScreen} />
      <HomeStack.Screen name="Inertia" component={InertiaScreen} />
      <HomeStack.Screen name="ManualLog" component={ManualLogScreen} />
      <HomeStack.Screen name="DailyChallenge" component={DailyChallengeScreen} />
      <HomeStack.Screen name="FlaggedReview" component={FlaggedReviewScreen} />
      <HomeStack.Screen name="GlobalTopicSearch" component={GlobalTopicSearchScreen} />
    </HomeStack.Navigator>
  );
}

function SyllabusStackNav() {
  return (
    <SyllabusStack.Navigator
      screenOptions={{
        headerShown: false,
        freezeOnBlur: true,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: n.colors.background },
      }}
    >
      <SyllabusStack.Screen name="Syllabus" component={SyllabusScreen} />
      <SyllabusStack.Screen
        name="TopicDetail"
        component={TopicDetailScreen}
        options={{ animation: 'none' }}
      />
    </SyllabusStack.Navigator>
  );
}

function ChatStackNav() {
  return (
    <ChatStack.Navigator
      initialRouteName="GuruChat"
      screenOptions={{
        headerShown: false,
        freezeOnBlur: true,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: n.colors.background },
      }}
    >
      <ChatStack.Screen name="GuruChat" component={GuruChatScreen} />
    </ChatStack.Navigator>
  );
}

function MenuStackNav() {
  return (
    <MenuStack.Navigator
      initialRouteName="MenuHome"
      screenOptions={{
        headerShown: false,
        freezeOnBlur: true,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: n.colors.background },
      }}
    >
      <MenuStack.Screen name="MenuHome" component={MenuScreen} />
      <MenuStack.Screen name="StudyPlan" component={StudyPlanScreen} />
      <MenuStack.Screen name="Stats" component={StatsScreen} />
      <MenuStack.Screen name="Flashcards" component={FlashcardsScreen} />
      <MenuStack.Screen name="MindMap" component={MindMapScreen} />
      <MenuStack.Screen name="Settings" component={SettingsScreen} />
      <MenuStack.Screen name="DeviceLink" component={DeviceLinkScreen} />
      <MenuStack.Screen name="NotesHub" component={NotesHubScreen} />
      <MenuStack.Screen name="NotesSearch" component={NotesSearchScreen} />
      <MenuStack.Screen name="ManualNoteCreation" component={ManualNoteCreationScreen} />
      <MenuStack.Screen name="TranscriptHistory" component={TranscriptHistoryScreen} />
      <MenuStack.Screen name="QuestionBank" component={QuestionBankScreen} />
      <MenuStack.Screen name="RecordingVault" component={RecordingVaultScreen} />
      <MenuStack.Screen name="ImageVault" component={ImageVaultScreen} />
      <MenuStack.Screen name="NotesVault" component={NotesVaultScreen} />
      <MenuStack.Screen name="TranscriptVault" component={TranscriptVaultScreen} />
    </MenuStack.Navigator>
  );
}

/**
 * Custom tab bar that replicates the bottom-tabs design + center FAB.
 * Driven by material-top-tabs state for native ViewPager transitions.
 */
function CustomTabBar({
  tabBarProps,
  dueCount,
  isActionHubOpen,
  onToggleActionHub,
  bottomInset,
}: {
  tabBarProps: MaterialTopTabBarProps;
  dueCount: number;
  isActionHubOpen: boolean;
  onToggleActionHub: () => void;
  bottomInset: number;
}) {
  const { state, navigation } = tabBarProps;

  // Insert FAB at position 2 (between Syllabus and Chat)
  const leftTabs = TAB_ITEMS.slice(0, 2);
  const rightTabs = TAB_ITEMS.slice(2);

  const handleTabPress = (tabName: keyof TabParamList, isFocused: boolean) => {
    if (isFocused) {
      if (tabName === 'HomeTab') navigation.navigate('HomeTab', { screen: 'Home' });
      else if (tabName === 'SyllabusTab')
        navigation.navigate('SyllabusTab', { screen: 'Syllabus' });
      else if (tabName === 'ChatTab') navigation.navigate('ChatTab', { screen: 'GuruChat' });
      else if (tabName === 'MenuTab') navigation.navigate('MenuTab', { screen: 'MenuHome' });
    } else {
      navigation.navigate(tabName);
    }
  };

  return (
    <View
      style={[
        styles.customTabBar,
        {
          paddingBottom: bottomInset + 4,
          height: 60 + bottomInset,
        },
      ]}
    >
      {leftTabs.map((tab, i) => {
        const focused = state.index === i;
        const color = focused ? n.colors.textPrimary : n.colors.textMuted;
        return (
          <Pressable
            key={tab.name}
            style={styles.tabItem}
            onPress={() => navigation.navigate(tab.name)}
            testID={tab.testID}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={`${tab.label} tab`}
          >
            <View>
              <Ionicons name={focused ? tab.iconFocused : tab.icon} size={24} color={color} />
              {tab.name === 'SyllabusTab' && dueCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{dueCount > 99 ? '99+' : dueCount}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.tabLabel, { color }]}>{tab.label}</Text>
          </Pressable>
        );
      })}

      {/* Center FAB */}
      <Pressable
        style={({ pressed }) => [styles.fabSlot, pressed && styles.actionPressed]}
        onPress={onToggleActionHub}
        testID="action-hub-toggle"
        accessibilityRole="button"
        accessibilityLabel="Open action hub"
        accessibilityHint="Opens the quick actions sheet"
      >
        <View style={styles.fabButton}>
          <Ionicons
            name={isActionHubOpen ? 'close' : 'add'}
            size={26}
            color={n.colors.textPrimary}
          />
        </View>
        <Text style={styles.fabLabel}>Actions</Text>
      </Pressable>

      {rightTabs.map((tab, i) => {
        const tabIndex = i + 2; // offset past leftTabs
        const focused = state.index === tabIndex;
        const color = focused ? n.colors.textPrimary : n.colors.textMuted;
        return (
          <Pressable
            key={tab.name}
            style={styles.tabItem}
            onPress={() => handleTabPress(tab.name, focused)}
            testID={tab.testID}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={`${tab.label} tab`}
          >
            <Ionicons name={focused ? tab.iconFocused : tab.icon} size={24} color={color} />
            <Text style={[styles.tabLabel, { color }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

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
  }, [isActionHubOpen]);

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
      Alert.alert(
        'Could not open app',
        error?.message ?? 'Please ensure the lecture app is installed.',
      );
    }
  }

  const [isTranscribingUpload, setIsTranscribingUpload] = useState(false);
  const [uploadProgressMsg, setUploadProgressMsg] = useState<string>('');
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

  const handleAudioUpload = async () => {
    setIsActionHubOpen(false);
    let res: DocumentPicker.DocumentPickerResult;
    try {
      res = await DocumentPicker.getDocumentAsync({ type: ['audio/*'] });
    } catch (error: any) {
      Alert.alert('Error', error?.message ?? 'Could not open the audio picker.');
      return;
    }
    if (res.canceled || !res.assets[0]) return;
    setIsTranscribingUpload(true);
    setUploadProgressMsg('Uploading...');
    try {
      const analysis = await transcribeAudio({
        audioFilePath: res.assets[0].uri,
        onProgress: (p) => setUploadProgressMsg(p.message),
      });
      if (!isMeaningfulLectureAnalysis(analysis)) {
        throw new Error('No usable lecture content was detected in this recording.');
      }
      const resolution = await resolveLectureSubjectRequirement(analysis.subject);
      setUploadReview(analysis);
      setUploadConfidence(analysis.estimatedConfidence as 1 | 2 | 3);
      setUploadSubjectRequired(resolution.requiresSelection);
      setSelectedUploadSubjectName(
        resolution.requiresSelection
          ? null
          : (resolution.matchedSubject?.name ?? resolution.normalizedSubjectName),
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setIsTranscribingUpload(false);
      setUploadProgressMsg('');
    }
  };

  const handleSaveUploadedAudio = useCallback(async () => {
    if (!uploadReview) return;
    if (uploadSubjectRequired && !selectedUploadSubjectName) {
      Alert.alert('Subject required', 'Choose the lecture subject before saving this upload.');
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
      Alert.alert('Success', 'Audio transcribed and added to notes vault.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
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
          style={[
            styles.sheet,
            {
              paddingBottom: bottomInset + theme.spacing.lg,
              bottom: TAB_BAR_HEIGHT + 8,
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
          <View style={styles.sheetContent}>
            <Text style={styles.sheetEyebrow}>ACTION HUB</Text>
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
                <Text style={styles.topActionTitle}>Record Lecture</Text>
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
                <Text style={styles.topActionTitle}>Search Topics</Text>
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
                <Text style={styles.topActionTitle}>Notes Vault</Text>
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
                <Text style={styles.manualActionText}>Daily Challenge</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.topActionTile, pressed && styles.actionPressed]}
                onPress={() => openRoute('HomeTab', 'BossBattle')}
                testID="action-hub-boss-battle"
                accessibilityRole="button"
                accessibilityLabel="Open boss battle"
              >
                <Ionicons name="shield-half-outline" size={15} color={n.colors.textSecondary} />
                <Text style={styles.manualActionText}>Boss Battle</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.topActionTile, pressed && styles.actionPressed]}
                onPress={() => openRoute('MenuTab', 'RecordingVault')}
                testID="action-hub-recording-vault"
                accessibilityRole="button"
                accessibilityLabel="Open recording vault"
              >
                <Ionicons name="mic-outline" size={15} color={n.colors.textSecondary} />
                <Text style={styles.manualActionText}>Upload Audio</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.topActionTile, pressed && styles.actionPressed]}
                onPress={() => openRoute('MenuTab', 'TranscriptVault')}
                testID="action-hub-transcript-vault"
                accessibilityRole="button"
                accessibilityLabel="Open transcript vault"
              >
                <Ionicons name="clipboard-outline" size={15} color={n.colors.textSecondary} />
                <Text style={styles.manualActionText}>Transcript Tools</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.topActionTile, pressed && styles.actionPressed]}
                onPress={() => navigation.navigate('BrainDumpReview' as never)}
                testID="action-hub-parked-thoughts"
                accessibilityRole="button"
                accessibilityLabel="Review parked thoughts"
              >
                <Ionicons name="bulb-outline" size={15} color={n.colors.textSecondary} />
                <Text style={styles.manualActionText}>Parked thoughts</Text>
              </Pressable>
            </View>

            <View style={styles.externalHeader}>
              <Text style={styles.externalTitle}>Launch External App</Text>
            </View>
            <View style={styles.externalGrid}>
              {EXTERNAL_APPS.slice(0, 6).map((app) => (
                <Pressable
                  key={app.id}
                  style={({ pressed }) => [styles.externalChip, pressed && styles.actionPressed]}
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
                  <Text style={styles.externalChipLabel} numberOfLines={1} ellipsizeMode="tail">
                    {app.name}
                  </Text>
                </Pressable>
              ))}
            </View>
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
          <View style={styles.uploadModalSheet}>
            <Text style={styles.uploadModalTitle}>Lecture Transcribed</Text>
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
                <Text style={styles.uploadModalSummary} numberOfLines={4}>
                  {uploadReview.lectureSummary}
                </Text>
                {uploadReview.topics.length > 0 ? (
                  <>
                    <Text style={styles.uploadModalLabel}>TOPICS DETECTED</Text>
                    <TopicPillRow topics={uploadReview.topics} />
                    <Text style={styles.uploadModalLabel}>YOUR CONFIDENCE LEVEL</Text>
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
              <Text style={styles.uploadSaveBtnText}>
                {isSavingUpload ? 'Saving...' : 'Save to Notes Vault'}
              </Text>
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
              <Text style={styles.uploadDismissBtnText}>Discard</Text>
            </Pressable>
          </View>
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
  fabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: n.colors.surfaceHover,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.borderHighlight,
  },
  fabLabel: {
    ...n.typography.meta,
    color: n.colors.textSecondary,
    fontSize: 10,
    marginTop: 4,
    letterSpacing: 0,
  },
  customTabBar: {
    flexDirection: 'row',
    backgroundColor: n.colors.background,
    borderTopColor: n.colors.borderHighlight,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 0,
    elevation: 0,
    alignItems: 'center',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
  },
  tabLabel: {
    ...n.typography.caption,
    fontSize: 10,
    marginTop: 4,
    letterSpacing: 0,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: n.colors.error,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: n.colors.textPrimary,
    fontSize: 10,
    fontWeight: '700',
  },
  sheetRoot: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 4, 8, 0.46)',
  },
  uploadModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: theme.colors.overlay,
    padding: 16,
  },
  uploadModalSheet: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  uploadModalTitle: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  uploadModalSummary: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  uploadModalLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  uploadSaveBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadSaveBtnDisabled: {
    opacity: 0.5,
  },
  uploadSaveBtnText: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  uploadDismissBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  uploadDismissBtnText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  sheet: {
    position: 'absolute',
    backgroundColor: 'rgba(2, 2, 4, 0.97)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: n.spacing.lg,
    paddingTop: n.spacing.sm,
    maxHeight: Dimensions.get('window').height * 0.65,
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
    backgroundColor: 'rgba(255,255,255,0.01)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.10)',
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
  sheetEyebrow: {
    ...n.typography.meta,
    color: n.colors.textSecondary,
    fontSize: 10,
    letterSpacing: 1.6,
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
  externalTitle: {
    ...n.typography.meta,
    color: n.colors.textSecondary,
    fontSize: 10,
    letterSpacing: 1.6,
  },
  externalGrid: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  externalChip: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    width: '16.66%',
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
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0,
  },
});
