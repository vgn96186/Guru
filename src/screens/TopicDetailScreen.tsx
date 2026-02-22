import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, StatusBar, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation, useIsFocused } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { SyllabusStackParamList, TabParamList } from '../navigation/types';
import { getTopicsBySubject, updateTopicNotes } from '../db/queries/topics';
import type { TopicWithProgress, TopicStatus } from '../types';

type Route = RouteProp<SyllabusStackParamList, 'TopicDetail'>;
type Nav = NativeStackNavigationProp<SyllabusStackParamList, 'TopicDetail'>;

const STATUS_COLORS: Record<TopicStatus, string> = {
  unseen: '#555',
  seen: '#FF9800',
  reviewed: '#6C63FF',
  mastered: '#4CAF50',
};

const STATUS_LABELS: Record<TopicStatus, string> = {
  unseen: 'Not started',
  seen: 'Seen',
  reviewed: 'Reviewed',
  mastered: 'Mastered',
};

export default function TopicDetailScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const isFocused = useIsFocused();
  const { subjectId, subjectName } = route.params;
  const [allTopics, setAllTopics] = useState<TopicWithProgress[]>([]);
  const [displayTopics, setDisplayTopics] = useState<TopicWithProgress[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [collapsedParents, setCollapsedParents] = useState<Set<number>>(new Set());
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    if (isFocused) {
      const data = getTopicsBySubject(subjectId);
      setAllTopics(data);
      if (data.length === 0) {
        Alert.alert('Debug', `Subject ${subjectId} (${subjectName}) has 0 topics.`);
      }
    }
  }, [isFocused, subjectId, subjectName]);

  useEffect(() => {
    // Re-calculate display list whenever allTopics or collapsedParents change
    const list: TopicWithProgress[] = [];
    const topLevel = allTopics.filter(t => !t.parentTopicId);
    
    for (const parent of topLevel) {
      list.push(parent);
      if (!collapsedParents.has(parent.id)) {
        const children = allTopics.filter(t => t.parentTopicId === parent.id);
        list.push(...children);
      }
    }
    setDisplayTopics(list);
  }, [allTopics, collapsedParents]);

  function handleTopicPress(t: TopicWithProgress) {
    const hasChildren = allTopics.some(child => child.parentTopicId === t.id);
    
    if (hasChildren) {
      // Toggle collapse for parent topics
      setCollapsedParents(prev => {
        const next = new Set(prev);
        if (next.has(t.id)) next.delete(t.id);
        else next.add(t.id);
        return next;
      });
    } else {
      // Expand notes for leaf topics
      if (expandedId === t.id) {
        setExpandedId(null);
      } else {
        setExpandedId(t.id);
        setNoteText(t.progress.userNotes);
      }
    }
  }

  function handleSaveNote(topicId: number) {
    updateTopicNotes(topicId, noteText.trim());
    setAllTopics(prev => prev.map(t =>
      t.id === topicId ? { ...t, progress: { ...t.progress, userNotes: noteText.trim() } } : t,
    ));
    setExpandedId(null);
  }

  const done = allTopics.filter(t => t.progress.status !== 'unseen').length;
  const pct = allTopics.length > 0 ? Math.round((done / allTopics.length) * 100) : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F14" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>{subjectName}</Text>
          <Text style={styles.subtitle}>{done}/{allTopics.length} topics · {pct}%</Text>
        </View>
      </View>

      <View style={styles.legend}>
        {(Object.keys(STATUS_COLORS) as TopicStatus[]).map(s => (
          <View key={s} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: STATUS_COLORS[s] }]} />
            <Text style={styles.legendText}>{STATUS_LABELS[s]}</Text>
          </View>
        ))}
      </View>

      <FlatList
        data={displayTopics}
        keyExtractor={t => t.id.toString()}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No topics found. 🧐</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isParent = allTopics.some(t => t.parentTopicId === item.id);
          const isChild = !!item.parentTopicId;
          const isCollapsed = collapsedParents.has(item.id);

          return (
            <View>
              <TouchableOpacity
                style={[
                  styles.topicRow, 
                  isParent && styles.parentRow,
                  isChild && styles.childRow
                ]}
                onPress={() => handleTopicPress(item)}
                activeOpacity={0.8}
              >
                <View style={[styles.statusBar, { backgroundColor: STATUS_COLORS[item.progress.status] }]} />
                <View style={styles.topicInfo}>
                  <View style={styles.nameRow}>
                    {isParent && <Text style={styles.folderIcon}>{isCollapsed ? '▶ ' : '▼ '}</Text>}
                    <Text style={[styles.topicName, isParent && styles.parentName]}>{item.name}</Text>
                  </View>
                  {!isParent && (
                    <View style={styles.topicMeta}>
                      <Text style={styles.topicMetaText}>
                        {item.estimatedMinutes}min · Priority {item.inicetPriority}/10
                      </Text>
                      {item.progress.timesStudied > 0 && (
                        <Text style={styles.studiedText}> · Studied {item.progress.timesStudied}×</Text>
                      )}
                    </View>
                  )}
                  {item.progress.userNotes ? (
                    <Text style={styles.notePreview} numberOfLines={1}>📝 {item.progress.userNotes}</Text>
                  ) : null}
                </View>
                <View style={styles.topicRight}>
                  {item.progress.confidence > 0 && (
                    <View style={styles.confRow}>
                      {[1,2,3,4,5].map(i => (
                        <View
                          key={i}
                          style={[
                            styles.confDot,
                            { backgroundColor: i <= item.progress.confidence ? '#FF9800' : '#333' },
                          ]}
                        />
                      ))}
                    </View>
                  )}
                  <Text style={[styles.statusLabel, { color: STATUS_COLORS[item.progress.status] }]}>
                    {STATUS_LABELS[item.progress.status]}
                  </Text>
                </View>
              </TouchableOpacity>
              {expandedId === item.id && (
                <View style={styles.notesExpanded}>
                  <TouchableOpacity
                    style={styles.studyNowBtn}
                    onPress={() => (navigation as any).getParent()?.navigate('HomeTab')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.studyNowText}>Study this now →</Text>
                  </TouchableOpacity>
                  <Text style={styles.notesLabel}>Your Notes / Mnemonic</Text>
                  <TextInput
                    style={styles.notesInput}
                    value={noteText}
                    onChangeText={setNoteText}
                    placeholder="Write your own notes..."
                    placeholderTextColor="#444"
                    multiline
                    autoFocus
                  />
                  <View style={styles.notesActions}>
                    <TouchableOpacity style={styles.notesSave} onPress={() => handleSaveNote(item.id)}>
                      <Text style={styles.notesSaveText}>Save Note</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.notesCancel} onPress={() => setExpandedId(null)}>
                      <Text style={styles.notesCancelText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 20 },
  backBtn: { padding: 4, marginRight: 12 },
  backText: { color: '#6C63FF', fontSize: 22 },
  headerCenter: { flex: 1 },
  title: { color: '#fff', fontSize: 22, fontWeight: '800' },
  subtitle: { color: '#9E9E9E', fontSize: 13, marginTop: 2 },
  legend: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 8, gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
  legendText: { color: '#9E9E9E', fontSize: 11 },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A24',
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
  },
  parentRow: { backgroundColor: '#1E1E2E', borderLeftWidth: 0 },
  childRow: { marginLeft: 16, transform: [{ scale: 0.98 }] },
  statusBar: { width: 4, alignSelf: 'stretch' },
  topicInfo: { flex: 1, padding: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  folderIcon: { color: '#6C63FF', fontSize: 12, fontWeight: '900' },
  topicName: { color: '#fff', fontWeight: '600', fontSize: 15 },
  parentName: { fontSize: 16, fontWeight: '800', color: '#6C63FF' },
  topicMeta: { flexDirection: 'row', marginTop: 4 },
  topicMetaText: { color: '#9E9E9E', fontSize: 11 },
  studiedText: { color: '#6C63FF', fontSize: 11 },
  topicRight: { padding: 12, alignItems: 'flex-end' },
  confRow: { flexDirection: 'row', gap: 2, marginBottom: 4 },
  confDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: 11, fontWeight: '600' },
  notePreview: { color: '#6C63FF', fontSize: 11, marginTop: 3, fontStyle: 'italic' },
  emptyContainer: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  notesExpanded: { backgroundColor: '#0F0F1E', padding: 12, marginTop: -2, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, borderWidth: 1, borderColor: '#6C63FF44', borderTopWidth: 0 },
  notesLabel: { color: '#6C63FF', fontWeight: '700', fontSize: 12, marginBottom: 8 },
  notesInput: { backgroundColor: '#1A1A24', borderRadius: 10, padding: 12, color: '#fff', fontSize: 14, minHeight: 80, borderWidth: 1, borderColor: '#2A2A38', textAlignVertical: 'top', marginBottom: 10 },
  notesActions: { flexDirection: 'row', gap: 8 },
  notesSave: { flex: 1, backgroundColor: '#6C63FF', borderRadius: 10, padding: 10, alignItems: 'center' },
  notesSaveText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  notesCancel: { flex: 1, backgroundColor: '#2A2A38', borderRadius: 10, padding: 10, alignItems: 'center' },
  notesCancelText: { color: '#9E9E9E', fontWeight: '600', fontSize: 13 },
  studyNowBtn: { backgroundColor: '#6C63FF', borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 12 },
  studyNowText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
