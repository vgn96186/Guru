import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  ChatStackParamList,
  HomeStackParamList,
  MenuStackParamList,
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
import MenuScreen from '../screens/MenuScreen';
import GlobalTopicSearchScreen from '../screens/GlobalTopicSearchScreen';
import DeviceLinkScreen from '../screens/DeviceLinkScreen';
import ManualNoteCreationScreen from '../screens/ManualNoteCreationScreen';
import { EXTERNAL_APPS } from '../constants/externalApps';
import { theme } from '../constants/theme';
import { launchMedicalApp, type SupportedMedicalApp } from '../services/appLauncher';
import { useAppStore } from '../store/useAppStore';
import { BUNDLED_GROQ_KEY, BUNDLED_HF_TOKEN } from '../config/appConfig';
import * as DocumentPicker from 'expo-document-picker';
import { transcribeAudio, generateADHDNote } from '../services/transcriptionService';
import { getSubjectByName } from '../db/queries/topics';
import { saveLectureTranscript } from '../db/queries/aiCache';
import { getDb } from '../db/database';

const Tab = createBottomTabNavigator<TabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const SyllabusStack = createNativeStackNavigator<SyllabusStackParamList>();
const ChatStack = createNativeStackNavigator<ChatStackParamList>();
const MenuStack = createNativeStackNavigator<MenuStackParamList>();

function HomeStackNav() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
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
    <SyllabusStack.Navigator screenOptions={{ headerShown: false }}>
      <SyllabusStack.Screen name="Syllabus" component={SyllabusScreen} />
      <SyllabusStack.Screen name="TopicDetail" component={TopicDetailScreen} />
    </SyllabusStack.Navigator>
  );
}

function ChatStackNav() {
  return (
    <ChatStack.Navigator initialRouteName="GuruChat" screenOptions={{ headerShown: false }}>
      <ChatStack.Screen name="GuruChat" component={GuruChatScreen} />
    </ChatStack.Navigator>
  );
}

function MenuStackNav() {
  return (
    <MenuStack.Navigator initialRouteName="MenuHome" screenOptions={{ headerShown: false }}>
      <MenuStack.Screen name="MenuHome" component={MenuScreen} />
      <MenuStack.Screen name="StudyPlan" component={StudyPlanScreen} />
      <MenuStack.Screen name="Stats" component={StatsScreen} />
      <MenuStack.Screen name="Settings" component={SettingsScreen} />
      <MenuStack.Screen name="DeviceLink" component={DeviceLinkScreen} />
      <MenuStack.Screen name="NotesHub" component={NotesHubScreen} />
      <MenuStack.Screen name="NotesSearch" component={NotesSearchScreen} />
      <MenuStack.Screen name="ManualNoteCreation" component={ManualNoteCreationScreen} />
      <MenuStack.Screen name="TranscriptHistory" component={TranscriptHistoryScreen} />
    </MenuStack.Navigator>
  );
}

function ActionHubPlaceholder() {
  return null;
}

