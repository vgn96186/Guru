import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  FlatList,
  Pressable,
  Modal,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import LinearText from '../components/primitives/LinearText';
import { EmptyState, type EmptyStateAction } from '../components/primitives';
import LoadingOrb from '../components/LoadingOrb';
import { blackAlpha, whiteAlpha } from '../theme/colorUtils';
import Svg, {
  Rect,
  G,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
  Path,
  Circle,
  Line,
} from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withDecay,
  runOnJS,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { linearTheme as n } from '../theme/linearTheme';
import {
  listMindMaps,
  createMindMap,
  loadFullMindMap,
  addNode,
  addEdge,
  deleteNode,
  deleteMindMap,
  bulkInsertNodesAndEdges,
  clearMindMapContents,
  bulkUpdateNodePositions,
  saveViewport,
  updateNodeExplanation,
  updateNodePosition,
  findTopicsByLabel,
  type MindMap,
  type MindMapNode,
  type MindMapEdge,
  type MindMapFull,
} from '../db/queries/mindMaps';
import { generateMindMap, expandNode, explainMindMapNode } from '../services/mindMapAI';
import { layoutMindMapGraph } from '../services/mindMapLayout';
import ScreenHeader from '../components/ScreenHeader';
import ErrorBoundary from '../components/ErrorBoundary';
import { showError, showWarning, confirmDestructive, confirm } from '../components/dialogService';
import type { MenuStackParamList, HomeStackParamList } from '../navigation/types';

// ── Types ─────────────────────────────────────────────────────────────────

type UndoAction =
  | { type: 'add_node'; nodeId: number }
  | { type: 'delete_node'; node: MindMapNode; edges: MindMapEdge[] }
  | { type: 'expand'; nodeIds: number[] }
  | { type: 'move_node'; nodeId: number; prevX: number; prevY: number };

// ── Constants ──────────────────────────────────────────────────────────────

const NODE_FONT_SIZE = 13;
const CENTER_FONT_SIZE = 14;
const PILL_PAD_X = 16;
const PILL_PAD_Y = 12;
const PILL_RADIUS = 6;
const MAX_NODE_WIDTH = 220;

type Viewport = { width: number; height: number };

const BRANCH_COLORS = [
  { fill: '#C1D8F0', stroke: 'transparent', text: '#1E1E1E' },
  { fill: '#A3D9C3', stroke: 'transparent', text: '#1E1E1E' },
  { fill: '#A6EAA6', stroke: 'transparent', text: '#1E1E1E' },
  { fill: '#EAD3E3', stroke: 'transparent', text: '#1E1E1E' },
  { fill: '#F2D3A8', stroke: 'transparent', text: '#1E1E1E' },
];
const CENTER_COLOR = { fill: '#B5CBE6', stroke: '#1E1E1E', text: '#1E1E1E' };

// ── Helpers ────────────────────────────────────────────────────────────────

function wrapText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if ((current + ' ' + word).length <= maxChars) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.map((line) =>
    line.length > maxChars + 5 ? line.slice(0, maxChars - 1) + '\u2026' : line,
  );
}

function getNodeDimensions(node: Pick<MindMapNode, 'label' | 'isCenter'>) {
  const fontSize = node.isCenter ? CENTER_FONT_SIZE : NODE_FONT_SIZE;
  const label = node.label || 'Unknown';
  const charWidth = fontSize * 0.6;
  const rawWidth = label.length * charWidth + PILL_PAD_X * 2;
  const width = Math.min(Math.max(rawWidth, 60), MAX_NODE_WIDTH);
  const maxCharsPerLine = Math.floor((width - PILL_PAD_X * 2) / charWidth);
  const lines = wrapText(label, maxCharsPerLine);
  const lineHeight = fontSize * 1.3;
  const height = Math.max(fontSize + PILL_PAD_Y * 2, lines.length * lineHeight + PILL_PAD_Y * 2);
  return { width, height, fontSize, label, lines, lineHeight };
}

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.4;
const VIEWPORT_PADDING = 110;
const VIEWPORT_SCHEMA_VERSION = 2;

function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

function getCanvasMetrics(nodes: MindMapNode[], viewport: Viewport) {
  const { width: viewportWidth, height: viewportHeight } = viewport;
  if (nodes.length === 0) {
    return {
      minX: 0,
      maxX: viewportWidth,
      minY: 0,
      maxY: viewportHeight,
      width: viewportWidth,
      height: viewportHeight,
      offsetX: VIEWPORT_PADDING,
      offsetY: VIEWPORT_PADDING,
    };
  }
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const node of nodes) {
    const { width, height } = getNodeDimensions(node);
    minX = Math.min(minX, node.x - width / 2);
    maxX = Math.max(maxX, node.x + width / 2);
    minY = Math.min(minY, node.y - height / 2);
    maxY = Math.max(maxY, node.y + height / 2);
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(maxX - minX + VIEWPORT_PADDING * 2, viewportWidth * 1.5),
    height: Math.max(maxY - minY + VIEWPORT_PADDING * 2, viewportHeight * 1.5),
    offsetX: -minX + VIEWPORT_PADDING,
    offsetY: -minY + VIEWPORT_PADDING,
  };
}

