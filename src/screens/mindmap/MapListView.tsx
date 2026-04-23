import React, { useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, FlatList, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LinearText from '../../components/primitives/LinearText';
import { linearTheme as n } from '../../theme/linearTheme';
import { MindMap } from '../../db/queries/mindMaps';
import { confirmDestructive } from '../../components/dialogService';

const MapCardItem = React.memo(
  ({
    item,
    onSelect,
    onRecreate,
    onDelete,
  }: {
    item: MindMap;
    onSelect: (id: number) => void;
    onRecreate: (id: number, title: string) => void;
    onDelete: (id: number) => void;
  }) => (
    <Pressable
      style={({ pressed }) => [styles.mapCard, pressed && { opacity: 0.7 }]}
      onPress={() => onSelect(item.id)}
    >
      <Ionicons name="git-network-outline" size={20} color={n.colors.accent} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <LinearText style={styles.mapCardTitle}>{item.title}</LinearText>
        <LinearText style={styles.mapCardDate}>
          {new Date(item.updatedAt).toLocaleDateString()}
        </LinearText>
      </View>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <TouchableOpacity
          onPress={() => onRecreate(item.id, item.title)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="refresh-outline" size={20} color={n.colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={async () => {
            const ok = await confirmDestructive('Delete', `Delete "${item.title}"?`);
            if (ok) onDelete(item.id);
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="trash-outline" size={20} color={n.colors.error} />
        </TouchableOpacity>
      </View>
    </Pressable>
  ),
);

export function MapListView({
  maps,
  onSelect,
  onNew,
  onDelete,
  onRecreate,
}: {
  maps: MindMap[];
  onSelect: (id: number) => void;
  onNew: () => void;
  onDelete: (id: number) => void;
  onRecreate: (id: number, title: string) => void;
}) {
  const renderItem = useCallback(
    ({ item }: { item: MindMap }) => (
      <MapCardItem item={item} onSelect={onSelect} onRecreate={onRecreate} onDelete={onDelete} />
    ),
    [onSelect, onRecreate, onDelete],
  );

  return (
    <View style={styles.listContainer}>
      <TouchableOpacity style={styles.newMapBtn} onPress={onNew} activeOpacity={0.7}>
        <Ionicons name="add-circle-outline" size={22} color={n.colors.accent} />
        <LinearText style={styles.newMapBtnText}>New Mind Map</LinearText>
      </TouchableOpacity>
      {maps.length === 0 && (
        <LinearText style={styles.emptyText}>
          No mind maps yet. Create one to start mapping concepts.
        </LinearText>
      )}
      <FlatList
        data={maps}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40 }}
        renderItem={renderItem}
        getItemLayout={(_, index) => ({
          length: 72,
          offset: 72 * index,
          index,
        })}
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={8}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  listContainer: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  newMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.accent,
    borderStyle: 'dashed',
    borderRadius: n.radius.md,
    padding: 16,
    marginBottom: 16,
  },
  newMapBtnText: { color: n.colors.accent, fontSize: 15, fontWeight: '600' },
  emptyText: { color: n.colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 40 },
  mapCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.border,
    borderRadius: n.radius.md,
    padding: 14,
    marginBottom: 8,
  },
  mapCardTitle: { color: n.colors.textPrimary, fontSize: 15, fontWeight: '500' },
  mapCardDate: { color: n.colors.textMuted, fontSize: 12, marginTop: 2 },
});
