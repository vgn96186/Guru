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
import { getFlaggedContent, setContentFlagged, type FlaggedItem } from '../db/queries/aiCache';
import { MarkdownRender } from '../components/MarkdownRender';
import { linearTheme as n } from '../theme/linearTheme';
import { CONTENT_TYPE_LABELS } from '../constants/contentTypes';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { emphasizeHighYieldMarkdown } from '../utils/highlightMarkdown';
import ScreenHeader from '../components/ScreenHeader';
import LinearSurface from '../components/primitives/LinearSurface';

function renderPreview(item: FlaggedItem) {
  const c = item.content;
  switch (c.type) {
    case 'keypoints':
      return c.points.slice(0, 3).map((p, i) => (
        <Text key={i} style={styles.previewLine}>
          • {p}
        </Text>
      ));
    case 'quiz': {
      const q = c.questions?.[0];
      if (!q) return null;
      return (
        <>
          <Text style={styles.previewLine}>Q: {q.question}</Text>
          <Text style={styles.previewCorrect}>✓ {q.options[q.correctIndex]}</Text>
          <View style={{ marginTop: 6 }}>
            <MarkdownRender content={emphasizeHighYieldMarkdown(q.explanation)} compact />
          </View>
        </>
      );
    }
    case 'mnemonic':
      return (
        <>
          <Text style={styles.previewLine}>{c.mnemonic}</Text>
          {c.expansion.slice(0, 3).map((e, i) => (
            <Text key={i} style={styles.previewSub}>
              {' '}
              {e}
            </Text>
          ))}
        </>
      );
    case 'story':
      return (
        <Text style={styles.previewLine} numberOfLines={4}>
          {c.story}
        </Text>
      );
    case 'error_hunt':
      return c.errors.slice(0, 2).map((e, i) => (
        <Text key={i} style={styles.previewLine}>
          ✗ {e.wrong} → {e.correct}
        </Text>
      ));
    default:
      return null;
  }
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
      <LinearSurface padded={false} borderColor={n.colors.warning} style={styles.card}>
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
      </LinearSurface>
    );
  },
);

export default function FlaggedReviewScreen() {
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
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ResponsiveContainer>
        <ScreenHeader
          title="Flagged for Review"
          subtitle="Recheck AI content you marked for a second look."
          rightElement={<Text style={styles.count}>{items.length}</Text>}
        />

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
  safe: { flex: 1, backgroundColor: n.colors.background },
  count: {
    color: n.colors.warning,
    fontWeight: '700',
    fontSize: 16,
    backgroundColor: 'rgba(217,119,6,0.1)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  hint: {
    color: n.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 16,
    fontStyle: 'italic',
  },
  card: {
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: n.colors.warning,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  cardMeta: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center' },
  cardType: {
    color: n.colors.warning,
    fontWeight: '700',
    fontSize: 12,
    backgroundColor: 'rgba(217,119,6,0.1)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  cardSubject: { color: n.colors.textMuted, fontSize: 12 },
  unflagBtn: {
    backgroundColor: n.colors.surfaceHover,
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unflagText: { color: n.colors.textMuted, fontSize: 12, fontWeight: '700' },
  cardTopic: { color: n.colors.textPrimary, fontWeight: '700', fontSize: 15, marginBottom: 4 },
  cardModel: { color: n.colors.textSecondary, fontSize: 11, marginBottom: 8 },
  preview: {
    backgroundColor: n.colors.background,
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
  emptyTitle: { color: n.colors.textPrimary, fontWeight: '700', fontSize: 20, marginBottom: 8 },
  emptySub: { color: n.colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 22 },
});