export default function TabNavigator() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { profile, refreshProfile } = useAppStore();
  const faceTrackingEnabled = profile?.faceTrackingEnabled ?? false;
  const groqKey = (profile?.groqApiKey || BUNDLED_GROQ_KEY || '').trim();
  const huggingFaceToken = (profile?.huggingFaceToken || BUNDLED_HF_TOKEN || '').trim();
  const huggingFaceModel = profile?.huggingFaceTranscriptionModel?.trim();
  const localWhisperPath =
    profile?.useLocalWhisper && profile?.localWhisperPath ? profile.localWhisperPath : undefined;
  const [isActionHubOpen, setIsActionHubOpen] = useState(false);
  const sheetAnim = useRef(new Animated.Value(0)).current;
  const bottomInset = Math.max(insets.bottom, 8);
  const [dueCount, setDueCount] = useState(0);

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

  useEffect(() => {
    Animated.spring(sheetAnim, {
      toValue: isActionHubOpen ? 1 : 0,
      tension: 65,
      friction: 11,
      useNativeDriver: true,
    }).start();
  }, [isActionHubOpen]);

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

  const handleAudioUpload = async () => {
    setIsActionHubOpen(false);
    const res = await DocumentPicker.getDocumentAsync({ type: ['audio/*'] });
    if (res.canceled || !res.assets[0]) return;
    setIsTranscribingUpload(true);
    try {
      const analysis = await transcribeAudio({ audioFilePath: res.assets[0].uri });
      const hasTranscript = !!analysis.transcript?.trim();
      const hasMeaningfulSummary =
        !!analysis.lectureSummary &&
        ![
          'No audio recorded (empty file)',
          'No speech detected (silent audio)',
          'No speech detected',
          'Lecture content recorded',
          'No medical content detected',
        ].includes(analysis.lectureSummary);
      if (!hasTranscript || !hasMeaningfulSummary) {
        throw new Error('No usable lecture content was detected in this recording.');
      }
      const note = await generateADHDNote(analysis);
      const sub = await getSubjectByName(analysis.subject);
      await saveLectureTranscript({
        subjectId: sub?.id ?? null,
        subjectName: analysis.subject,
        note,
        transcript: analysis.transcript,
        summary: analysis.lectureSummary,
        topics: analysis.topics,
        appName: 'Upload',
        confidence: analysis.estimatedConfidence,
        embedding: analysis.embedding,
      });
      refreshProfile();
      Alert.alert('Success', 'Audio transcribed and added to notes vault.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setIsTranscribingUpload(false);
    }
  };

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
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarHideOnKeyboard: true,
          tabBarShowLabel: true,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
            marginTop: theme.spacing.xs,
            letterSpacing: 0.3,
          },
          tabBarItemStyle: {
            paddingTop: theme.spacing.sm,
          },
          tabBarStyle: {
            backgroundColor: theme.colors.background,
            borderTopColor: theme.colors.border,
            borderTopWidth: 1,
            paddingBottom: bottomInset,
            height: 70 + bottomInset,
            paddingTop: theme.spacing.sm,
            ...theme.shadows.md,
          },
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.textMuted,
          tabBarIcon: ({ color, size, focused }) => {
            const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
              HomeTab: focused ? 'home' : 'home-outline',
              SyllabusTab: focused ? 'grid' : 'grid-outline',
              ActionHubTab: 'add',
              ChatTab: focused ? 'chatbubbles' : 'chatbubbles-outline',
              MenuTab: focused ? 'menu' : 'menu-outline',
            };
            return <Ionicons name={icons[route.name]} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen
          name="HomeTab"
          component={HomeStackNav}
          options={{
            tabBarLabel: 'Home',
            tabBarButtonTestID: 'tab-home',
            tabBarAccessibilityLabel: 'Home tab',
          }}
        />
        <Tab.Screen
          name="SyllabusTab"
          component={SyllabusStackNav}
          options={{
            tabBarLabel: 'Syllabus',
            tabBarButtonTestID: 'tab-syllabus',
            tabBarAccessibilityLabel: 'Syllabus tab',
            tabBarBadge: dueCount > 0 ? dueCount : undefined,
            tabBarBadgeStyle: { backgroundColor: theme.colors.error, fontSize: 10 },
          }}
        />
        <Tab.Screen
          name="ActionHubTab"
          component={ActionHubPlaceholder}
          options={{
            tabBarLabel: '',
            tabBarAccessibilityLabel: 'Action hub',
            tabBarButton: () => (
              <Pressable
                style={({ pressed }) => [styles.fabSlot, pressed && styles.actionPressed]}
                onPress={() => setIsActionHubOpen((value) => !value)}
                testID="action-hub-toggle"
                accessibilityRole="button"
                accessibilityLabel="Open action hub"
                accessibilityHint="Opens the quick actions sheet"
              >
                <View style={styles.fabButton}>
                  <Ionicons
                    name={isActionHubOpen ? 'close' : 'add'}
                    size={28}
                    color={theme.colors.textPrimary}
                  />
                </View>
                <Text style={styles.fabLabel}>Actions</Text>
              </Pressable>
            ),
          }}
          listeners={{
            tabPress: (event) => {
              event.preventDefault();
              setIsActionHubOpen((value) => !value);
            },
          }}
        />
        <Tab.Screen
          name="ChatTab"
          component={ChatStackNav}
          options={{
            tabBarLabel: 'Chat',
            tabBarButtonTestID: 'tab-chat',
            tabBarAccessibilityLabel: 'Guru chat tab',
          }}
        />
        <Tab.Screen
          name="MenuTab"
          component={MenuStackNav}
          options={{
            tabBarLabel: 'Menu',
            tabBarButtonTestID: 'tab-menu',
            tabBarAccessibilityLabel: 'Menu tab',
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
          style={[
            styles.sheet,
            { paddingBottom: bottomInset + theme.spacing.lg },
            {
              transform: [
                {
                  translateY: sheetAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [800, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sheetEyebrow}>ACTION HUB</Text>
            <Text style={styles.sheetTitle}>Start the next useful thing fast.</Text>
            <View style={styles.primaryActions}>
              <Pressable
                style={({ pressed }) => [styles.primaryAction, pressed && styles.actionPressed]}
                android_ripple={{ color: '#ffffff18' }}
                onPress={() => openRoute('HomeTab', 'LectureMode', {})}
                testID="action-hub-record-lecture"
                accessibilityRole="button"
                accessibilityLabel="Record lecture"
              >
                <Ionicons name="mic-outline" size={22} color={theme.colors.textPrimary} />
                <Text style={styles.primaryActionTitle}>Record Lecture</Text>
                <Text style={styles.primaryActionSubtitle}>
                  Capture long-form audio and route it back safely.
                </Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.secondaryAction, pressed && styles.actionPressed]}
                android_ripple={{ color: '#ffffff18' }}
                onPress={() => openRoute('HomeTab', 'GlobalTopicSearch')}
                testID="action-hub-search-topics"
                accessibilityRole="button"
                accessibilityLabel="Search any topic"
              >
                <Ionicons name="search-outline" size={20} color={theme.colors.info} />
                <Text style={styles.secondaryActionTitle}>Search Topics</Text>
                <Text style={styles.secondaryActionSubtitle}>Find any micro-topic globally.</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.secondaryAction, pressed && styles.actionPressed]}
                android_ripple={{ color: '#ffffff18' }}
                onPress={() => openRoute('MenuTab', 'NotesHub')}
                testID="action-hub-quick-note"
                accessibilityRole="button"
                accessibilityLabel="Quick note, open notes vault"
              >
                <Ionicons name="create-outline" size={20} color={theme.colors.accentAlt} />
                <Text style={styles.secondaryActionTitle}>Quick Note</Text>
                <Text style={styles.secondaryActionSubtitle}>
                  Jump into your notes vault and capture context.
                </Text>
              </Pressable>
            </View>

            <View style={styles.manualActionsContainer}>
              <Pressable
                style={({ pressed }) => [styles.manualAction, pressed && styles.actionPressed]}
                onPress={handleAudioUpload}
                disabled={isTranscribingUpload}
                testID="action-hub-upload-audio"
                accessibilityRole="button"
                accessibilityLabel={isTranscribingUpload ? 'Transcribing' : 'Upload audio'}
              >
                <Ionicons
                  name="document-attach-outline"
                  size={18}
                  color={theme.colors.textSecondary}
                />
                <Text style={styles.manualActionText}>
                  {isTranscribingUpload ? 'Transcribing...' : 'Upload Audio'}
                </Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.manualAction, pressed && styles.actionPressed]}
                onPress={() => openRoute('MenuTab', 'ManualNoteCreation')}
                testID="action-hub-paste-transcript"
                accessibilityRole="button"
                accessibilityLabel="Paste transcript"
              >
                <Ionicons name="clipboard-outline" size={18} color={theme.colors.textSecondary} />
                <Text style={styles.manualActionText}>Paste Transcript</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.manualAction, pressed && styles.actionPressed]}
                onPress={() => navigation.navigate('BrainDumpReview' as never)}
                testID="action-hub-parked-thoughts"
                accessibilityRole="button"
                accessibilityLabel="Review parked thoughts"
              >
                <Ionicons name="bulb-outline" size={18} color={theme.colors.textSecondary} />
                <Text style={styles.manualActionText}>Parked thoughts</Text>
              </Pressable>
            </View>

            <View style={styles.externalHeader}>
              <Text style={styles.externalTitle}>Launch External App</Text>
              <Text style={styles.externalSubtitle}>
                Speaker capture and overlay stay wired into the flow.
              </Text>
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
                  <Text style={styles.externalEmoji}>{app.iconEmoji}</Text>
                  <Text style={styles.externalChipLabel}>{app.name}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  fabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -18,
  },
  fabButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: theme.colors.background,
    ...theme.shadows.glow(theme.colors.primary),
  },
  fabLabel: {
    color: theme.colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: 0.3,
  },
  sheetRoot: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6, 8, 14, 0.72)',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
    height: '85%',
  },
  sheetScroll: {
    flex: 1,
  },
  sheetScrollContent: {
    gap: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
  },
  sheetEyebrow: {
    color: theme.colors.primaryLight,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  sheetTitle: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
  },
  primaryActions: {
    gap: theme.spacing.md,
  },
  manualActionsContainer: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  manualAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 6,
  },
  manualActionText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  primaryAction: {
    backgroundColor: theme.colors.primaryDark,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  secondaryAction: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  actionPressed: {
    opacity: theme.alpha.pressed,
    transform: [{ scale: 0.98 }],
  },
  primaryActionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  primaryActionSubtitle: {
    color: theme.colors.primaryLight,
    fontSize: 13,
    lineHeight: 19,
  },
  secondaryActionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryActionSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  externalHeader: {
    gap: 4,
  },
  externalTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  externalSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
  externalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  externalChip: {
    minWidth: '30%',
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  externalEmoji: {
    fontSize: 22,
    marginBottom: 6,
  },
  externalChipLabel: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});
