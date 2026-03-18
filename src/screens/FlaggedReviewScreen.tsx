import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../navigation/types';
import { getFlaggedContent, setContentFlagged, type FlaggedItem } from '../db/queries/aiCache';
import { theme } from '../constants/theme';
import { CONTENT_TYPE_LABELS } from '../constants/contentTypes';
import { ResponsiveContainer } from '../hooks/useResponsive';

function renderPreview(item: FlaggedItem) {
  const c = item.content as any;
  if (item.contentType === 'keypoints') {
    return (c.points as string[]).slice(0, 3).map((p: string, i: number) => (
      <Text key={i} style={styles.previewLine}>
        • {p}
      </Text>
    ));
  }
  if (item.contentType === 'quiz') {
    const q = c.questions?.[0];
    if (!q) return null;
    return (
      <>
        <Text style={styles.previewLine}>Q: {q.question}</Text>
        <Text style={styles.previewCorrect}>✓ {q.options[q.correctIndex]}</Text>
        <Text style={styles.previewExplain}>{q.explanation}</Text>
      </>
    );
  }
  if (item.contentType === 'mnemonic') {
    return (
      <>
        <Text style={styles.previewLine}>{c.mnemonic}</Text>
        {(c.expansion as string[]).slice(0, 3).map((e: string, i: number) => (
          <Text key={i} style={styles.previewSub}>
            {' '}
            {e}
          </Text>
        ))}
      </>
    );
  }
  if (item.contentType === 'story') {
    return (
      <Text style={styles.previewLine} numberOfLines={4}>
        {c.story}
      </Text>
    );
  }
  if (item.contentType === 'error_hunt') {
    return (c.errors as any[]).slice(0, 2).map((e: any, i: number) => (
      <Text key={i} style={styles.previewLine}>
        ✗ {e.wrong} → {e.correct}
      </Text>
    ));
  }
  return null;
}

const FlaggedItemCard = React.memo(
  ({
    item,
    isExpanded,
    onToggle,
    onUnflag,
  }: {
    item: FlaggedItem;
    isExpanded: boolean;
    onToggle: () => void;
    onUnflag: () => void;
  }) => {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <TouchableOpacity
            style={styles.cardMeta}
            onPress={onToggle}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={
              isExpanded ? `Collapse ${item.topicName}` : `Expand ${item.topicName}`
            }
          >
            <Text style={styles.cardType}>{CONTENT_TYPE_LABELS[item.contentType]}</Text>
            <Text style={styles.cardSubject}>{item.subjectName}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.unflagBtn}
            onPress={onUnflag}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Unflag ${item.topicName}`}
          >
            <Text style={styles.unflagText}>✕</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={onToggle}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={
            isExpanded ? `Collapse ${item.topicName}` : `Show preview of ${item.topicName}`
          }
        >
          <Text style={styles.cardTopic}>{item.topicName}</Text>
          <Text style={styles.cardModel}>Model: {item.modelUsed}</Text>

          {isExpanded && <View style={styles.preview}>{renderPreview(item)}</View>}
          <Text style={styles.expandHint}>{isExpanded ? '▲ collapse' : '▼ show preview'}</Text>
        </TouchableOpacity>
      </View>
    );
  },
);

export default function FlaggedReviewScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const [items, setItems] = useState<FlaggedItem[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getFlaggedContent()
      .then((nextItems) => {
        if (active) setItems(nextItems);
      })
      .catch(() => {
        if (active) setItems([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleUnflag = useCallback((item: FlaggedItem) => {
    Alert.alert(
      'Remove flag?',
      `Unflag "${item.topicName}" (${CONTENT_TYPE_LABELS[item.contentType]})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unflag',
          style: 'destructive',
          onPress: async () => {
            await setContentFlagged(item.topicId, item.contentType, false);
            const nextItems = await getFlaggedContent();
            setItems(nextItems);
          },
        },
      ],
    );
  }, []);

  const toggleExpand = useCallback((key: string) => {
    setExpanded((prev) => (prev === key ? null : key));
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <ResponsiveContainer>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>🚩 Flagged for Review</Text>
          <Text style={styles.count}>{items.length}</Text>
        </View>

        {items.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>✅</Text>
            <Text style={styles.emptyTitle}>No flagged content</Text>
            <Text style={styles.emptySub}>
              Tap the 🏳 flag button on any content card to mark it for review here.
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            <Text style={styles.hint}>
              Tap a card to expand. These are AI-generated — verify against textbooks before relying
              on them for exams.
            </Text>
            {items.map((item) => {
              const key = `${item.topicId}-${item.contentType}`;
              return (
                <FlaggedItemCard
                  key={key}
                  item={item}
                  isExpanded={expanded === key}
                  onToggle={() => toggleExpand(key)}
                  onUnflag={() => handleUnflag(item)}
                />
              );
            })}
          </ScrollView>
        )}
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  backBtn: { padding: 4 },
  backText: { color: theme.colors.primary, fontSize: 22, fontWeight: '700' },
  title: { flex: 1, color: theme.colors.textPrimary, fontWeight: '800', fontSize: 18 },
  count: {
    color: theme.colors.warning,
    fontWeight: '700',
    fontSize: 16,
    backgroundColor: theme.colors.warningSurface,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  hint: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 16,
    fontStyle: 'italic',
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.warning,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  cardMeta: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center' },
  cardType: {
    color: theme.colors.warning,
    fontWeight: '700',
    fontSize: 12,
    backgroundColor: theme.colors.warningSurface,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  cardSubject: { color: theme.colors.textMuted, fontSize: 12 },
  unflagBtn: {
    backgroundColor: theme.colors.panel,
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unflagText: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' },
  cardTopic: { color: theme.colors.textPrimary, fontWeight: '700', fontSize: 15, marginBottom: 4 },
  cardModel: { color: theme.colors.textSecondary, fontSize: 11, marginBottom: 8 },
  preview: {
    backgroundColor: theme.colors.background,
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  previewLine: { color: '#D0C8FF', fontSize: 13, lineHeight: 20, marginBottom: 4 },
  previewSub: { color: '#9E9E9E', fontSize: 12, lineHeight: 18 },
  previewCorrect: { color: '#4CAF50', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  previewExplain: { color: '#9E9E9E', fontSize: 12, fontStyle: 'italic', lineHeight: 18 },
  expandHint: { color: '#555', fontSize: 11, textAlign: 'center', marginTop: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: theme.colors.textPrimary, fontWeight: '700', fontSize: 20, marginBottom: 8 },
  emptySub: { color: theme.colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 22 },
});
