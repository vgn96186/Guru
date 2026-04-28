import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type {
  ChatStackParamList,
  HomeStackParamList,
  MenuStackParamList,
  SyllabusStackParamList,
} from './types';
import { linearTheme as n } from '../theme/linearTheme';
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
import FlaggedContentScreen from '../screens/FlaggedContentScreen';
import TranscriptHistoryScreen from '../screens/TranscriptHistoryScreen';
import QuestionBankScreen from '../screens/QuestionBankScreen';
import MenuScreen from '../screens/MenuScreen';
import GlobalTopicSearchScreen from '../screens/GlobalTopicSearchScreen';
import DeviceLinkScreen from '../screens/DeviceLinkScreen';
import ManualNoteCreationScreen from '../screens/ManualNoteCreationScreen';
import RecordingVaultScreen from '../screens/RecordingVaultScreen';
import ImageVaultScreen from '../screens/ImageVaultScreen';
import NotesVaultScreen from '../screens/vaults/notes/NotesVaultScreen';
import TranscriptVaultScreen from '../screens/TranscriptVaultScreen';
import PdfViewerScreen from '../screens/PdfViewerScreen';

const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const SyllabusStack = createNativeStackNavigator<SyllabusStackParamList>();
const ChatStack = createNativeStackNavigator<ChatStackParamList>();
const MenuStack = createNativeStackNavigator<MenuStackParamList>();

const stackScreenOptions = {
  headerShown: false,
  freezeOnBlur: true,
  animation: 'slide_from_right' as const,
  contentStyle: { backgroundColor: n.colors.background },
  statusBarStyle: 'light' as const,
  gestureEnabled: true,
};

export function HomeStackNav() {
  return (
    <HomeStack.Navigator screenOptions={stackScreenOptions}>
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

export function SyllabusStackNav() {
  return (
    <SyllabusStack.Navigator screenOptions={stackScreenOptions}>
      <SyllabusStack.Screen
        name="Syllabus"
        component={SyllabusScreen}
        options={{ animation: 'none' }}
      />
      <SyllabusStack.Screen
        name="TopicDetail"
        component={TopicDetailScreen}
        options={{ animation: 'none' }}
      />
    </SyllabusStack.Navigator>
  );
}

export function ChatStackNav() {
  return (
    <ChatStack.Navigator initialRouteName="GuruChat" screenOptions={stackScreenOptions}>
      <ChatStack.Screen name="GuruChat" component={GuruChatScreen} />
    </ChatStack.Navigator>
  );
}

export function MenuStackNav() {
  return (
    <MenuStack.Navigator initialRouteName="MenuHome" screenOptions={stackScreenOptions}>
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
      <MenuStack.Screen name="PdfViewer" component={PdfViewerScreen} />
      <MenuStack.Screen name="QuestionBank" component={QuestionBankScreen} />
      <MenuStack.Screen name="FlaggedContent" component={FlaggedContentScreen} />
      <MenuStack.Screen name="RecordingVault" component={RecordingVaultScreen} />
      <MenuStack.Screen name="ImageVault" component={ImageVaultScreen} />
      <MenuStack.Screen name="NotesVault" component={NotesVaultScreen} />
      <MenuStack.Screen name="TranscriptVault" component={TranscriptVaultScreen} />
    </MenuStack.Navigator>
  );
}
