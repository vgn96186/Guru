import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  Dimensions,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  FlatList,
  Pressable,
  Modal,
} from 'react-native';
import Svg, {
  Line,
  Circle,
  G,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { linearTheme as n } from '../theme/linearTheme';
import {
  listMindMaps,
  createMindMap,
  loadFullMindMap,
  addNode,
  addEdge,
  updateNodePosition,
  deleteNode,
  deleteMindMap,
  bulkInsertNodesAndEdges,
  saveViewport,
  type MindMap,
  type MindMapNode,
  type MindMapEdge,
  type MindMapFull,
} from '../db/queries/mindMaps';
import { generateMindMap, expandNode } from '../services/mindMapAI';
import ScreenHeader from '../components/ScreenHeader';

// ── Constants ──────────────────────────────────────────────────────────────

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const NODE_RADIUS_CENTER = 36;
const NODE_RADIUS = 26;
const NODE_FONT_SIZE = 11;
const CENTER_FONT_SIZE = 13;

const STATUS_COLORS: Record<string, string> = {
  unseen: '#606080',
  seen: '#2196F3',
  reviewed: n.colors.accent,
  mastered: '#4CAF50',
};

// ── Map List View ──────────────────────────────────────────────────────────

function MapListView({
  maps,
  onSelect,
  onNew,
  onDelete,
}: {
  maps: MindMap[];
  onSelect: (id: number) => void;
  onNew: () => void;
  onDelete: (id: number) => void;
}) {
  return (
    <View style={styles.listContainer}>
      <TouchableOpacity style={styles.newMapBtn} onPress={onNew} activeOpacity={0.7}>
        <Ionicons name="add-circle-outline" size={22} color={n.colors.accent} />
        <Text style={styles.newMapBtnText}>New Mind Map</Text>
      </TouchableOpacity>
      {maps.length === 0 && (
        <Text style={styles.emptyText}>
          No mind maps yet. Create one to start mapping concepts.
        </Text>
      )}
      <FlatList
        data={maps}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40 }}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.mapCard, pressed && { opacity: 0.7 }]}
            onPress={() => onSelect(item.id)}
            onLongPress={() =>
              Alert.alert('Delete', `Delete "${item.title}"?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => onDelete(item.id) },
              ])
            }
          >
            <Ionicons name="git-network-outline" size={20} color={n.colors.accent} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.mapCardTitle}>{item.title}</Text>
              <Text style={styles.mapCardDate}>
                {new Date(item.updatedAt).toLocaleDateString()}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={n.colors.textMuted} />
          </Pressable>
        )}
      />
    </View>
  );
}

// ── Canvas View ────────────────────────────────────────────────────────────

function CanvasView({
  data,
  onBack,
  onRefresh,
}: {
  data: MindMapFull;
  onBack: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [nodes, setNodes] = useState<MindMapNode[]>(data.nodes);
  const [edges, setEdges] = useState<MindMapEdge[]>(data.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [expandingNodeId, setExpandingNodeId] = useState<number | null>(null);
  const [addingThought, setAddingThought] = useState<number | null>(null);
  const [thoughtText, setThoughtText] = useState('');

  // Viewport state
  const viewport = useRef({ x: SCREEN_W / 2, y: SCREEN_H / 3, scale: 1 });
  const [, forceRender] = useState(0);
  const rerender = useCallback(() => forceRender((c) => c + 1), []);

  // Pinch tracking
  const lastPinchDist = useRef(0);
  const lastPanPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setNodes(data.nodes);
    setEdges(data.edges);
  }, [data]);

  // Save viewport on unmount
  useEffect(() => {
    return () => {
      const vp = viewport.current;
      saveViewport(data.map.id, JSON.stringify({ x: vp.x, y: vp.y, scale: vp.scale })).catch(
        () => {},
      );
    };
  }, [data.map.id]);

  // Restore saved viewport
  useEffect(() => {
    try {
      const saved = JSON.parse(data.map.viewportJson);
      if (saved.x != null) viewport.current = saved;
      rerender();
    } catch {}
  }, [data.map.viewportJson, rerender]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gs) =>
          Math.abs(gs.dx) > 4 || Math.abs(gs.dy) > 4 || gs.numberActiveTouches > 1,
        onPanResponderGrant: (evt) => {
          const touches = evt.nativeEvent.touches;
          if (touches.length === 2) {
            const dx = touches[1].pageX - touches[0].pageX;
            const dy = touches[1].pageY - touches[0].pageY;
            lastPinchDist.current = Math.sqrt(dx * dx + dy * dy);
          }
          lastPanPos.current = { x: viewport.current.x, y: viewport.current.y };
        },
        onPanResponderMove: (evt, gs) => {
          const touches = evt.nativeEvent.touches;
          if (touches.length === 2) {
            // Pinch zoom
            const dx = touches[1].pageX - touches[0].pageX;
            const dy = touches[1].pageY - touches[0].pageY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (lastPinchDist.current > 0) {
              const scaleChange = dist / lastPinchDist.current;
              viewport.current.scale = Math.max(
                0.3,
                Math.min(3, viewport.current.scale * scaleChange),
              );
            }
            lastPinchDist.current = dist;
          } else {
            // Pan
            viewport.current.x = lastPanPos.current.x + gs.dx;
            viewport.current.y = lastPanPos.current.y + gs.dy;
          }
          rerender();
        },
        onPanResponderRelease: () => {
          lastPinchDist.current = 0;
        },
      }),
    [rerender],
  );

  const toScreen = useCallback(
    (nx: number, ny: number) => ({
      x: nx * viewport.current.scale + viewport.current.x,
      y: ny * viewport.current.scale + viewport.current.y,
    }),
    [],
  );

  const handleNodeTap = useCallback((nodeId: number) => {
    setSelectedNodeId((prev) => (prev === nodeId ? null : nodeId));
    setAddingThought(null);
    setThoughtText('');
  }, []);

  const handleAIExpand = useCallback(
    async (nodeId: number) => {
      const node = nodes.find((nd) => nd.id === nodeId);
      if (!node) return;
      setExpandingNodeId(nodeId);
      setSelectedNodeId(null);
      try {
        const existingLabels = nodes.map((nd) => nd.label);
        const layout = await expandNode(node.label, existingLabels);

        // Offset layout relative to the tapped node
        const layoutNodes = layout.nodes.slice(1).map((ln) => ({
          label: ln.label,
          x: node.x + ln.x,
          y: node.y + ln.y,
          isCenter: false,
        }));
        const layoutEdges = layout.edges
          .filter((e) => e.sourceIndex > 0 && e.targetIndex > 0)
          .map((e) => ({
            sourceIndex: e.sourceIndex - 1,
            targetIndex: e.targetIndex - 1,
            label: e.label,
          }));

        const newNodeIds = await bulkInsertNodesAndEdges(data.map.id, layoutNodes, layoutEdges);

        // Connect the first new node to the tapped node
        if (newNodeIds.length > 0) {
          for (const newId of newNodeIds) {
            await addEdge(data.map.id, nodeId, newId);
          }
        }

        await onRefresh();
      } catch (err: any) {
        Alert.alert('AI Error', err.message || 'Failed to expand node');
      } finally {
        setExpandingNodeId(null);
      }
    },
    [nodes, data.map.id, onRefresh],
  );

  const handleAddThought = useCallback(
    async (parentNodeId: number) => {
      if (!thoughtText.trim()) return;
      const parent = nodes.find((nd) => nd.id === parentNodeId);
      if (!parent) return;

      const angle = Math.random() * Math.PI * 2;
      const dist = 140;
      const x = parent.x + Math.cos(angle) * dist;
      const y = parent.y + Math.sin(angle) * dist;

      const newId = await addNode(data.map.id, thoughtText.trim(), x, y);
      await addEdge(data.map.id, parentNodeId, newId);
      setThoughtText('');
      setAddingThought(null);
      await onRefresh();
    },
    [thoughtText, nodes, data.map.id, onRefresh],
  );

  const handleDeleteNode = useCallback(
    async (nodeId: number) => {
      const node = nodes.find((nd) => nd.id === nodeId);
      if (node?.isCenter) {
        Alert.alert('Cannot delete', 'Center node cannot be deleted.');
        return;
      }
      await deleteNode(nodeId);
      setSelectedNodeId(null);
      await onRefresh();
    },
    [nodes, onRefresh],
  );

  const vp = viewport.current;
  const selectedNode = nodes.find((nd) => nd.id === selectedNodeId);

  return (
    <View style={styles.canvasContainer}>
      {/* Header */}
      <View style={styles.canvasHeader}>
        <TouchableOpacity onPress={onBack} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={n.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.canvasTitle} numberOfLines={1}>
          {data.map.title}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {/* SVG Canvas */}
      <View style={styles.svgWrap} {...panResponder.panHandlers}>
        <Svg width={SCREEN_W} height={SCREEN_H} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="edgeGrad" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={n.colors.accent} stopOpacity="0.4" />
              <Stop offset="1" stopColor={n.colors.accent} stopOpacity="0.15" />
            </LinearGradient>
          </Defs>

          {/* Edges */}
          {edges.map((edge) => {
            const src = nodes.find((nd) => nd.id === edge.sourceNodeId);
            const tgt = nodes.find((nd) => nd.id === edge.targetNodeId);
            if (!src || !tgt) return null;
            const s = toScreen(src.x, src.y);
            const t = toScreen(tgt.x, tgt.y);
            return (
              <Line
                key={`e-${edge.id}`}
                x1={s.x}
                y1={s.y}
                x2={t.x}
                y2={t.y}
                stroke="url(#edgeGrad)"
                strokeWidth={1.5 * vp.scale}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const pos = toScreen(node.x, node.y);
            const r = (node.isCenter ? NODE_RADIUS_CENTER : NODE_RADIUS) * vp.scale;
            const fontSize =
              (node.isCenter ? CENTER_FONT_SIZE : NODE_FONT_SIZE) * Math.max(vp.scale, 0.6);
            const isSelected = node.id === selectedNodeId;
            const isExpanding = node.id === expandingNodeId;

            const fillColor = node.color || (node.isCenter ? n.colors.accent : '#1a1a2e');
            const strokeColor = isSelected
              ? n.colors.accent
              : isExpanding
                ? n.colors.warning
                : 'rgba(255,255,255,0.12)';

            return (
              <G key={`n-${node.id}`} onPress={() => handleNodeTap(node.id)}>
                <Circle
                  cx={pos.x}
                  cy={pos.y}
                  r={r}
                  fill={fillColor}
                  stroke={strokeColor}
                  strokeWidth={isSelected ? 2.5 : 1}
                  opacity={isExpanding ? 0.6 : 1}
                />
                <SvgText
                  x={pos.x}
                  y={pos.y + fontSize * 0.35}
                  textAnchor="middle"
                  fontSize={fontSize}
                  fill={node.isCenter ? '#fff' : n.colors.textPrimary}
                  fontWeight={node.isCenter ? 'bold' : 'normal'}
                >
                  {node.label.length > 18 ? node.label.slice(0, 16) + '…' : node.label}
                </SvgText>
              </G>
            );
          })}
        </Svg>

        {/* Expanding indicator */}
        {expandingNodeId != null && (
          <View style={styles.expandingBanner}>
            <ActivityIndicator size="small" color={n.colors.accent} />
            <Text style={styles.expandingText}>AI expanding...</Text>
          </View>
        )}
      </View>

      {/* Node action bar */}
      {selectedNode && addingThought == null && (
        <View style={styles.actionBar}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleAIExpand(selectedNode.id)}
          >
            <Ionicons name="sparkles" size={18} color={n.colors.accent} />
            <Text style={styles.actionBtnText}>AI Expand</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => {
              setAddingThought(selectedNode.id);
              setSelectedNodeId(null);
            }}
          >
            <Ionicons name="create-outline" size={18} color={n.colors.success} />
            <Text style={styles.actionBtnText}>Add Thought</Text>
          </TouchableOpacity>
          {!selectedNode.isCenter && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleDeleteNode(selectedNode.id)}
            >
              <Ionicons name="trash-outline" size={18} color={n.colors.error} />
              <Text style={[styles.actionBtnText, { color: n.colors.error }]}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Add thought input */}
      {addingThought != null && (
        <View style={styles.thoughtBar}>
          <TextInput
            style={styles.thoughtInput}
            placeholder="Your thought..."
            placeholderTextColor={n.colors.textMuted}
            value={thoughtText}
            onChangeText={setThoughtText}
            autoFocus
            onSubmitEditing={() => handleAddThought(addingThought)}
          />
          <TouchableOpacity onPress={() => handleAddThought(addingThought)}>
            <Ionicons name="send" size={22} color={n.colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setAddingThought(null);
              setThoughtText('');
            }}
            style={{ marginLeft: 12 }}
          >
            <Ionicons name="close" size={22} color={n.colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────

export default function MindMapScreen() {
  const navigation = useNavigation();
  const [maps, setMaps] = useState<MindMap[]>([]);
  const [activeMapData, setActiveMapData] = useState<MindMapFull | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const refreshList = useCallback(async () => {
    const list = await listMindMaps();
    setMaps(list);
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const openMap = useCallback(async (mapId: number) => {
    setLoading(true);
    try {
      const full = await loadFullMindMap(mapId);
      if (full) setActiveMapData(full);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshActiveMap = useCallback(async () => {
    if (!activeMapData) return;
    const full = await loadFullMindMap(activeMapData.map.id);
    if (full) setActiveMapData(full);
  }, [activeMapData]);

  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newMapTitle, setNewMapTitle] = useState('');

  const handleNewConfirm = useCallback(async () => {
    if (!newMapTitle.trim()) return;
    setShowNewDialog(false);
    setCreating(true);
    try {
      const title = newMapTitle.trim();
      setNewMapTitle('');
      const mapId = await createMindMap(title);
      const layout = await generateMindMap(title);
      const layoutNodes = layout.nodes.map((ln) => ({
        label: ln.label,
        x: ln.x,
        y: ln.y,
        isCenter: ln.isCenter,
      }));
      await bulkInsertNodesAndEdges(mapId, layoutNodes, layout.edges);
      await refreshList();
      await openMap(mapId);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create mind map');
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
        <ScreenHeader title="Mind Map" />
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={n.colors.accent} />
          <Text style={styles.loadingText}>
            {creating ? 'AI is mapping concepts...' : 'Loading...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (activeMapData) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <CanvasView
          data={activeMapData}
          onBack={() => {
            setActiveMapData(null);
            refreshList();
          }}
          onRefresh={refreshActiveMap}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScreenHeader title="Mind Map" />
      <MapListView maps={maps} onSelect={openMap} onNew={handleNew} onDelete={handleDelete} />

      {/* New map dialog (Android-compatible) */}
      <Modal visible={showNewDialog} transparent animationType="fade">
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogBox}>
            <Text style={styles.dialogTitle}>New Mind Map</Text>
            <Text style={styles.dialogSubtitle}>Enter a topic or concept to map:</Text>
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
                <Text style={[styles.dialogBtnText, { color: n.colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleNewConfirm} style={styles.dialogBtn}>
                <Text style={[styles.dialogBtnText, { color: n.colors.accent }]}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: n.colors.background,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: n.colors.textSecondary,
    fontSize: 14,
    marginTop: 8,
  },

  // List
  listContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
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
  newMapBtnText: {
    color: n.colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  emptyText: {
    color: n.colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
  },
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
  mapCardTitle: {
    color: n.colors.textPrimary,
    fontSize: 15,
    fontWeight: '500',
  },
  mapCardDate: {
    color: n.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },

  // Canvas
  canvasContainer: {
    flex: 1,
  },
  canvasHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: n.colors.border,
  },
  canvasTitle: {
    color: n.colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  svgWrap: {
    flex: 1,
    backgroundColor: n.colors.background,
  },

  // Action bar
  actionBar: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.border,
    borderRadius: n.radius.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  actionBtnText: {
    color: n.colors.textPrimary,
    fontSize: 13,
    fontWeight: '500',
  },

  // Thought input
  thoughtBar: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.border,
    borderRadius: n.radius.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  thoughtInput: {
    flex: 1,
    color: n.colors.textPrimary,
    fontSize: 14,
    marginRight: 8,
    paddingVertical: 4,
  },

  // Expanding
  expandingBanner: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: n.radius.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  expandingText: {
    color: n.colors.textSecondary,
    fontSize: 13,
  },

  // Dialog
  dialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
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
  dialogTitle: {
    color: n.colors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  dialogSubtitle: {
    color: n.colors.textSecondary,
    fontSize: 14,
    marginBottom: 16,
  },
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
  dialogButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
  },
  dialogBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  dialogBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
