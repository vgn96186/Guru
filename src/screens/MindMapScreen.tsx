import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { linearTheme as n } from '../theme/linearTheme';
import { blackAlpha } from '../theme/colorUtils';
import ScreenHeader from '../components/ScreenHeader';
import ErrorBoundary from '../components/ErrorBoundary';
import LinearText from '../components/primitives/LinearText';
import LoadingOrb from '../components/LoadingOrb';
import { MenuNav } from '../navigation/typedHooks';
import { showError, confirm, confirmDestructive } from '../components/dialogService';

import {
  listMindMaps,
  createMindMap,
  loadFullMindMap,
  deleteMindMap,
  bulkInsertNodesAndEdges,
  clearMindMapContents,
  bulkUpdateNodePositions,
  type MindMap,
  type MindMapFull,
} from '../db/queries/mindMaps';
import { generateMindMap } from '../services/mindMapAI';
import { applyAutoLayout } from '../services/mindmap/layout';

import { MapListView } from './mindmap/MapListView';
import { CanvasView } from './mindmap/CanvasView';

export default function MindMapScreen() {
  const route = MenuNav.useRoute<'MindMap'>();
  const topicNameParam = route.params?.topicName;
  const mapIdParam = route.params?.mapId;

  const [maps, setMaps] = useState<MindMap[]>([]);
  const [activeMapData, setActiveMapData] = useState<MindMapFull | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadMapWithLayout = useCallback(async (mapId: number) => {
    const full = await loadFullMindMap(mapId);
    if (!full) return null;
    const normalized = applyAutoLayout(full);
    if (normalized.changed) {
      await bulkUpdateNodePositions(
        full.map.id,
        normalized.full.nodes.map((n: any) => ({ id: n.id, x: n.x, y: n.y })),
      );
      return { ...normalized.full, map: { ...normalized.full.map, viewportJson: '' } };
    }
    return normalized.full;
  }, []);

  const refreshList = useCallback(async () => {
    const list = await listMindMaps();
    setMaps(list);
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const openMap = useCallback(
    async (mapId: number) => {
      setLoading(true);
      try {
        const full = await loadMapWithLayout(mapId);
        if (full) setActiveMapData(full);
      } finally {
        setLoading(false);
      }
    },
    [loadMapWithLayout],
  );

  // Auto-create from nav param
  const autoCreated = useRef(false);
  useEffect(() => {
    if (autoCreated.current) return;
    if (mapIdParam) {
      autoCreated.current = true;
      openMap(mapIdParam);
    } else if (topicNameParam) {
      autoCreated.current = true;
      (async () => {
        setCreating(true);
        try {
          const layout = await generateMindMap(topicNameParam);
          const layoutNodes = layout.nodes.map((ln: any) => ({
            label: ln.label,
            x: ln.x,
            y: ln.y,
            isCenter: ln.isCenter,
          }));
          const mapId = await createMindMap(topicNameParam);
          await bulkInsertNodesAndEdges(mapId, layoutNodes, layout.edges);
          await refreshList();
          await openMap(mapId);
        } catch (err: any) {
          showError(err, 'Failed to create mind map');
        } finally {
          setCreating(false);
        }
      })();
    }
  }, [topicNameParam, mapIdParam, openMap, refreshList]);

  const activeMapRef = useRef(activeMapData);
  activeMapRef.current = activeMapData;

  const refreshActiveMap = useCallback(async () => {
    const current = activeMapRef.current;
    if (!current) return;
    const full = await loadMapWithLayout(current.map.id);
    if (full) setActiveMapData(full);
  }, [loadMapWithLayout]);

  const regenerateMap = useCallback(async () => {
    const current = activeMapRef.current;
    if (!current) return;
    const mapId = current.map.id;
    const title = current.map.title;
    setActiveMapData(null);
    setCreating(true);
    try {
      const layout = await generateMindMap(title);
      const layoutNodes = layout.nodes.map((ln) => ({
        label: ln.label,
        x: ln.x,
        y: ln.y,
        isCenter: ln.isCenter,
      }));
      await clearMindMapContents(mapId);
      await bulkInsertNodesAndEdges(mapId, layoutNodes, layout.edges);
      await openMap(mapId);
    } catch (err: any) {
      showError(err, 'Regeneration Failed');
    } finally {
      setCreating(false);
    }
  }, [openMap]);

  const deleteActiveMap = useCallback(async () => {
    const current = activeMapRef.current;
    if (!current) return;
    const ok = await confirmDestructive(
      'Delete Map',
      `Are you sure you want to delete "${current.map.title}"?`,
    );
    if (ok) {
      await deleteMindMap(current.map.id);
      setActiveMapData(null);
      await refreshList();
    }
  }, [refreshList]);

  const recreateMapItem = useCallback(
    async (mapId: number, title: string) => {
      const ok = await confirm('Recreate Map', `Completely regenerate "${title}" with AI?`);
      if (!ok) return;
      setCreating(true);
      try {
        const layout = await generateMindMap(title);
        const layoutNodes = layout.nodes.map((ln) => ({
          label: ln.label,
          x: ln.x,
          y: ln.y,
          isCenter: ln.isCenter,
        }));
        await clearMindMapContents(mapId);
        await bulkInsertNodesAndEdges(mapId, layoutNodes, layout.edges);
        await refreshList();
      } catch (err: any) {
        showError(err, 'Regeneration Failed');
      } finally {
        setCreating(false);
      }
    },
    [refreshList],
  );

  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newMapTitle, setNewMapTitle] = useState('');

  const handleNewConfirm = useCallback(async () => {
    if (!newMapTitle.trim()) return;
    setShowNewDialog(false);
    setCreating(true);
    try {
      const title = newMapTitle.trim();
      setNewMapTitle('');
      const layout = await generateMindMap(title);
      const layoutNodes = layout.nodes.map((ln) => ({
        label: ln.label,
        x: ln.x,
        y: ln.y,
        isCenter: ln.isCenter,
      }));
      const mapId = await createMindMap(title);
      await bulkInsertNodesAndEdges(mapId, layoutNodes, layout.edges);
      await refreshList();
      await openMap(mapId);
    } catch (err: any) {
      showError(err, 'Failed to create mind map');
    } finally {
      setCreating(false);
    }
  }, [newMapTitle, openMap, refreshList]);

  const handleNew = useCallback(() => {
    setNewMapTitle('');
    setShowNewDialog(true);
  }, []);

  const handleDelete = useCallback(
    async (mapId: number) => {
      await deleteMindMap(mapId);
      await refreshList();
    },
    [refreshList],
  );

  if (loading || creating) {
    return (
      <SafeAreaView style={styles.root}>
        <ScreenHeader title="Mind Map" showSettings />
        <View style={styles.centerContent}>
          <LoadingOrb message={creating ? 'Mapping concepts...' : 'Loading...'} size={120} />
        </View>
      </SafeAreaView>
    );
  }

  if (activeMapData) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <ErrorBoundary>
          <CanvasView
            data={activeMapData}
            onBack={() => {
              setActiveMapData(null);
              refreshList();
            }}
            onRefresh={refreshActiveMap}
            onRetry={regenerateMap}
            onDelete={deleteActiveMap}
          />
        </ErrorBoundary>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScreenHeader title="Mind Map" showSettings />
      <MapListView
        maps={maps}
        onSelect={openMap}
        onNew={handleNew}
        onDelete={handleDelete}
        onRecreate={recreateMapItem}
      />

      <Modal visible={showNewDialog} transparent animationType="fade">
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogBox}>
            <LinearText style={styles.dialogTitle}>New Mind Map</LinearText>
            <LinearText style={styles.dialogSubtitle}>Enter a topic or concept to map:</LinearText>
            <TextInput
              style={styles.dialogInput}
              placeholder="e.g. Diabetes Mellitus"
              placeholderTextColor={n.colors.textMuted}
              value={newMapTitle}
              onChangeText={setNewMapTitle}
              autoFocus
              onSubmitEditing={handleNewConfirm}
            />
            <View style={styles.dialogButtons}>
              <TouchableOpacity onPress={() => setShowNewDialog(false)} style={styles.dialogBtn}>
                <LinearText style={[styles.dialogBtnText, { color: n.colors.textMuted }]}>
                  Cancel
                </LinearText>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleNewConfirm} style={styles.dialogBtn}>
                <LinearText style={[styles.dialogBtnText, { color: n.colors.accent }]}>
                  Create
                </LinearText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: n.colors.background },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: n.colors.textSecondary, fontSize: 14, marginTop: 8 },

  // Dialog
  dialogOverlay: {
    flex: 1,
    backgroundColor: blackAlpha['60'],
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  dialogBox: {
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.border,
    borderRadius: n.radius.lg,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  dialogTitle: { color: n.colors.textPrimary, fontSize: 18, fontWeight: '600', marginBottom: 4 },
  dialogSubtitle: { color: n.colors.textSecondary, fontSize: 14, marginBottom: 16 },
  dialogInput: {
    backgroundColor: n.colors.background,
    borderWidth: 1,
    borderColor: n.colors.border,
    borderRadius: n.radius.sm,
    color: n.colors.textPrimary,
    fontSize: 15,
    padding: 12,
    marginBottom: 16,
  },
  dialogButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16 },
  dialogBtn: { paddingVertical: 8, paddingHorizontal: 12 },
  dialogBtnText: { fontSize: 15, fontWeight: '600' },
});
