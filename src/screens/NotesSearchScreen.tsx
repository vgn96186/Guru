import React, { useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../navigation/types';
import { getDb } from '../db/database';
import { getAllSubjects } from '../db/queries/topics';

export default function NotesSearchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const subjects = getAllSubjects();

  function getSubjectForTopic(topicName: string) {
    return subjects.find(s => topicName.toLowerCase().includes(s.name.toLowerCase()));
  }

  function search(text: string) {
    setQuery(text);
    if (text.length < 2) {
      setResults([]);
      return;
    }
    const db = getDb();
    const rows = db.getAllSync<{ id: number; name: string; user_notes: string; subject_id: number }>(
      `SELECT t.id, t.name, p.user_notes, t.subject_id 
       FROM topics t 
       JOIN topic_progress p ON t.id = p.topic_id 
       WHERE p.user_notes LIKE ? LIMIT 50`,
      [`%${text}%`]
    );
    setResults(rows);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.back}>←</Text></TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="Search your notes..."
          placeholderTextColor="#666"
          value={query}
          onChangeText={search}
          autoFocus
        />
      </View>
      <FlatList
        data={results}
        keyExtractor={i => i.id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.item}
            onPress={() => {
              const subject = getSubjectForTopic(item.name);
              if (subject) {
                // Navigate to Tabs then SyllabusTab -> TopicDetail
                navigation.navigate('SyllabusTab' as any);
                setTimeout(() => {
                  navigation.navigate('TopicDetail' as any, { subjectId: subject.id, subjectName: subject.name });
                }, 100);
              }
            }}
          >
            <Text style={styles.topic}>{item.name}</Text>
            <Text style={styles.note} numberOfLines={3}>{item.user_notes}</Text>
            <Text style={styles.tapHint}>Tap to view topic →</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={query.length > 1 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.empty}>No matches found</Text>
            <Text style={styles.emptySub}>Try searching for 2+ characters or different keywords</Text>
          </View>
        ) : query.length > 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptySub}>Type at least 2 characters to search</Text>
          </View>
        ) : null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: '#222' },
  back: { color: '#fff', fontSize: 24 },
  input: { flex: 1, backgroundColor: '#1A1A24', padding: 12, borderRadius: 10, color: '#fff', fontSize: 16 },
  item: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#222', backgroundColor: '#0F0F14' },
  tapHint: { color: '#6C63FF', fontSize: 12, marginTop: 8, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptySub: { color: '#666', textAlign: 'center', marginTop: 8, fontSize: 14 },
  topic: { color: '#6C63FF', fontWeight: '700', marginBottom: 4 },
  note: { color: '#ccc', lineHeight: 20 },
  empty: { color: '#666', textAlign: 'center', marginTop: 40 },
});