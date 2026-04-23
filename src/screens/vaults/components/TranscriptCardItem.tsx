import React from 'react';
import { View, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LinearText from '../../../components/primitives/LinearText';
import LinearSurface from '../../../components/primitives/LinearSurface';
import { linearTheme as n } from '../../../theme/linearTheme';

export interface TranscriptFile {
  name: string;
  path: string;
  sizeMB: number;
  folder: string;
  wordCount: number;
  contentHash: string;
  extractedTitle?: string;
}

interface TranscriptCardItemProps {
  item: TranscriptFile;
  isSelected: boolean;
  isSelectionMode: boolean;
  displayName: string;
  onPress: (item: TranscriptFile) => void;
  onLongPress: (path: string) => void;
  onProcess: (item: TranscriptFile) => void;
  onDelete: (item: TranscriptFile) => void;
}

export function TranscriptCardItem({
  item,
  isSelected,
  isSelectionMode,
  displayName,
  onPress,
  onLongPress,
  onProcess,
  onDelete,
}: TranscriptCardItemProps) {
  return (
    <Pressable
      onLongPress={() => onLongPress(item.path)}
      onPress={() => onPress(item)}
      delayLongPress={220}
    >
      <LinearSurface
        padded={false}
        borderColor={isSelected ? n.colors.accent : n.colors.border}
        style={[styles.card, isSelected && styles.cardSelected]}
      >
        {isSelectionMode ? (
          <View style={styles.cardIcon}>
            <Ionicons
              name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
              size={24}
              color={isSelected ? n.colors.accent : n.colors.textMuted}
            />
          </View>
        ) : (
          <View style={styles.cardIcon}>
            <Ionicons name="document-text-outline" size={24} color={n.colors.accent} />
          </View>
        )}
        <View style={styles.cardBody}>
          <LinearText style={styles.cardName} numberOfLines={3} ellipsizeMode="tail">
            {displayName}
          </LinearText>
          <LinearText style={styles.cardMeta}>
            {item.wordCount.toLocaleString()} words · {item.folder}
            {item.sizeMB > 0 ? ` · ${item.sizeMB} KB` : ''}
          </LinearText>
        </View>
        {!isSelectionMode && (
          <View style={styles.cardActions}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => onProcess(item)}>
              <Ionicons name="sparkles" size={20} color={n.colors.success ?? n.colors.success} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => onPress(item)}>
              <Ionicons name="book-outline" size={20} color={n.colors.accent} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => onDelete(item)}>
              <Ionicons name="trash-outline" size={20} color={n.colors.error} />
            </TouchableOpacity>
          </View>
        )}
      </LinearSurface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: n.spacing.md,
    borderRadius: n.radius.md,
    backgroundColor: n.colors.surface,
    marginBottom: n.spacing.md,
  },
  cardSelected: {
    backgroundColor: n.colors.accent + '11',
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: n.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: n.spacing.md,
  },
  cardBody: {
    flex: 1,
    gap: 4,
  },
  cardName: {
    fontSize: 16,
    lineHeight: 20,
    color: n.colors.textPrimary,
  },
  cardMeta: {
    fontSize: 13,
    color: n.colors.textMuted,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    padding: 8,
    borderRadius: n.radius.md,
    backgroundColor: n.colors.background,
  },
});
