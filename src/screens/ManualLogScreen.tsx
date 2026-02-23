import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { getAllSubjects, getTopicsBySubject, updateTopicProgress } from '../db/queries/topics';
import { createSession, endSession } from '../db/queries/sessions';
import { updateStreak } from '../db/queries/progress';
import { useAppStore } from '../store/useAppStore';
import { EXTERNAL_APPS } from '../constants/externalApps';
import type { Subject, TopicWithProgress } from '../types';

type Nav = NativeStackNavigationProp<any, 'ManualLog'>;
type Route = RouteProp<any, 'ManualLog'>;

export default function ManualLogScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const refreshProfile = useAppStore(s => s.refreshProfile);
  const [subjects] = useState<Subject[]>(getAllSubjects);
  
  const [selectedAppId, setSelectedAppId] = useState<string | null>(route.params?.appId ?? null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [subjectTopics, setSubjectTopics] = useState<TopicWithProgress[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
  const [duration, setDuration] = useState('45');
  const [topicName, setTopicName] = useState('');

  useEffect(() => {
    if (selectedSubjectId) {
      const topics = getTopicsBySubject(selectedSubjectId).filter(t => !t.parentTopicId).slice(0, 8);
      setSubjectTopics(topics);
      setSelectedTopicId(null);
    } else {
      setSubjectTopics([]);
    }
  }, [selectedSubjectId]);

  async function handleSubmit() {
    const mins = parseInt(duration) || 0;
    if (mins <= 0) return;

    // Log the session
    const sessionId = createSession([], 'good', 'external'); // external mode
    
    // Calculate XP: 10 XP per minute for external study (slightly less than Guru active study)
    const xp = mins * 10;
    
    // Note context
    const appName = EXTERNAL_APPS.find(a => a.id === selectedAppId)?.name ?? 'External App';
    const note = `Studied ${topicName || 'General'} on ${appName}`;
    
    // End immediately (it's a retroactive log)
    // We pass [] as completed topic IDs since we don't track granular topics externally yet, 
    // unless we create a dummy topic? For now, just log XP and time.
    endSession(sessionId, [], xp, mins);

    // Update SRS for selected topic if applicable
    if (selectedTopicId) {
      const confidence = mins >= 60 ? 4 : mins >= 30 ? 3 : 2;
      updateTopicProgress(selectedTopicId, 'seen', confidence, xp);
    }

    // Update streak if > 20 mins
    updateStreak(mins >= 20);

    await refreshProfile();
    navigation.goBack();
  }

  const selectedApp = EXTERNAL_APPS.find(a => a.id === selectedAppId);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Log External Study</Text>
        <Text style={styles.subtitle}>
          Did you watch a video on Cerebellum or solve MCQs on Marrow? Log it here to keep your streak alive!
        </Text>

        <Text style={styles.label}>Which App?</Text>
        <View style={styles.appGrid}>
          {EXTERNAL_APPS.map(app => (
            <TouchableOpacity
              key={app.id}
              style={[styles.appBtn, selectedAppId === app.id && styles.appBtnActive]}
              onPress={() => setSelectedAppId(app.id)}
            >
              <Text style={styles.appIcon}>{app.iconEmoji}</Text>
              <Text style={[styles.appName, selectedAppId === app.id && styles.appNameActive]}>{app.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Subject (Optional)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.subjectScroll}>
          {subjects.map(s => (
            <TouchableOpacity
              key={s.id}
              style={[styles.subjectChip, selectedSubjectId === s.id && { backgroundColor: s.colorHex }]}
              onPress={() => setSelectedSubjectId(s.id === selectedSubjectId ? null : s.id)}
            >
              <Text style={[styles.subjectText, selectedSubjectId === s.id && { color: '#000' }]}>
                {s.shortCode}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {subjectTopics.length > 0 && (
          <>
            <Text style={styles.label}>Topic Studied (Optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.subjectScroll}>
              {subjectTopics.map(t => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.subjectChip, selectedTopicId === t.id && { backgroundColor: '#6C63FF' }]}
                  onPress={() => setSelectedTopicId(t.id === selectedTopicId ? null : t.id)}
                >
                  <Text style={[styles.subjectText, selectedTopicId === t.id && { color: '#fff' }]} numberOfLines={1}>
                    {t.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        <Text style={styles.label}>Topic / Chapter Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Heart Failure"
          placeholderTextColor="#555"
          value={topicName}
          onChangeText={setTopicName}
        />

        <Text style={styles.label}>Duration (minutes)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.durationScroll}>
          {[15, 30, 45, 60, 90].map(mins => (
            <TouchableOpacity
              key={mins}
              style={[styles.durationChip, duration === mins.toString() && styles.durationChipActive]}
              onPress={() => setDuration(mins.toString())}
            >
              <Text style={[styles.durationText, duration === mins.toString() && styles.durationTextActive]}>
                {mins}m
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TextInput
          style={styles.input}
          value={duration}
          onChangeText={setDuration}
          keyboardType="number-pad"
          placeholder="45"
          placeholderTextColor="#555"
        />

        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
          <Text style={styles.submitText}>Log Session (+{parseInt(duration || '0') * 10} XP)</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  content: { padding: 20 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 8 },
  subtitle: { color: '#9E9E9E', fontSize: 14, marginBottom: 24, lineHeight: 20 },
  label: { color: '#6C63FF', fontSize: 12, fontWeight: '700', marginBottom: 10, marginTop: 10 },
  appGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  appBtn: {
    width: '30%', backgroundColor: '#1A1A24', borderRadius: 12, padding: 12,
    alignItems: 'center', borderWidth: 1, borderColor: '#333'
  },
  appBtnActive: { borderColor: '#6C63FF', backgroundColor: '#1A1A3A' },
  appIcon: { fontSize: 24, marginBottom: 4 },
  appName: { color: '#9E9E9E', fontSize: 11, fontWeight: '600' },
  appNameActive: { color: '#fff' },
  subjectScroll: { flexDirection: 'row', marginBottom: 20 },
  durationScroll: { flexDirection: 'row', marginBottom: 12, marginTop: 4 },
  durationChip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    backgroundColor: '#1A1A24', marginRight: 8, borderWidth: 1, borderColor: '#333'
  },
  durationChipActive: { backgroundColor: '#6C63FF', borderColor: '#6C63FF' },
  durationText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  durationTextActive: { color: '#fff', fontWeight: '700' },
  subjectChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#1A1A24', marginRight: 8, borderWidth: 1, borderColor: '#333'
  },
  subjectText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  input: {
    backgroundColor: '#1A1A24', borderRadius: 12, padding: 14,
    color: '#fff', fontSize: 16, borderWidth: 1, borderColor: '#333', marginBottom: 10
  },
  submitBtn: {
    backgroundColor: '#6C63FF', borderRadius: 16, padding: 18,
    alignItems: 'center', marginTop: 24
  },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