function computeFittedViewport(nodes: MindMapNode[], viewport: Viewport) {
  const { width: viewportWidth, height: viewportHeight } = viewport;
  if (nodes.length === 0) return { x: viewportWidth / 2, y: viewportHeight / 3, scale: 1 };
  const metrics = getCanvasMetrics(nodes, viewport);
  const scale = clamp(
    Math.min(viewportWidth / metrics.width, (viewportHeight - 120) / metrics.height, 1),
    MIN_ZOOM,
    1,
  );
  const rootNode = nodes.find((n) => n.isCenter) ?? nodes[0];
  const rootCanvasX = metrics.offsetX + rootNode.x;
  const rootCanvasY = metrics.offsetY + rootNode.y;
  return {
    x: viewportWidth * 0.15 - rootCanvasX * scale,
    y: (viewportHeight - 120) / 2 + 60 - rootCanvasY * scale,
    scale,
  };
}

function applyAutoLayout(full: MindMapFull): { full: MindMapFull; changed: boolean } {
  if (full.nodes.length === 0) return { full, changed: false };
  const laidOutNodes = layoutMindMapGraph(full.nodes, full.edges);
  const nodeById = new Map(laidOutNodes.map((n) => [n.id, n]));
  let changed = false;
  const nextNodes = full.nodes.map((node) => {
    const laidOut = nodeById.get(node.id);
    if (!laidOut) return node;
    if (Math.abs(laidOut.x - node.x) > 0.5 || Math.abs(laidOut.y - node.y) > 0.5) changed = true;
    return { ...node, x: laidOut.x, y: laidOut.y };
  });
  return { full: { ...full, nodes: nextNodes }, changed };
}

/** Get all descendant node IDs from a set of collapsed parent IDs */
function getHiddenNodeIds(
  nodes: MindMapNode[],
  edges: MindMapEdge[],
  collapsedIds: Set<number>,
): Set<number> {
  const hidden = new Set<number>();
  const childrenOf = new Map<number, number[]>();
  for (const edge of edges) {
    if (edge.isCrossLink) continue;
    const arr = childrenOf.get(edge.sourceNodeId) ?? [];
    arr.push(edge.targetNodeId);
    childrenOf.set(edge.sourceNodeId, arr);
  }
  function hideDescendants(parentId: number) {
    const children = childrenOf.get(parentId) ?? [];
    for (const childId of children) {
      if (!hidden.has(childId)) {
        hidden.add(childId);
        hideDescendants(childId);
      }
    }
  }
  for (const id of collapsedIds) {
    hideDescendants(id);
  }
  return hidden;
}

/** Get the branch index color for a node */
function getBranchIndex(nodes: MindMapNode[], nodeId: number, edges: MindMapEdge[]): number {
  // Walk up to find the direct child of center
  let currentId = nodeId;
  const parentMap = new Map<number, number>();
  for (const edge of edges) {
    if (!edge.isCrossLink) parentMap.set(edge.targetNodeId, edge.sourceNodeId);
  }
  const centerNode = nodes.find((n) => n.isCenter);
  if (!centerNode) return 0;

  let depth = 0;
  while (depth < 20) {
    const parentId = parentMap.get(currentId);
    if (parentId === undefined || parentId === centerNode.id) break;
    currentId = parentId;
    depth++;
  }
  const nonCenterNodes = nodes.filter((n) => !n.isCenter);
  const idx = nonCenterNodes.findIndex((n) => n.id === currentId);
  return idx >= 0 ? idx : 0;
}

// ── Map List View ──────────────────────────────────────────────────────────

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

function MapListView({
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
      />
    </View>
  );
}

// ── Canvas View ────────────────────────────────────────────────────────────

