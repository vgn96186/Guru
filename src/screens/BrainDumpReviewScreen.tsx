import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, StatusBar } from 'react-native';
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

type Props = NativeStackScreenProps<RootStackParamList, 'BrainDumpReview'>;

export default function BrainDumpReviewScreen({ navigation }: Props) {
  const [dumps, setDumps] = useState<BrainDumpLog[]>([]);

  useEffect(() => {
    getBrainDumps().then(setDumps);
  }, []);

  const handleClear = () => {
    Alert.alert(
      'Clear All Thoughts?',
      'This will permanently delete all parked thoughts. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await clearBrainDumps();
            setDumps([]);
            navigation.goBack();
          },
        },
      ],
    );
  };

  const handleDone = () => {
    navigation.goBack();
  };

  const handleDeleteOne = (dump: BrainDumpLog) => {
    Alert.alert('Delete Thought?', 'This parked thought will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteBrainDump(dump.id);
          setDumps((prev) => prev.filter((item) => item.id !== dump.id));
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <ResponsiveContainer>
        <View style={styles.header}>
          <Text style={styles.title}>Parked Thoughts</Text>
          <Text style={styles.subtitle}>You safely deferred these while studying.</Text>
        </View>

        {dumps.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="checkmark-circle-outline" size={64} color="#4CAF50" />
            <Text style={styles.emptyText}>No thoughts parked this session.</Text>
          </View>
        ) : (
          <FlatList
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
                  <Text style={styles.cardText}>{item.note}</Text>
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
              <Text style={styles.clearText}>Clear All</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.doneBtn}
            onPress={handleDone}
            accessibilityRole="button"
            accessibilityLabel="Done"
          >
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F14',
    padding: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#9E9E9E',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#9E9E9E',
    fontSize: 18,
    marginTop: 16,
  },
  listContent: {
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#1A1A24',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333344',
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
    color: '#FFF',
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
    backgroundColor: '#2A1A1D',
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
    backgroundColor: '#332222',
    padding: 16,
    borderRadius: 16,
    gap: 8,
  },
  clearText: {
    color: '#F44336',
    fontSize: 16,
    fontWeight: 'bold',
  },
  doneBtn: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6C63FF',
    padding: 16,
    borderRadius: 16,
  },
  doneText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
