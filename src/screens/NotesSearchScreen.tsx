import React, { useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { getDb } from '../db/database';

export default function NotesSearchScreen() {
  const navigation = useNavigation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);

  function search(text: string) {
    setQuery(text);
    if (text.length < 2) {
      setResults([]);
      return;
    }
    const db = getDb();
    const rows = db.getAllSync<{ id: number; name: string; user_notes: string }>(
      `SELECT t.id, t.name, p.user_notes 
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
          <View style={styles.item}>
            <Text style={styles.topic}>{item.name}</Text>
            <Text style={styles.note}>{item.user_notes}</Text>
          </View>
        )}
        ListEmptyComponent={query.length > 1 ? <Text style={styles.empty}>No matches</Text> : null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: '#222' },
  back: { color: '#fff', fontSize: 24 },
  input: { flex: 1, backgroundColor: '#1A1A24', padding: 12, borderRadius: 10, color: '#fff', fontSize: 16 },
  item: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#222' },
  topic: { color: '#6C63FF', fontWeight: '700', marginBottom: 4 },
  note: { color: '#ccc', lineHeight: 20 },
  empty: { color: '#666', textAlign: 'center', marginTop: 40 },
});