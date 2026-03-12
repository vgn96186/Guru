const fs = require('fs');
const path = require('path');

// 1. Zod Validation in aiService.ts
let aiService = fs.readFileSync('../src/services/aiService.ts', 'utf-8');
if (!aiService.includes("import { z } from 'zod';")) {
  aiService = aiService.replace(
    "import type { AIContent, ContentType, Mood, TopicWithProgress } from '../types';",
    "import type { AIContent, ContentType, Mood, TopicWithProgress } from '../types';\nimport { z } from 'zod';"
  );
  
  const zodSchemas = `
const KeyPointsSchema = z.object({
  type: z.literal('keypoints'),
  topicName: z.string(),
  points: z.array(z.string()),
  memoryHook: z.string()
});
const QuizQuestionSchema = z.object({
  question: z.string(),
  options: z.tuple([z.string(), z.string(), z.string(), z.string()]),
  correctIndex: z.number(),
  explanation: z.string()
});
const QuizSchema = z.object({
  type: z.literal('quiz'),
  topicName: z.string(),
  questions: z.array(QuizQuestionSchema)
});
const StorySchema = z.object({
  type: z.literal('story'),
  topicName: z.string(),
  story: z.string(),
  keyConceptHighlights: z.array(z.string())
});
const MnemonicSchema = z.object({
  type: z.literal('mnemonic'),
  topicName: z.string(),
  mnemonic: z.string(),
  expansion: z.array(z.string()),
  tip: z.string()
});
const TeachBackSchema = z.object({
  type: z.literal('teach_back'),
  topicName: z.string(),
  prompt: z.string(),
  keyPointsToMention: z.array(z.string()),
  guruReaction: z.string()
});
const ErrorHuntSchema = z.object({
  type: z.literal('error_hunt'),
  topicName: z.string(),
  paragraph: z.string(),
  errors: z.array(z.object({ wrong: z.string(), correct: z.string(), explanation: z.string() }))
});
const DetectiveSchema = z.object({
  type: z.literal('detective'),
  topicName: z.string(),
  clues: z.array(z.string()),
  answer: z.string(),
  explanation: z.string()
});
const AIContentSchema = z.union([
  KeyPointsSchema, QuizSchema, StorySchema, MnemonicSchema, TeachBackSchema, ErrorHuntSchema, DetectiveSchema
]);
const AgendaSchema = z.object({
  selectedTopicIds: z.array(z.number()),
  focusNote: z.string(),
  guruMessage: z.string()
});
`;

  aiService = aiService.replace('class RateLimitError', zodSchemas + '\nclass RateLimitError');

  // Replace parseJsonResponse
  aiService = aiService.replace(
    /function parseJsonResponse\(raw: string\): AIContent \{\n([\s\S]*?)\}/,
    `function parseJsonResponse(raw: string): AIContent {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const clean = raw.replace(/\\\`\\\`\\\`json/g, '').replace(/\\\`\\\`\\\`/g, '').trim();
    parsed = JSON.parse(clean);
  }
  return AIContentSchema.parse(parsed);
}`
  );

  aiService = aiService.replace(
    /return JSON\.parse\(text\.replace\(\/\\\`\\\`\\\`json\|\\\`\\\`\\\`\/g, ''\)\) as AgendaResponse;/,
    "const parsed = JSON.parse(text.replace(/```json|```/g, '')); return AgendaSchema.parse(parsed) as AgendaResponse;"
  );

  fs.writeFileSync('../src/services/aiService.ts', aiService);
  console.log('Updated aiService.ts with Zod schemas');
}

// 2. Refactoring HomeScreen.tsx component bloat
let homeScreen = fs.readFileSync('../src/screens/HomeScreen.tsx', 'utf-8');
if (homeScreen.includes('quickStatsCard')) {
  // We will extract QuickStatsCard to a separate file and import it
  const quickStatsComponent = `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface QuickStatsCardProps {
  progressPercent: number;
  todayMinutes: number;
  dailyGoal: number;
  minutesLeft: number;
}

export default function QuickStatsCard({ progressPercent, todayMinutes, dailyGoal, minutesLeft }: QuickStatsCardProps) {
  return (
    <View style={styles.quickStatsCard}>
      <View style={styles.progressRingContainer}>
        <View style={styles.progressRing}>
          <View style={[styles.progressRingFill, { transform: [{ rotate: \`\${progressPercent * 3.6}deg\` }] }]} />
          <View style={styles.progressRingCenter}>
            <Text style={styles.progressPercent}>{progressPercent}%</Text>
            <Text style={styles.progressLabel}>Goal</Text>
          </View>
        </View>
      </View>
      <View style={styles.quickStatsInfo}>
        <Text style={styles.quickStatsTitle}>Today's Progress</Text>
        <Text style={styles.quickStatsMinutes}>{todayMinutes} / {dailyGoal} min</Text>
        {minutesLeft > 0 ? (
          <Text style={styles.quickStatsLeft}>{minutesLeft} min left</Text>
        ) : (
          <Text style={styles.quickStatsDone}>🎉 Goal reached!</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  quickStatsCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A24', borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 16 },
  progressRingContainer: { width: 80, height: 80, marginRight: 16 },
  progressRing: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#2A2A38', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  progressRingFill: { position: 'absolute', width: 80, height: 80, borderRadius: 40, borderWidth: 6, borderColor: '#6C63FF', borderLeftColor: 'transparent', borderBottomColor: 'transparent' },
  progressRingCenter: { alignItems: 'center' },
  progressPercent: { color: '#fff', fontWeight: '900', fontSize: 18 },
  progressLabel: { color: '#9E9E9E', fontSize: 9 },
  quickStatsInfo: { flex: 1 },
  quickStatsTitle: { color: '#fff', fontWeight: '700', fontSize: 16, marginBottom: 4 },
  quickStatsMinutes: { color: '#9E9E9E', fontSize: 14, marginBottom: 2 },
  quickStatsLeft: { color: '#FF9800', fontSize: 12 },
  quickStatsDone: { color: '#4CAF50', fontSize: 12, fontWeight: '600' },
});
`;
  
  if (!fs.existsSync('../src/components/home')) fs.mkdirSync('../src/components/home');
  fs.writeFileSync('../src/components/home/QuickStatsCard.tsx', quickStatsComponent);
  
  homeScreen = homeScreen.replace(
    `import LoadingOrb from '../components/LoadingOrb';`,
    `import LoadingOrb from '../components/LoadingOrb';\nimport QuickStatsCard from '../components/home/QuickStatsCard';`
  );
  
  // Regex to remove the inline QuickStatsCard and replace with <QuickStatsCard ... />
  const inlineStatsRegex = /<View style=\{styles\.quickStatsCard\}>[\s\S]*?<\/View>\s*<\/View>\s*<\/View>/;
  homeScreen = homeScreen.replace(inlineStatsRegex, `<QuickStatsCard progressPercent={progressPercent} todayMinutes={todayMinutes} dailyGoal={dailyGoal} minutesLeft={minutesLeft} />`);
  
  fs.writeFileSync('../src/screens/HomeScreen.tsx', homeScreen);
  console.log('Refactored HomeScreen to extract QuickStatsCard');
}

// 3. Adding Cloud Sync / Backup feature
const backupService = `import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Alert } from 'react-native';
import { restartApp } from '../store/useAppStore';

const DB_NAME = 'study_guru.db';
const DB_DIR = \`\${FileSystem.documentDirectory}SQLite\`;
const DB_PATH = \`\${DB_DIR}/\${DB_NAME}\`;

export async function exportDatabase() {
  try {
    const fileExists = await FileSystem.getInfoAsync(DB_PATH);
    if (!fileExists.exists) {
      Alert.alert('Error', 'Database file not found.');
      return;
    }
    
    // Copy to a temporary file with a readable name
    const tempPath = \`\${FileSystem.cacheDirectory}neet_study_backup_\${new Date().toISOString().slice(0,10)}.db\`;
    await FileSystem.copyAsync({ from: DB_PATH, to: tempPath });
    
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(tempPath, {
        mimeType: 'application/octet-stream',
        dialogTitle: 'Export Backup'
      });
    } else {
      Alert.alert('Error', 'Sharing is not available on this device');
    }
  } catch (e) {
    console.error('Backup error', e);
    Alert.alert('Error', 'Failed to export backup.');
  }
}

export async function importDatabase() {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      type: '*/*'
    });
    
    if (result.canceled) return;
    
    const asset = result.assets[0];
    
    // Verify it looks like a DB file
    if (!asset.name.endsWith('.db') && !asset.name.includes('backup')) {
      Alert.alert('Warning', 'This does not look like a backup database file.');
      return;
    }
    
    // Ensure SQLite dir exists
    const dirInfo = await FileSystem.getInfoAsync(DB_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(DB_DIR, { intermediates: true });
    }
    
    // Replace DB
    await FileSystem.copyAsync({ from: asset.uri, to: DB_PATH });
    Alert.alert('Success', 'Backup restored successfully! Please restart the app.', [
      { text: 'OK' }
    ]);
  } catch (e) {
    console.error('Import error', e);
    Alert.alert('Error', 'Failed to import backup.');
  }
}
`;

fs.writeFileSync('../src/services/backupService.ts', backupService);
console.log('Created backupService.ts');

// 4. Update Schema for is_flagged (Medical Accuracy issue)
let schema = fs.readFileSync('../src/db/schema.ts', 'utf-8');
if (!schema.includes('is_flagged')) {
  schema = schema.replace(
    "created_at INTEGER NOT NULL,",
    "created_at INTEGER NOT NULL,\n  is_flagged INTEGER NOT NULL DEFAULT 0,"
  );
  fs.writeFileSync('../src/db/schema.ts', schema);
  
  let database = fs.readFileSync('../src/db/database.ts', 'utf-8');
  // Need to add an alter table if not exists mechanism
  const alterCode = `
  try {
    await db.execAsync("ALTER TABLE ai_cache ADD COLUMN is_flagged INTEGER NOT NULL DEFAULT 0;");
    console.log("Added is_flagged column");
  } catch (e) {
    // Column might already exist
  }
`;
  database = database.replace(
    "await seedInitialData();",
    "await seedInitialData();\n" + alterCode
  );
  fs.writeFileSync('../src/db/database.ts', database);
  console.log('Updated db/schema.ts and db/database.ts to add is_flagged column');
}

