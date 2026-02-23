import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import type { TopicWithProgress } from '../../types';

interface Props {
  weakTopics: TopicWithProgress[];
  dueTopics: TopicWithProgress[];
  navigation: NativeStackNavigationProp<HomeStackParamList, 'Home'>;
}

export default function NemesisSection({ weakTopics, dueTopics, navigation }: Props) {
  return (
    <>
      {weakTopics.length > 0 && (
        <TouchableOpacity style={styles.nemesisBar} activeOpacity={0.8} onPress={() => navigation.navigate('BossBattle')}>
          <Text style={styles.nemesisText}>
            ⚔️ {weakTopics.length} nemesis topic{weakTopics.length > 1 ? 's' : ''} still own you
          </Text>
        </TouchableOpacity>
      )}

      {dueTopics.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📅 Due for Review ({dueTopics.length})</Text>
          {dueTopics.map(t => (
            <TouchableOpacity
              key={t.id}
              style={[styles.weakRow, { borderLeftWidth: 3, borderLeftColor: '#6C63FF' }]}
              onPress={() => navigation.getParent()?.navigate('SyllabusTab' as any, {
                screen: 'TopicDetail',
                params: { subjectId: t.subjectId, subjectName: t.subjectName },
              })}
              activeOpacity={0.75}
            >
              <View style={[styles.weakDot, { backgroundColor: t.subjectColor }]} />
              <View style={styles.weakInfo}>
                <Text style={styles.weakName}>{t.name}</Text>
                <Text style={styles.weakSub}>{t.subjectCode} · {t.progress.timesStudied}× studied</Text>
              </View>
              <View style={styles.confidenceRow}>
                {[1,2,3,4,5].map(i => (
                  <View key={i} style={[styles.star, { backgroundColor: i <= t.progress.confidence ? '#6C63FF' : '#333' }]} />
                ))}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {weakTopics.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎯 Your Weak Spots</Text>
          {weakTopics.map(t => (
            <TouchableOpacity
              key={t.id}
              style={styles.weakRow}
              onPress={() => navigation.getParent()?.navigate('SyllabusTab' as any, {
                screen: 'TopicDetail',
                params: { subjectId: t.subjectId, subjectName: t.subjectName },
              })}
              activeOpacity={0.75}
            >
              <View style={[styles.weakDot, { backgroundColor: t.subjectColor }]} />
              <View style={styles.weakInfo}>
                <Text style={styles.weakName}>{t.name}</Text>
                <Text style={styles.weakSub}>{t.subjectName}</Text>
              </View>
              <View style={styles.confidenceRow}>
                {[1,2,3,4,5].map(i => (
                  <View key={i} style={[styles.star, { backgroundColor: i <= t.progress.confidence ? '#FF9800' : '#333' }]} />
                ))}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  nemesisBar: { marginHorizontal: 16, marginVertical: 8, backgroundColor: '#2A0A0A', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#F44336' },
  nemesisText: { color: '#F44336', fontWeight: '600', fontSize: 13 },
  section: { paddingHorizontal: 16 },
  sectionTitle: { color: '#9E9E9E', fontWeight: '700', fontSize: 13, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
  weakRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A24', borderRadius: 12, padding: 12, marginBottom: 8 },
  weakDot: { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
  weakInfo: { flex: 1 },
  weakName: { color: '#fff', fontWeight: '600', fontSize: 14 },
  weakSub: { color: '#9E9E9E', fontSize: 11, marginTop: 2 },
  confidenceRow: { flexDirection: 'row', gap: 3 },
  star: { width: 8, height: 8, borderRadius: 2 },
});
