import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { analyzeTranscript, generateADHDNote } from '../services/transcriptionService';
import { getSubjectByName } from '../db/queries/topics';
import { saveLectureTranscript } from '../db/queries/aiCache';
import { theme } from '../constants/theme';

export default function ManualNoteCreationScreen() {
  const navigation = useNavigation();
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleGenerate = async () => {
    const text = transcript.trim();
    if (!text) {
      Alert.alert('Error', 'Please paste a transcript to process.');
      return;
    }

    setIsProcessing(true);
    try {
      const analysis = await analyzeTranscript(text);
      if (!analysis.subject || analysis.subject === 'Unknown') {
        Alert.alert('Warning', 'Could not determine a subject. A generic subject will be used.');
      }
      const note = await generateADHDNote(analysis);
      const sub = await getSubjectByName(analysis.subject);

      await saveLectureTranscript({
        subjectId: sub?.id ?? null,
        note,
        transcript: text,
        summary: analysis.lectureSummary,
        topics: analysis.topics,
        appName: 'Manual Paste',
        confidence: analysis.estimatedConfidence,
        embedding: undefined,
      });

      Alert.alert('Success', 'Notes generated and saved successfully!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          disabled={isProcessing}
        >
          <Text style={styles.backText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Manual Note Generation</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Paste your transcript text below:</Text>
        <TextInput
          style={styles.input}
          multiline
          placeholder="Paste long transcript here..."
          placeholderTextColor={theme.colors.textMuted}
          value={transcript}
          onChangeText={setTranscript}
          editable={!isProcessing}
        />

        <TouchableOpacity
          style={[styles.btn, (!transcript.trim() || isProcessing) && styles.btnDisabled]}
          onPress={handleGenerate}
          disabled={!transcript.trim() || isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : (
            <Text style={styles.btnText}>Generate Notes</Text>
          )}
        </TouchableOpacity>
        {isProcessing && (
          <Text style={styles.processingText}>
            Analyzing transcript and building elite notes...
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  backBtn: { marginRight: 16 },
  backText: { color: theme.colors.primary, fontSize: 16 },
  title: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 40 },
  label: { color: '#FFF', fontSize: 16, marginBottom: 12 },
  input: {
    backgroundColor: '#1E1E24',
    color: '#FFF',
    borderRadius: 8,
    padding: 16,
    height: 300,
    textAlignVertical: 'top',
    fontSize: 16,
    marginBottom: 20,
  },
  btn: {
    backgroundColor: theme.colors.primary,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  processingText: {
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 16,
    fontSize: 14,
  },
});
