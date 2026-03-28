import React, { useState, useEffect } from 'react';
import {
  View,
  TextInput,
  FlatList,
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
import { theme } from '../constants/theme';
import { ResponsiveContainer } from '../hooks/useResponsive';
import AppText from '../components/AppText';

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
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ResponsiveContainer style={styles.flex}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backBtn}
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
            </TouchableOpacity>
            <View style={styles.searchContainer}>
              <Ionicons
                name="search"
                size={20}
                color={theme.colors.textMuted}
                style={styles.searchIcon}
              />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={handleChangeQuery}
                placeholder="Search any topic..."
                placeholderTextColor={theme.colors.textMuted}
                autoFocus
                autoCapitalize="none"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')} style={styles.clearBtn}>
                  <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          <FlatList
            data={results}
            keyExtractor={(item) => item.id.toString()}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              query.length >= 2 ? (
                <View style={styles.emptyState}>
                  <AppText style={styles.emptyTitle} variant="sectionTitle">
                    No topics found
                  </AppText>
                  <AppText style={styles.emptySub} variant="bodySmall" tone="muted">
                    Try a different keyword.
                  </AppText>
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons
                    name="search-outline"
                    size={48}
                    color={theme.colors.border}
                    style={{ marginBottom: 16 }}
                  />
                  <AppText style={styles.emptySub} variant="bodySmall" tone="muted">
                    Type at least 2 characters to search across all subjects.
                  </AppText>
                </View>
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
                <View style={[styles.dot, { backgroundColor: item.color_hex }]} />
                <View style={styles.resultTextContainer}>
                  <AppText style={styles.resultName} numberOfLines={3} variant="body">
                    {item.name}
                  </AppText>
                  <AppText style={styles.resultSubject} variant="caption" tone="secondary">
                    {item.subject_name}
                  </AppText>
                </View>
                <Ionicons name="play-circle-outline" size={24} color={theme.colors.primary} />
              </TouchableOpacity>
            )}
          />
        </ResponsiveContainer>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backBtn: { marginRight: 12, padding: 4 },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 12,
    minHeight: 48,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 16,
    minHeight: 24,
    paddingVertical: 0,
  },
  clearBtn: { padding: 4 },
  listContent: { padding: 16 },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: 16,
    borderRadius: theme.borderRadius.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  resultTextContainer: { flex: 1, minWidth: 0, marginRight: 12 },
  resultName: { fontWeight: '700', marginBottom: 4 },
  resultSubject: {},
  emptyState: { alignItems: 'center', marginTop: 60, paddingHorizontal: 32 },
  emptyTitle: { marginBottom: 8, textAlign: 'center' },
  emptySub: { textAlign: 'center' },
});
