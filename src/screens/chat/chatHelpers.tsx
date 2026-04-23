import React from 'react';
import { StyleSheet, View } from 'react-native';
import { linearTheme as n } from '../../theme/linearTheme';
import { getDb } from '../../db/database';

export function getStartersForTopic(topicName: string) {
  return [
    { icon: 'help-circle-outline', text: `Quiz me on ${topicName}` },
    { icon: 'bulb-outline', text: `Explain ${topicName} step by step` },
    { icon: 'alert-circle-outline', text: `${topicName} from the basics` },
    { icon: 'medkit-outline', text: `High-yield points for exam` },
  ];
}

export const FALLBACK_STARTERS = [
  { icon: 'help-circle-outline', text: 'Quiz me on a high-yield topic' },
  { icon: 'bulb-outline', text: 'Walk me through a clinical case' },
  { icon: 'alert-circle-outline', text: 'Quiz me on pharmacology' },
  { icon: 'medkit-outline', text: 'Common exam topic' },
];

export async function getDynamicStarters(): Promise<{ icon: string; text: string }[]> {
  try {
    const db = getDb();
    // Get due/weak topics the student should be working on
    const rows = await db.getAllAsync<{ name: string; subject: string }>(
      `SELECT t.name, s.name AS subject
       FROM topic_progress tp
       JOIN topics t ON t.id = tp.topic_id
       JOIN subjects s ON s.id = t.subject_id
       WHERE tp.status IN ('seen', 'reviewed')
         AND tp.confidence <= 2
       ORDER BY tp.confidence ASC, tp.last_studied_at ASC
       LIMIT 4`,
    );
    if (rows.length === 0) return FALLBACK_STARTERS;
    const icons = ['help-circle-outline', 'bulb-outline', 'alert-circle-outline', 'medkit-outline'];
    const templates = [
      (n: string) => `Quiz me on ${n}`,
      (n: string) => `Explain ${n} step by step`,
      (n: string) => `${n} from the basics`,
      (n: string) => `High-yield points for ${n}`,
    ];
    return rows.map((r, i) => ({
      icon: icons[i % icons.length],
      text: templates[i % templates.length](r.name),
    }));
  } catch {
    return FALLBACK_STARTERS;
  }
}

export function ChatSkeleton() {
  return (
    <View style={chatSkeletonStyles.container}>
      <View style={chatSkeletonStyles.header}>
        <View style={chatSkeletonStyles.headerBar} />
        <View style={chatSkeletonStyles.headerBarSmall} />
      </View>
      <View style={chatSkeletonStyles.body}>
        <View style={chatSkeletonStyles.bubble} />
        <View style={[chatSkeletonStyles.bubble, chatSkeletonStyles.bubbleRight]} />
        <View style={chatSkeletonStyles.bubble} />
      </View>
    </View>
  );
}

const chatSkeletonStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: n.colors.background },
  header: { paddingHorizontal: 16, paddingTop: 16, gap: 6 },
  headerBar: {
    width: '40%',
    height: 12,
    borderRadius: 4,
    backgroundColor: n.colors.border,
    opacity: 0.5,
  },
  headerBarSmall: {
    width: '25%',
    height: 8,
    borderRadius: 3,
    backgroundColor: n.colors.border,
    opacity: 0.3,
  },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 32, gap: 16 },
  bubble: {
    width: '65%',
    height: 48,
    borderRadius: 12,
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.border,
    opacity: 0.5,
  },
  bubbleRight: { alignSelf: 'flex-end', width: '50%', height: 32 },
});
