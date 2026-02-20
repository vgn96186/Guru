import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, StatusBar, FlatList, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SyllabusStackParamList } from '../navigation/types';
import { getAllSubjects, getSubjectCoverage } from '../db/queries/topics';
import { initDatabase, getDb } from '../db/database';
import SubjectCard from '../components/SubjectCard';
import type { Subject } from '../types';

type Nav = NativeStackNavigationProp<SyllabusStackParamList, 'Syllabus'>;

export default function SyllabusScreen() {
  const navigation = useNavigation<Nav>();
  const isFocused = useIsFocused();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [coverage, setCoverage] = useState<Map<number, { total: number; seen: number }>>(new Map());
  const [refreshing, setRefreshing] = useState(false);

  async function loadData() {
    const subs = getAllSubjects();
    setSubjects(subs);
    const cov = getSubjectCoverage();
    // Force numeric keys in the map to prevent string/number mismatch
    const map = new Map(cov.map(c => [Number(c.subjectId), { total: c.total, seen: c.seen }]));
    setCoverage(map);
  }

  useEffect(() => {
    if (isFocused) {
      loadData();
    }
  }, [isFocused]);

  async function handleManualSync() {
    setRefreshing(true);
    try {
      await initDatabase(true); // Force re-seed
      await loadData();
      Alert.alert('Synced', 'Guru re-checked your vault topics. 😏');
    } catch (e: any) {
      Alert.alert('Sync failed', e.message);
    } finally {
      setRefreshing(false);
    }
  }

  function runDiagnostics() {
    const db = getDb();
    const count = db.getFirstSync<{ c: number }>('SELECT COUNT(*) as c FROM topics')?.c;
    const subjects = db.getAllSync<any>('SELECT id, name FROM subjects');
    const coverage = db.getAllSync<any>('SELECT subject_id, COUNT(*) as c FROM topics GROUP BY subject_id');
    
    // Create a readable summary of topics per subject
    const subjectMap = new Map(subjects.map((s: any) => [s.id, s.name]));
    const summary = coverage.map((c: any) => `${subjectMap.get(c.subject_id) || `ID ${c.subject_id} (NOT IN SUBJECTS)`}: ${c.c} topics`).join('\n');

    const diag = `Total topics: ${count}\n\n` +
                 `--- Topics Per Subject ---\n${summary}\n\n` +
                 `--- Subjects Map ---\n${subjects.map((s:any) => `${s.id}: ${s.name}`).join('\n')}`;
    
    console.log('--- DB DIAGNOSTICS ---');
    console.log(diag);
    Alert.alert('Database State', diag);
  }

  const totalTopics = Array.from(coverage.values()).reduce((s, v) => s + v.total, 0);
  const seenTopics = Array.from(coverage.values()).reduce((s, v) => s + v.seen, 0);
  const overallPct = totalTopics > 0 ? Math.round((seenTopics / totalTopics) * 100) : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
      <View style={styles.header}>
        <TouchableOpacity onPress={runDiagnostics} style={styles.diagBtn}>
          <Text style={styles.diagBtnText}>⚙️</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Syllabus</Text>
          <View style={styles.overallBadge}>
            <Text style={styles.overallPct}>{overallPct}%</Text>
            <Text style={styles.overallLabel}> covered</Text>
          </View>
        </View>
        <TouchableOpacity 
          onPress={handleManualSync} 
          disabled={refreshing}
          style={styles.syncBtn}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color="#6C63FF" />
          ) : (
            <Text style={styles.syncBtnText}>🔄 Sync Vault</Text>
          )}
        </TouchableOpacity>
      </View>
      <FlatList
        data={subjects}
        keyExtractor={s => s.id.toString()}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <SubjectCard
            subject={item}
            coverage={coverage.get(item.id) ?? { total: 0, seen: 0 }}
            onPress={() => navigation.navigate('TopicDetail', { subjectId: item.id, subjectName: item.name })}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 20 },
  diagBtn: { marginRight: 12, padding: 8, backgroundColor: '#1A1A24', borderRadius: 10 },
  diagBtnText: { fontSize: 16 },
  title: { color: '#fff', fontSize: 26, fontWeight: '900' },
  overallBadge: { flexDirection: 'row', alignItems: 'baseline', backgroundColor: '#1A1A24', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  overallPct: { color: '#6C63FF', fontWeight: '900', fontSize: 20 },
  overallLabel: { color: '#9E9E9E', fontSize: 13 },
  syncBtn: { backgroundColor: '#1A1A24', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#6C63FF33' },
  syncBtnText: { color: '#6C63FF', fontWeight: '700', fontSize: 13 },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
});
