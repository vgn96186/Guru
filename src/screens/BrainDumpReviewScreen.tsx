import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import LinearText from '../components/primitives/LinearText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { linearTheme as n } from '../theme/linearTheme';
import {
  getBrainDumps,
  clearBrainDumps,
  deleteBrainDump,
  BrainDumpLog,
} from '../db/queries/brainDumps';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { AppFlashList } from '../components/primitives/AppFlashList';
import { EmptyState } from '../components/primitives';
import { confirmDestructive } from '../components/dialogService';

type Props = NativeStackScreenProps<RootStackParamList, 'BrainDumpReview'>;

export default function BrainDumpReviewScreen({ navigation }: Props) {
  const [dumps, setDumps] = useState<BrainDumpLog[]>([]);

  useEffect(() => {
    getBrainDumps().then(setDumps);
  }, []);

  const handleClear = async () => {
    const ok = await confirmDestructive(
      'Clear All Thoughts?',
      'This will permanently delete all parked thoughts. This cannot be undone.',
    );
    if (ok) {
      await clearBrainDumps();
      setDumps([]);
      navigation.goBack();
    }
  };

  const handleDone = () => {
    navigation.goBack();
  };

  const handleDeleteOne = async (dump: BrainDumpLog) => {
    const ok = await confirmDestructive(
      'Delete Thought?',
      'This parked thought will be permanently removed.',
    );
    if (ok) {
      await deleteBrainDump(dump.id);
      setDumps((prev) => prev.filter((item) => item.id !== dump.id));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ResponsiveContainer>
        <View style={styles.header}>
          <LinearText style={styles.title}>Parked Thoughts</LinearText>
          <LinearText style={styles.subtitle}>You safely deferred these while studying.</LinearText>
        </View>

        {dumps.length === 0 ? (
          <EmptyState
            icon="checkmark-circle-outline"
            iconSize={64}
            iconColor="#4CAF50"
            title="No thoughts parked this session."
          />
        ) : (
          <AppFlashList
            data={dumps}
            keyExtractor={(v) => v.id.toString()}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardContent}>
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={24}
                    color="#6C63FF"
                    style={styles.icon}
                  />
                  <LinearText style={styles.cardText}>{item.note}</LinearText>
                </View>
                <TouchableOpacity
                  style={styles.deleteOneBtn}
                  onPress={() => handleDeleteOne(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete parked thought: ${item.note}`}
                >
                  <Ionicons name="trash-outline" size={18} color={n.colors.error} />
                </TouchableOpacity>
              </View>
            )}
          />
        )}

        <View style={styles.actions}>
          {dumps.length > 0 && (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={handleClear}
              accessibilityRole="button"
              accessibilityLabel="Clear all parked thoughts"
            >
              <Ionicons name="trash-outline" size={20} color={n.colors.error} />
              <LinearText style={styles.clearText}>Clear All</LinearText>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.doneBtn}
            onPress={handleDone}
            accessibilityRole="button"
            accessibilityLabel="Done"
          >
            <LinearText style={styles.doneText}>Done</LinearText>
          </TouchableOpacity>
        </View>
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: n.colors.background,
    padding: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: n.colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: n.colors.textMuted,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: n.colors.textMuted,
    fontSize: 18,
    marginTop: 16,
  },
  listContent: {
    paddingBottom: 40,
  },
  card: {
    backgroundColor: n.colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  cardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 16,
  },
  cardText: {
    color: n.colors.textPrimary,
    fontSize: 16,
    flex: 1,
    lineHeight: 24,
  },
  deleteOneBtn: {
    marginLeft: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: n.colors.errorSurface,
  },
  actions: {
    flexDirection: 'row',
    marginTop: 'auto',
    paddingVertical: 16,
    gap: 16,
  },
  clearBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: n.colors.errorSurface,
    padding: 16,
    borderRadius: 16,
    gap: 8,
  },
  clearText: {
    color: n.colors.error,
    fontSize: 16,
    fontWeight: 'bold',
  },
  doneBtn: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: n.colors.accent,
    padding: 16,
    borderRadius: 16,
  },
  doneText: {
    color: n.colors.textPrimary,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