function CanvasView({
  data,
  onBack,
  onRefresh,
  onRetry,
  onDelete,
}: {
  data: MindMapFull;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  onRetry?: () => void;
  onDelete?: () => void;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const viewport = useMemo(
    () => ({ width: viewportWidth, height: viewportHeight }),
    [viewportHeight, viewportWidth],
  );
  const nodes = data.nodes;
  const edges = data.edges;
  const canvasMetrics = useMemo(() => getCanvasMetrics(nodes, viewport), [nodes, viewport]);
  const canvasRef = useRef<View>(null);

  // ── Core selection state ──
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [addingThought, setAddingThought] = useState<number | null>(null);
  const [thoughtText, setThoughtText] = useState('');
  const [expandingNodeId, setExpandingNodeId] = useState<number | null>(null);

  // ── Collapse/expand ──
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());
  const hiddenNodeIds = useMemo(
    () => getHiddenNodeIds(nodes, edges, collapsedIds),
    [nodes, edges, collapsedIds],
  );

  // ── Search ──
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchLower = searchQuery.toLowerCase();
  const matchingNodeIds = useMemo(() => {
    if (!searchLower) return null;
    return new Set(
      nodes.filter((n) => n.label.toLowerCase().includes(searchLower)).map((n) => n.id),
    );
  }, [nodes, searchLower]);

  // ── Undo stack ──
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const pushUndo = useCallback((action: UndoAction) => {
    setUndoStack((prev) => [...prev.slice(-19), action]);
  }, []);

  // ── Move node ──
  const movingNodeSV = useSharedValue(-1);
  const moveAccumX = useSharedValue(0);
  const moveAccumY = useSharedValue(0);
  const [movingNodeId, setMovingNodeId] = useState<number | null>(null);
  const [moveOffset, setMoveOffset] = useState({ x: 0, y: 0 });

  // ── Viewport ──
  const translateX = useSharedValue(viewportWidth / 2);
  const translateY = useSharedValue(viewportHeight / 3);
  const scale = useSharedValue(1);
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);
  const pinchStartScale = useSharedValue(1);
  const viewportReady = useRef(false);
  const lastGraphShape = useRef({ nodeCount: nodes.length, edgeCount: edges.length });
  const lastViewport = useRef(viewport);

  // Save viewport on unmount
  useEffect(() => {
    return () => {
      saveViewport(
        data.map.id,
        JSON.stringify({
          version: VIEWPORT_SCHEMA_VERSION,
          x: translateX.value,
          y: translateY.value,
          scale: scale.value,
        }),
      ).catch(() => {});
    };
  }, [data.map.id, scale, translateX, translateY]);

  // Position viewport
  useEffect(() => {
    if (nodes.length === 0) return;
    const currentShape = { nodeCount: nodes.length, edgeCount: edges.length };
    const graphChanged =
      lastGraphShape.current.nodeCount !== currentShape.nodeCount ||
      lastGraphShape.current.edgeCount !== currentShape.edgeCount;
    const viewportChanged =
      lastViewport.current.width !== viewport.width ||
      lastViewport.current.height !== viewport.height;
    lastGraphShape.current = currentShape;
    lastViewport.current = viewport;

    if ((graphChanged || viewportChanged) && viewportReady.current) {
      const fitted = computeFittedViewport(nodes, viewport);
      translateX.value = withTiming(fitted.x, { duration: 250 });
      translateY.value = withTiming(fitted.y, { duration: 250 });
      scale.value = withTiming(fitted.scale, { duration: 250 });
      return;
    }

    if (!viewportReady.current) {
      viewportReady.current = true;
      try {
        const saved = JSON.parse(data.map.viewportJson);
        if (saved?.version === VIEWPORT_SCHEMA_VERSION && typeof saved?.x === 'number') {
          translateX.value = saved.x;
          translateY.value = saved.y;
          scale.value = clamp(saved.scale, MIN_ZOOM, MAX_ZOOM);
          return;
        }
      } catch {
        /* ignore corrupt saved viewport */
      }
      const fitted = computeFittedViewport(nodes, viewport);
      translateX.value = fitted.x;
      translateY.value = fitted.y;
      scale.value = fitted.scale;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, edges.length, viewport]);

  const centerMap = useCallback(() => {
    const fitted = computeFittedViewport(nodes, viewport);
    const timing = { duration: 300 };
    translateX.value = withTiming(fitted.x, timing);
    translateY.value = withTiming(fitted.y, timing);
    scale.value = withTiming(fitted.scale, timing);
  }, [nodes, scale, translateX, translateY, viewport]);

  const canvasStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  // ── Move node commit ──
  const commitNodeMove = useCallback(
    (dx: number, dy: number) => {
      if (movingNodeId == null) return;
      const node = nodes.find((n) => n.id === movingNodeId);
      if (!node) return;
      pushUndo({ type: 'move_node', nodeId: node.id, prevX: node.x, prevY: node.y });
      updateNodePosition(node.id, node.x + dx, node.y + dy).then(() => onRefresh());
      setMovingNodeId(null);
      setMoveOffset({ x: 0, y: 0 });
      movingNodeSV.value = -1;
      moveAccumX.value = 0;
      moveAccumY.value = 0;
    },
    [movingNodeId, nodes, pushUndo, onRefresh, movingNodeSV, moveAccumX, moveAccumY],
  );

  const onMoveOffsetUpdate = useCallback((dx: number, dy: number) => {
    setMoveOffset({ x: dx, y: dy });
  }, []);

  // ── Gestures ──
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .maxPointers(1)
        .minDistance(4)
        .onStart(() => {
          if (movingNodeSV.value >= 0) {
            panStartX.value = moveAccumX.value;
            panStartY.value = moveAccumY.value;
          } else {
            // Cancel any running decay by snapping to current value
            translateX.value = translateX.value + 0;
            translateY.value = translateY.value + 0;
            panStartX.value = translateX.value;
            panStartY.value = translateY.value;
          }
        })
        .onUpdate((event) => {
          if (movingNodeSV.value >= 0) {
            const dx = panStartX.value + event.translationX / scale.value;
            const dy = panStartY.value + event.translationY / scale.value;
            moveAccumX.value = dx;
            moveAccumY.value = dy;
            runOnJS(onMoveOffsetUpdate)(dx, dy);
          } else {
            translateX.value = panStartX.value + event.translationX;
            translateY.value = panStartY.value + event.translationY;
          }
        })
        .onEnd((event) => {
          if (movingNodeSV.value >= 0) {
            runOnJS(commitNodeMove)(moveAccumX.value, moveAccumY.value);
          } else {
            translateX.value = withDecay({ velocity: event.velocityX, deceleration: 0.992 });
            translateY.value = withDecay({ velocity: event.velocityY, deceleration: 0.992 });
          }
        }),
    [
      panStartX,
      panStartY,
      translateX,
      translateY,
      scale,
      movingNodeSV,
      moveAccumX,
      moveAccumY,
      onMoveOffsetUpdate,
      commitNodeMove,
    ],
  );

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onStart((event) => {
          pinchStartScale.value = scale.value;
          panStartX.value = (event.focalX - translateX.value) / scale.value;
          panStartY.value = (event.focalY - translateY.value) / scale.value;
        })
        .onUpdate((event) => {
          const nextScale = clamp(pinchStartScale.value * event.scale, MIN_ZOOM, MAX_ZOOM);
          scale.value = nextScale;
          translateX.value = event.focalX - panStartX.value * nextScale;
          translateY.value = event.focalY - panStartY.value * nextScale;
        }),
    [panStartX, panStartY, pinchStartScale, scale, translateX, translateY],
  );

  const doubleTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .maxDuration(300)
        .onEnd((event) => {
          if (movingNodeSV.value >= 0) return;
          const timing = { duration: 280 };
          if (scale.value > 0.9) {
            const targetScale = 1.8;
            const canvasX = (event.x - translateX.value) / scale.value;
            const canvasY = (event.y - translateY.value) / scale.value;
            scale.value = withTiming(targetScale, timing);
            translateX.value = withTiming(event.x - canvasX * targetScale, timing);
            translateY.value = withTiming(event.y - canvasY * targetScale, timing);
          } else {
            const fitted = computeFittedViewport(nodes, viewport);
            scale.value = withTiming(fitted.scale, timing);
            translateX.value = withTiming(fitted.x, timing);
            translateY.value = withTiming(fitted.y, timing);
          }
        }),
    [nodes, scale, translateX, translateY, movingNodeSV, viewport],
  );

  const gesture = useMemo(
    () => Gesture.Simultaneous(panGesture, pinchGesture, doubleTapGesture),
    [panGesture, pinchGesture, doubleTapGesture],
  );

  // ── Node interactions ──
  const handleNodeTap = useCallback((nodeId: number) => {
    setSelectedNodeId((prev) => (prev === nodeId ? null : nodeId));
    setAddingThought(null);
    setThoughtText('');
  }, []);

  // ── AI explanation (persisted to DB) ──
  useEffect(() => {
    if (selectedNodeId == null) return;
    const selectedNode = nodes.find((n) => n.id === selectedNodeId);
    if (!selectedNode || selectedNode.explanation) return;

    const parentEdge = edges.find((e) => e.targetNodeId === selectedNodeId && !e.isCrossLink);
    const parentNode = parentEdge ? nodes.find((n) => n.id === parentEdge.sourceNodeId) : undefined;
    let cancelled = false;

    explainMindMapNode(data.map.title, selectedNode.label, parentNode?.label)
      .then((explanation) => {
        if (cancelled) return;
        updateNodeExplanation(selectedNodeId, explanation).then(() => onRefresh());
      })
      .catch(() => {
        if (cancelled) return;
        const fallback = 'Short explanation unavailable. Tap again after a refresh.';
        updateNodeExplanation(selectedNodeId, fallback).then(() => onRefresh());
      });

    return () => {
      cancelled = true;
    };
  }, [data.map.title, edges, nodes, selectedNodeId, onRefresh]);

  // ── AI expand ──
  const handleAIExpand = useCallback(
    async (nodeId: number) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      setExpandingNodeId(nodeId);
      setSelectedNodeId(null);
      try {
        const layout = await expandNode(
          data.map.title,
          node.label,
          nodes.map((n) => n.label),
        );
        const insertedIds: number[] = [];
        for (const newNode of layout.nodes.slice(1)) {
          const insertedId = await addNode(data.map.id, newNode.label, node.x, node.y, {
            aiGenerated: true,
          });
          insertedIds.push(insertedId);
        }
        for (const edge of layout.edges) {
          const sourceNodeId = edge.sourceIndex === 0 ? nodeId : insertedIds[edge.sourceIndex - 1];
          const targetNodeId = edge.targetIndex === 0 ? nodeId : insertedIds[edge.targetIndex - 1];
          if (sourceNodeId != null && targetNodeId != null && sourceNodeId !== targetNodeId) {
            await addEdge(data.map.id, sourceNodeId, targetNodeId, edge.label, edge.isCrossLink);
          }
        }
        pushUndo({ type: 'expand', nodeIds: insertedIds });
        await onRefresh();
      } catch (err: any) {
        showError(err, 'AI Error');
      } finally {
        setExpandingNodeId(null);
      }
    },
    [data.map.id, data.map.title, nodes, onRefresh, pushUndo],
  );

  const handleAddThought = useCallback(
    async (parentNodeId: number) => {
      const label = thoughtText.trim();
      if (!label) return;
      const parent = nodes.find((n) => n.id === parentNodeId);
      if (!parent) return;
      const newId = await addNode(data.map.id, label, parent.x, parent.y, { aiGenerated: false });
      await addEdge(data.map.id, parentNodeId, newId);
      pushUndo({ type: 'add_node', nodeId: newId });
      setThoughtText('');
      setAddingThought(null);
      await onRefresh();
    },
    [data.map.id, nodes, onRefresh, thoughtText, pushUndo],
  );

  const handleDeleteNode = useCallback(
    async (nodeId: number) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node?.isCenter) {
        showWarning('Cannot delete', 'Center node cannot be deleted.');
        return;
      }
      if (!node) return;
      const nodeEdges = edges.filter((e) => e.sourceNodeId === nodeId || e.targetNodeId === nodeId);
      pushUndo({ type: 'delete_node', node, edges: nodeEdges });
      await deleteNode(nodeId);
      setSelectedNodeId(null);
      await onRefresh();
    },
    [nodes, edges, onRefresh, pushUndo],
  );

  // ── Undo ──
  const handleUndo = useCallback(async () => {
    const action = undoStack[undoStack.length - 1];
    if (!action) return;
    setUndoStack((prev) => prev.slice(0, -1));

    if (action.type === 'add_node') {
      await deleteNode(action.nodeId);
    } else if (action.type === 'delete_node') {
      const newId = await addNode(data.map.id, action.node.label, action.node.x, action.node.y, {
        isCenter: action.node.isCenter,
        aiGenerated: action.node.aiGenerated,
      });
      for (const edge of action.edges) {
        const src = edge.sourceNodeId === action.node.id ? newId : edge.sourceNodeId;
        const tgt = edge.targetNodeId === action.node.id ? newId : edge.targetNodeId;
        await addEdge(data.map.id, src, tgt, edge.label ?? undefined, edge.isCrossLink);
      }
    } else if (action.type === 'expand') {
      for (const nodeId of action.nodeIds) {
        await deleteNode(nodeId);
      }
    } else if (action.type === 'move_node') {
      await updateNodePosition(action.nodeId, action.prevX, action.prevY);
    }
    await onRefresh();
  }, [undoStack, data.map.id, onRefresh]);

  // ── Collapse toggle ──
  const toggleCollapse = useCallback((nodeId: number) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
    setSelectedNodeId(null);
  }, []);

  // ── Move mode ──
  const startMoveMode = useCallback(
    (nodeId: number) => {
      setSelectedNodeId(null);
      setMovingNodeId(nodeId);
      setMoveOffset({ x: 0, y: 0 });
      movingNodeSV.value = nodeId;
      moveAccumX.value = 0;
      moveAccumY.value = 0;
    },
    [movingNodeSV, moveAccumX, moveAccumY],
  );

  const cancelMoveMode = useCallback(() => {
    setMovingNodeId(null);
    setMoveOffset({ x: 0, y: 0 });
    movingNodeSV.value = -1;
    moveAccumX.value = 0;
    moveAccumY.value = 0;
  }, [movingNodeSV, moveAccumX, moveAccumY]);

  // ── Quiz from branch ──
  const handleQuizBranch = useCallback(
    async (nodeId: number) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      // Collect subtree labels for the quiz topic
      const childrenOf = new Map<number, number[]>();
      for (const e of edges) {
        if (e.isCrossLink) continue;
        const arr = childrenOf.get(e.sourceNodeId) ?? [];
        arr.push(e.targetNodeId);
        childrenOf.set(e.sourceNodeId, arr);
      }
      const subtreeIds = new Set<number>();
      const queue = [nodeId];
      while (queue.length > 0) {
        const id = queue.shift()!;
        subtreeIds.add(id);
        for (const childId of childrenOf.get(id) ?? []) {
          if (!subtreeIds.has(childId)) queue.push(childId);
        }
      }
      const topicLabels = nodes.filter((n) => subtreeIds.has(n.id)).map((n) => n.label);

      // Try to find matching syllabus topic
      const matches = await findTopicsByLabel(node.label);
      if (matches.length > 0) {
        // Navigate to session with focus on this topic
        try {
          navigation.navigate('Session', {
            mood: 'energetic',
            focusTopicId: matches[0].id,
            preferredActionType: 'study',
          });
        } catch {
          // If navigation fails (wrong stack), show info
          showWarning(
            'Quiz',
            `Topic "${matches[0].name}" found in syllabus. Go to Home → Session to study it.`,
          );
        }
      } else {
        showWarning(
          'Quiz Branch',
          `Subtree: ${topicLabels.slice(0, 5).join(', ')}${
            topicLabels.length > 5 ? '...' : ''
          }\n\nNo exact syllabus match found. Use "Ask Guru" to quiz yourself on "${node.label}".`,
        );
      }
    },
    [nodes, edges, navigation],
  );

  // ── Share as image ──
  const handleShare = useCallback(async () => {
    if (!canvasRef.current) return;
    try {
      const uri = await captureRef(canvasRef.current, {
        format: 'png',
        quality: 1,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `Mind Map: ${data.map.title}`,
        });
      }
    } catch (err: any) {
      showError(err, 'Share failed');
    }
  }, [data.map.title]);

  // ── Visible nodes/edges after collapse + search ──
  const visibleNodes = useMemo(
    () => nodes.filter((n) => !hiddenNodeIds.has(n.id)),
    [nodes, hiddenNodeIds],
  );
  const visibleEdges = useMemo(
    () =>
      edges.filter((e) => !hiddenNodeIds.has(e.sourceNodeId) && !hiddenNodeIds.has(e.targetNodeId)),
    [edges, hiddenNodeIds],
  );

  const selectedNode = visibleNodes.find((n) => n.id === selectedNodeId);
  const hasChildren = selectedNode
    ? edges.some((e) => e.sourceNodeId === selectedNode.id && !e.isCrossLink)
    : false;

  return (
    <View style={styles.canvasContainer}>
      {/* ── Header ── */}
      <View style={styles.canvasHeader}>
        <TouchableOpacity onPress={onBack} hitSlop={12} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={n.colors.textPrimary} />
        </TouchableOpacity>
        <LinearText style={styles.canvasTitle} numberOfLines={1}>
          {data.map.title}
        </LinearText>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          {undoStack.length > 0 && (
            <TouchableOpacity onPress={handleUndo} hitSlop={12}>
              <Ionicons name="arrow-undo" size={22} color={n.colors.textSecondary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setShowSearch((p) => !p)} hitSlop={12}>
            <Ionicons
              name="search-outline"
              size={22}
              color={showSearch ? n.colors.accent : n.colors.textSecondary}
            />
          </TouchableOpacity>
          {nodes.length > 0 && (
            <TouchableOpacity onPress={centerMap} hitSlop={12}>
              <Ionicons name="locate-outline" size={22} color={n.colors.textSecondary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={handleShare} hitSlop={12}>
            <Ionicons name="share-outline" size={22} color={n.colors.textSecondary} />
          </TouchableOpacity>
          {onRetry && (
            <TouchableOpacity
              onPress={async () => {
                const ok = await confirmDestructive(
                  'Remake Map',
                  'Regenerate the entire mind map structure using AI? This will replace the current map layout.',
                );
                if (ok) onRetry();
              }}
              hitSlop={12}
            >
              <Ionicons name="refresh-outline" size={22} color={n.colors.accent} />
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity onPress={onDelete} hitSlop={12}>
              <Ionicons name="trash-outline" size={22} color={n.colors.error} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Search bar ── */}
      {showSearch && (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={16} color={n.colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search nodes..."
            placeholderTextColor={n.colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={n.colors.textMuted} />
            </TouchableOpacity>
          )}
          {matchingNodeIds && (
            <LinearText style={{ color: n.colors.textMuted, fontSize: 12, marginLeft: 8 }}>
              {matchingNodeIds.size} found
            </LinearText>
          )}
        </View>
      )}

      {/* ── Empty state ── */}
      {nodes.length === 0 &&
        (() => {
          const emptyActions: EmptyStateAction[] = [];
          if (onRetry) {
            emptyActions.push({
              label: 'Regenerate',
              onPress: onRetry,
              buttonVariant: 'primary',
              icon: 'refresh',
            });
          }
          if (onDelete) {
            emptyActions.push({
              label: 'Delete Map',
              onPress: onDelete,
              buttonVariant: 'outline',
              icon: 'trash-outline',
              destructive: true,
            });
          }
          return (
            <EmptyState
              icon="alert-circle-outline"
              iconSize={48}
              iconColor={n.colors.warning}
              title="This map has no concepts yet."
              actions={emptyActions}
            />
          );
        })()}

      {/* ── Canvas ── */}
      {nodes.length > 0 && (
        <GestureDetector gesture={gesture}>
          <View style={styles.svgWrap} ref={canvasRef} collapsable={false}>
            <Animated.View
              style={[
                styles.canvasSurface,
                { width: canvasMetrics.width, height: canvasMetrics.height },
                canvasStyle,
              ]}
            >
              <Svg width={canvasMetrics.width} height={canvasMetrics.height}>
                <Defs>
                  {BRANCH_COLORS.map((bc, i) => (
                    <LinearGradient
                      key={`bg${i}`}
                      id={`branchGrad${i}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <Stop offset="0" stopColor={bc.stroke} stopOpacity="0.25" />
                      <Stop offset="1" stopColor={bc.stroke} stopOpacity="0.06" />
                    </LinearGradient>
                  ))}
                </Defs>
                <G transform={`translate(${canvasMetrics.offsetX}, ${canvasMetrics.offsetY})`}>
                  {/* ── Edges ── */}
                  {visibleEdges.map((edge) => {
                    const source = visibleNodes.find((n) => n.id === edge.sourceNodeId);
                    const target = visibleNodes.find((n) => n.id === edge.targetNodeId);
                    if (!source || !target) return null;

                    const bIdx = getBranchIndex(nodes, target.id, edges);
                    const palette = BRANCH_COLORS[Math.abs(bIdx) % BRANCH_COLORS.length];
                    const midX = (source.x + target.x) / 2;

                    // Adjust target position if it's being moved
                    const tx = target.id === movingNodeId ? target.x + moveOffset.x : target.x;
                    const ty = target.id === movingNodeId ? target.y + moveOffset.y : target.y;
                    const sx = source.id === movingNodeId ? source.x + moveOffset.x : source.x;
                    const sy = source.id === movingNodeId ? source.y + moveOffset.y : source.y;
                    const mx = (sx + tx) / 2;

                    return (
                      <G key={`e-${edge.id}`}>
                        <Path
                          d={`M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`}
                          stroke={edge.isCrossLink ? whiteAlpha['25'] : palette.fill}
                          strokeWidth={edge.isCrossLink ? 1.5 : 2}
                          fill="none"
                          strokeLinecap="round"
                          strokeDasharray={edge.isCrossLink ? '6,4' : undefined}
                          opacity={
                            matchingNodeIds &&
                            !matchingNodeIds.has(target.id) &&
                            !matchingNodeIds.has(source.id)
                              ? 0.15
                              : 0.6
                          }
                        />
                        {/* Edge label */}
                        {edge.label && (
                          <SvgText
                            x={mx}
                            y={(sy + ty) / 2 - 6}
                            textAnchor="middle"
                            fontSize={9}
                            fill={edge.isCrossLink ? whiteAlpha['40'] : palette.fill}
                            opacity={0.8}
                          >
                            {edge.label.length > 20
                              ? edge.label.slice(0, 18) + '\u2026'
                              : edge.label}
                          </SvgText>
                        )}
                      </G>
                    );
                  })}

                  {/* ── Junction dots ── */}
                  {visibleEdges
                    .filter((e) => !e.isCrossLink)
                    .map((edge) => {
                      const target = visibleNodes.find((n) => n.id === edge.targetNodeId);
                      if (!target) return null;
                      const tx = target.id === movingNodeId ? target.x + moveOffset.x : target.x;
                      const ty = target.id === movingNodeId ? target.y + moveOffset.y : target.y;
                      return (
                        <Circle
                          key={`dot-${edge.id}`}
                          cx={tx}
                          cy={ty}
                          r={3}
                          fill={whiteAlpha['30']}
                        />
                      );
                    })}

                  {/* ── Nodes ── */}
                  {visibleNodes.map((node) => {
                    const { width, height, fontSize, lines, lineHeight } = getNodeDimensions(node);
                    const isSelected = node.id === selectedNodeId;
                    const isExpanding = node.id === expandingNodeId;
                    const isCollapsed = collapsedIds.has(node.id);
                    const isMoving = node.id === movingNodeId;
                    const isDimmed = matchingNodeIds != null && !matchingNodeIds.has(node.id);
                    const bIdx = node.isCenter ? -1 : getBranchIndex(nodes, node.id, edges);
                    const palette = node.isCenter
                      ? CENTER_COLOR
                      : BRANCH_COLORS[Math.abs(bIdx) % BRANCH_COLORS.length];
                    const fillColor = node.isCenter
                      ? palette.fill
                      : isSelected
                      ? '#EFEFEF'
                      : palette.fill;
                    const strokeColor = isSelected ? '#1E1E1E' : palette.stroke;

                    const nx = isMoving ? node.x + moveOffset.x : node.x;
                    const ny = isMoving ? node.y + moveOffset.y : node.y;
                    const textBlockHeight = lines.length * lineHeight;
                    const textStartY = ny - textBlockHeight / 2 + fontSize * 0.85;

                    return (
                      <G
                        key={`n-${node.id}`}
                        onPress={() => !isMoving && handleNodeTap(node.id)}
                        opacity={isDimmed ? 0.2 : 1}
                      >
                        {/* Shadow */}
                        <Rect
                          x={nx - width / 2 + 1.5}
                          y={ny - height / 2 + 2}
                          width={width}
                          height={height}
                          rx={PILL_RADIUS}
                          ry={PILL_RADIUS}
                          fill={blackAlpha['15']}
                        />
                        {/* Expanding ring */}
                        {isExpanding && (
                          <Rect
                            x={nx - width / 2 - 4}
                            y={ny - height / 2 - 4}
                            width={width + 8}
                            height={height + 8}
                            rx={PILL_RADIUS + 2}
                            ry={PILL_RADIUS + 2}
                            fill="none"
                            stroke={n.colors.accent}
                            strokeWidth={3}
                            opacity={0.7}
                          />
                        )}
                        {/* Moving ring */}
                        {isMoving && (
                          <Rect
                            x={nx - width / 2 - 4}
                            y={ny - height / 2 - 4}
                            width={width + 8}
                            height={height + 8}
                            rx={PILL_RADIUS + 2}
                            ry={PILL_RADIUS + 2}
                            fill="none"
                            stroke={n.colors.success}
                            strokeWidth={2}
                            strokeDasharray="4,3"
                            opacity={0.8}
                          />
                        )}
                        {/* Pill */}
                        <Rect
                          x={nx - width / 2}
                          y={ny - height / 2}
                          width={width}
                          height={height}
                          rx={PILL_RADIUS}
                          ry={PILL_RADIUS}
                          fill={fillColor}
                          stroke={strokeColor}
                          strokeWidth={isSelected ? 2 : 1}
                          opacity={isExpanding ? 0.5 : 1}
                        />
                        {/* Text */}
                        {lines.map((line, li) => (
                          <SvgText
                            key={`t-${node.id}-${li}`}
                            x={nx}
                            y={textStartY + li * lineHeight}
                            textAnchor="middle"
                            fontSize={fontSize}
                            fill={palette.text}
                            fontWeight={node.isCenter ? 'bold' : '500'}
                            opacity={isExpanding ? 0.5 : 1}
                          >
                            {line}
                          </SvgText>
                        ))}
                        {/* Collapse indicator */}
                        {isCollapsed && (
                          <G transform={`translate(${nx + width / 2 - 8}, ${ny - height / 2 - 4})`}>
                            <Circle cx={0} cy={0} r={8} fill={n.colors.accent} />
                            <SvgText
                              x={0}
                              y={4}
                              textAnchor="middle"
                              fontSize={10}
                              fill="#fff"
                              fontWeight="bold"
                            >
                              +
                            </SvgText>
                          </G>
                        )}
                        {/* Expand chevron (non-center, non-collapsed, non-moving) */}
                        {!node.isCenter && !isExpanding && !isMoving && !isCollapsed && (
                          <G transform={`translate(${nx + width / 2 + 10}, ${ny})`}>
                            <Circle cx={0} cy={0} r={7} fill={fillColor} />
                            <SvgText
                              x={0}
                              y={4}
                              textAnchor="middle"
                              fontSize={10}
                              fill={palette.text}
                              fontWeight="bold"
                            >
                              &gt;
                            </SvgText>
                          </G>
                        )}
                      </G>
                    );
                  })}
                </G>
              </Svg>
            </Animated.View>

            {/* Banners */}
            {expandingNodeId != null && (
              <View style={styles.expandingBanner}>
                <ActivityIndicator size="small" color={n.colors.accent} />
                <LinearText style={styles.expandingText}>AI expanding...</LinearText>
              </View>
            )}
            {movingNodeId != null && (
              <View style={[styles.expandingBanner, { backgroundColor: 'rgba(0,100,0,0.85)' }]}>
                <Ionicons name="move" size={16} color="#fff" />
                <LinearText style={[styles.expandingText, { color: '#fff' }]}>
                  Drag to move node
                </LinearText>
                <TouchableOpacity onPress={cancelMoveMode} style={{ marginLeft: 12 }}>
                  <Ionicons name="close" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </GestureDetector>
      )}

      {/* ── Explanation card ── */}
      {selectedNode && addingThought == null && movingNodeId == null && (
        <>
          <View style={styles.explanationCard}>
            <View style={styles.explanationHeader}>
              <LinearText style={styles.explanationTitle} numberOfLines={1}>
                {selectedNode.label}
              </LinearText>
              {!selectedNode.explanation && (
                <ActivityIndicator size="small" color={n.colors.accent} />
              )}
            </View>
            <LinearText style={styles.explanationBody}>
              {selectedNode.explanation ??
                'Loading a short explanation so the node makes sense at a glance.'}
            </LinearText>
            <LinearText style={styles.explanationHint}>Tap the node again to hide this.</LinearText>
          </View>

          {/* ── Action bar ── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.actionBarScroll}
            style={styles.actionBar}
          >
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleAIExpand(selectedNode.id)}
            >
              <Ionicons name="sparkles" size={18} color={n.colors.accent} />
              <LinearText style={styles.actionBtnText}>AI Expand</LinearText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => {
                setAddingThought(selectedNode.id);
                setSelectedNodeId(null);
              }}
            >
              <Ionicons name="create-outline" size={18} color={n.colors.success} />
              <LinearText style={styles.actionBtnText}>Add Thought</LinearText>
            </TouchableOpacity>
            {hasChildren && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => toggleCollapse(selectedNode.id)}
              >
                <Ionicons
                  name={collapsedIds.has(selectedNode.id) ? 'eye-outline' : 'eye-off-outline'}
                  size={18}
                  color={n.colors.textSecondary}
                />
                <LinearText style={styles.actionBtnText}>
                  {collapsedIds.has(selectedNode.id) ? 'Expand' : 'Collapse'}
                </LinearText>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => startMoveMode(selectedNode.id)}
            >
              <Ionicons name="move-outline" size={18} color={n.colors.textSecondary} />
              <LinearText style={styles.actionBtnText}>Move</LinearText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleQuizBranch(selectedNode.id)}
            >
              <Ionicons name="school-outline" size={18} color={n.colors.warning} />
              <LinearText style={styles.actionBtnText}>Quiz</LinearText>
            </TouchableOpacity>
            {!selectedNode.isCenter && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handleDeleteNode(selectedNode.id)}
              >
                <Ionicons name="trash-outline" size={18} color={n.colors.error} />
                <LinearText style={[styles.actionBtnText, { color: n.colors.error }]}>
                  Delete
                </LinearText>
              </TouchableOpacity>
            )}
          </ScrollView>
        </>
      )}

      {/* ── Thought input ── */}
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
  const route = useRoute<RouteProp<MenuStackParamList, 'MindMap'>>();
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
        normalized.full.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })),
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
          const layoutNodes = layout.nodes.map((ln) => ({
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
          <LoadingOrb message={creating ? 'AI is mapping concepts...' : 'Loading...'} size={120} />
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

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: n.colors.background },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: n.colors.textSecondary, fontSize: 14, marginTop: 8 },

  // List
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

  // Canvas
  canvasContainer: { flex: 1 },
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
  svgWrap: { flex: 1, backgroundColor: n.colors.background, overflow: 'hidden' },
  canvasSurface: { position: 'absolute', left: 0, top: 0 },
  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.border,
    borderRadius: n.radius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  searchInput: { flex: 1, color: n.colors.textPrimary, fontSize: 14, paddingVertical: 4 },

  // Explanation + actions
  explanationCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 88,
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: whiteAlpha['8'],
    borderRadius: n.radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  explanationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  explanationTitle: { flex: 1, color: n.colors.textPrimary, fontSize: 14, fontWeight: '600' },
  explanationBody: { color: n.colors.textSecondary, fontSize: 13, lineHeight: 18 },
  explanationHint: { color: n.colors.textMuted, fontSize: 11 },
  actionBar: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    maxHeight: 56,
  },
  actionBarScroll: {
    paddingHorizontal: 16,
    gap: 10,
    alignItems: 'center',
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
  actionBtnText: { color: n.colors.textPrimary, fontSize: 13, fontWeight: '500' },

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

  // Expanding/moving banner
  expandingBanner: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: blackAlpha['80'],
    borderRadius: n.radius.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  expandingText: { color: n.colors.textSecondary, fontSize: 13 },

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
