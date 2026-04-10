import React, { useState, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../navigation/types';
import { getDb } from '../db/database';
import { linearTheme as n } from '../theme/linearTheme';
import { ResponsiveContainer } from '../hooks/useResponsive';
import AppText from '../components/AppText';
import BannerSearchBar from '../components/BannerSearchBar';
import { AppFlashList } from '../components/primitives/AppFlashList';
import ScreenHeader from '../components/ScreenHeader';
import LinearSurface from '../components/primitives/LinearSurface';
import { EmptyState } from '../components/primitives';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'GlobalTopicSearch'>;

type SearchResult = {
  id: number;
  name: string;
  subject_name: string;
  color_hex: string;
};

export default function GlobalTopicSearchScreen() {
  const navigation = useNavigation<Nav>();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);

  const handleChangeQuery = (value: string) => {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
    }
  };

  useEffect(() => {
    let isActive = true;
    const searchLower = query.trim().toLowerCase();

    if (searchLower.length < 2) {
      return;
    }

    const db = getDb();
    db.getAllAsync<SearchResult>(
      `SELECT t.id, t.name, s.name as subject_name, s.color_hex 
       FROM topics t 
       JOIN subjects s ON t.subject_id = s.id 
       WHERE LOWER(t.name) LIKE ? 
       ORDER BY t.inicet_priority DESC 
       LIMIT 50`,
      [`%${searchLower}%`],
    ).then((rows) => {
      if (isActive) setResults(rows);
    });

    return () => {
      isActive = false;
    };
  }, [query]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ResponsiveContainer style={styles.flex}>
          <ScreenHeader
            title="Global Topic Search"
            subtitle="Jump to any topic across all subjects."
            searchElement={
              <BannerSearchBar
                value={query}
                onChangeText={handleChangeQuery}
                placeholder="Search any topic..."
                autoFocus
              />
            }
          ></ScreenHeader>
          <AppFlashList
            data={results}
            keyExtractor={(item) => item.id.toString()}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              query.length >= 2 ? (
                <EmptyState
                  icon="search-outline"
                  title="No topics found"
                  subtitle="Try a different keyword."
                  style={styles.emptyState}
                />
              ) : (
                <EmptyState
                  icon="search-outline"
                  iconSize={48}
                  title=""
                  subtitle="Type at least 2 characters to search across all subjects."
                  style={styles.emptyState}
                />
              )
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.resultItem}
                activeOpacity={0.7}
                onPress={() =>
                  navigation.navigate('Session', { mood: 'good', focusTopicId: item.id })
                }
              >
                <LinearSurface padded={false} compact style={styles.resultCard}>
                  <View style={[styles.dot, { backgroundColor: item.color_hex }]} />
                  <View style={styles.resultTextContainer}>
                    <AppText style={styles.resultName} numberOfLines={3} variant="body">
                      {item.name}
                    </AppText>
                    <AppText style={styles.resultSubject} variant="caption" tone="secondary">
                      {item.subject_name}
                    </AppText>
                  </View>
                  <Ionicons name="play-circle-outline" size={24} color={n.colors.accent} />
                </LinearSurface>
              </TouchableOpacity>
            )}
          />
        </ResponsiveContainer>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: n.colors.background },
  flex: { flex: 1 },
  listContent: { padding: 16 },
  resultItem: {
    marginBottom: 8,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  resultTextContainer: { flex: 1, minWidth: 0, marginRight: 12 },
  resultName: { fontWeight: '700', marginBottom: 4 },
  resultSubject: {},
  emptyState: { marginTop: 60 },
});
