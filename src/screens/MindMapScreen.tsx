import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  FlatList,
  Pressable,
  Modal,
} from 'react-native';
import LinearText from '../components/primitives/LinearText';
import Svg, {
  Rect,
  G,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
  Path,
  Circle,
} from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
  bulkUpdateNodePositions,
  saveViewport,
  type MindMap,
  type MindMapNode,
  type MindMapEdge,
  type MindMapFull,
} from '../db/queries/mindMaps';
import { generateMindMap, expandNode, explainMindMapNode } from '../services/mindMapAI';
import { layoutMindMapGraph } from '../services/mindMapLayout';
import ScreenHeader from '../components/ScreenHeader';
import ErrorBoundary from '../components/ErrorBoundary';

// ── Constants ──────────────────────────────────────────────────────────────

const NODE_FONT_SIZE = 13;
const CENTER_FONT_SIZE = 14;
const PILL_PAD_X = 16;
const PILL_PAD_Y = 12;
const PILL_RADIUS = 6;
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// NotebookLM-style solid pastels
const BRANCH_COLORS = [
  { fill: '#C1D8F0', stroke: 'transparent', text: '#1E1E1E' }, // Light Blue
  { fill: '#A3D9C3', stroke: 'transparent', text: '#1E1E1E' }, // Teal
  { fill: '#A6EAA6', stroke: 'transparent', text: '#1E1E1E' }, // Green
  { fill: '#EAD3E3', stroke: 'transparent', text: '#1E1E1E' }, // Soft Purple
  { fill: '#F2D3A8', stroke: 'transparent', text: '#1E1E1E' }, // Soft Orange
];
const CENTER_COLOR = { fill: '#B5CBE6', stroke: '#1E1E1E', text: '#1E1E1E' };

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
  }) => {
    return (
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
            onPress={() => {
              Alert.alert('Delete', `Delete "${item.title}"?`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => onDelete(item.id) },
              ]);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="trash-outline" size={20} color={n.colors.error} />
          </TouchableOpacity>
        </View>
      </Pressable>
    );
  },
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

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.4;
const VIEWPORT_PADDING = 110;
const VIEWPORT_SCHEMA_VERSION = 2;

function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

function getNodeDimensions(node: Pick<MindMapNode, 'label' | 'isCenter'>) {
  const fontSize = node.isCenter ? CENTER_FONT_SIZE : NODE_FONT_SIZE;
  const label = node.label || 'Unknown';
  const width = Math.max(label.length * fontSize * 0.6 + PILL_PAD_X * 2, 60);
  const height = fontSize + PILL_PAD_Y * 2;
  return { width, height, fontSize, label };
}

function getCanvasMetrics(nodes: MindMapNode[]) {
  if (nodes.length === 0) {
    return {
      minX: 0,
      maxX: SCREEN_W,
      minY: 0,
      maxY: SCREEN_H,
      width: SCREEN_W,
      height: SCREEN_H,
      offsetX: VIEWPORT_PADDING,
      offsetY: VIEWPORT_PADDING,
    };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

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
    width: Math.max(maxX - minX + VIEWPORT_PADDING * 2, SCREEN_W * 1.5),
    height: Math.max(maxY - minY + VIEWPORT_PADDING * 2, SCREEN_H * 1.5),
    offsetX: -minX + VIEWPORT_PADDING,
    offsetY: -minY + VIEWPORT_PADDING,
  };
}

function computeFittedViewport(nodes: MindMapNode[]) {
  if (nodes.length === 0) {
    return { x: SCREEN_W / 2, y: SCREEN_H / 3, scale: 1 };
  }
  const metrics = getCanvasMetrics(nodes);
  const contentWidth = metrics.width;
  const contentHeight = metrics.height;
  const scale = clamp(
    Math.min(SCREEN_W / contentWidth, (SCREEN_H - 120) / contentHeight, 1),
    MIN_ZOOM,
    1,
  );

  // The Animated.View is transformed as: translate(tX, tY) then scale(s).
  // Inside it, the SVG <G> further shifts nodes by (offsetX, offsetY).
  // A node at layout position (nx, ny) appears on screen at:
  //   screenX = tX + (offsetX + nx) * s
  //   screenY = tY + (offsetY + ny) * s
  // We want the root node horizontally at ~15% of screen width,
  // and vertically centred in the available area (below the header).
  const rootNode = nodes.find((node) => node.isCenter) ?? nodes[0];
  const rootCanvasX = metrics.offsetX + rootNode.x;
  const rootCanvasY = metrics.offsetY + rootNode.y;

  return {
    x: SCREEN_W * 0.15 - rootCanvasX * scale,
    y: (SCREEN_H - 120) / 2 + 60 - rootCanvasY * scale,
    scale,
  };
}

function applyAutoLayout(full: MindMapFull): { full: MindMapFull; changed: boolean } {
  if (full.nodes.length === 0) {
    return { full, changed: false };
  }

  const laidOutNodes = layoutMindMapGraph(full.nodes, full.edges);
  const nodeById = new Map(laidOutNodes.map((node) => [node.id, node]));
  let changed = false;

  const nextNodes = full.nodes.map((node) => {
    const laidOut = nodeById.get(node.id);
    if (!laidOut) {
      return node;
    }

    if (Math.abs(laidOut.x - node.x) > 0.5 || Math.abs(laidOut.y - node.y) > 0.5) {
      changed = true;
    }

    return {
      ...node,
      x: laidOut.x,
      y: laidOut.y,
    };
  });

  return {
    full: {
      ...full,
      nodes: nextNodes,
    },
    changed,
  };
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
  const nodes = data.nodes;
  const edges = data.edges;
  const canvasMetrics = useMemo(() => getCanvasMetrics(nodes), [nodes]);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [addingThought, setAddingThought] = useState<number | null>(null);
  const [thoughtText, setThoughtText] = useState('');
  const [expandingNodeId, setExpandingNodeId] = useState<number | null>(null);
  const [nodeExplanationCache, setNodeExplanationCache] = useState<Record<number, string>>({});
  const [explanationLoadingNodeId, setExplanationLoadingNodeId] = useState<number | null>(null);

  const translateX = useSharedValue(SCREEN_W / 2);
  const translateY = useSharedValue(SCREEN_H / 3);
  const scale = useSharedValue(1);
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);
  const pinchStartScale = useSharedValue(1);

  // Track whether viewport has been positioned for the current map
  const viewportReady = useRef(false);
  // Track the last graph shape so we can detect when nodes/edges are added
  const lastGraphShape = useRef({ nodeCount: nodes.length, edgeCount: edges.length });

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

  // Position viewport: on first mount and when graph topology changes
  useEffect(() => {
    if (nodes.length === 0) {
      return;
    }

    const currentShape = { nodeCount: nodes.length, edgeCount: edges.length };
    const graphChanged =
      lastGraphShape.current.nodeCount !== currentShape.nodeCount ||
      lastGraphShape.current.edgeCount !== currentShape.edgeCount;
    lastGraphShape.current = currentShape;

    // If graph topology changed after initial load, re-center with animation
    if (graphChanged && viewportReady.current) {
      const fitted = computeFittedViewport(nodes);
      translateX.value = withTiming(fitted.x, { duration: 250 });
      translateY.value = withTiming(fitted.y, { duration: 250 });
      scale.value = withTiming(fitted.scale, { duration: 250 });
      return;
    }

    // First time: try restoring saved viewport
    if (!viewportReady.current) {
      viewportReady.current = true;

      try {
        const saved = JSON.parse(data.map.viewportJson);
        if (
          saved?.version === VIEWPORT_SCHEMA_VERSION &&
          typeof saved?.x === 'number' &&
          typeof saved?.y === 'number' &&
          typeof saved?.scale === 'number'
        ) {
          translateX.value = saved.x;
          translateY.value = saved.y;
          scale.value = clamp(saved.scale, MIN_ZOOM, MAX_ZOOM);
          return;
        }
      } catch {}

      // No saved viewport — compute from scratch
      const fitted = computeFittedViewport(nodes);
      translateX.value = fitted.x;
      translateY.value = fitted.y;
      scale.value = fitted.scale;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, edges.length]);

  const centerMap = useCallback(() => {
    const fitted = computeFittedViewport(nodes);
    const timing = { duration: 300 };
    translateX.value = withTiming(fitted.x, timing);
    translateY.value = withTiming(fitted.y, timing);
    scale.value = withTiming(fitted.scale, timing);
  }, [nodes, scale, translateX, translateY]);

  const canvasStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .maxPointers(1)
        .minDistance(4)
        .onStart(() => {
          panStartX.value = translateX.value;
          panStartY.value = translateY.value;
        })
        .onUpdate((event) => {
          translateX.value = panStartX.value + event.translationX;
          translateY.value = panStartY.value + event.translationY;
        }),
    [panStartX, panStartY, translateX, translateY],
  );

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onStart((event) => {
          pinchStartScale.value = scale.value;
          // Store the canvas-space point under the initial focal.
          // With transform translate(tX,tY)→scale(s), screen→canvas is:
          //   canvasX = (screenX - tX) / s
          panStartX.value = (event.focalX - translateX.value) / scale.value;
          panStartY.value = (event.focalY - translateY.value) / scale.value;
        })
        .onUpdate((event) => {
          const nextScale = clamp(pinchStartScale.value * event.scale, MIN_ZOOM, MAX_ZOOM);
          // Keep the same canvas point pinned under the (initial) focal:
          //   screenFocal = tX + canvasX * s  →  tX = screenFocal - canvasX * s
          scale.value = nextScale;
          translateX.value = event.focalX - panStartX.value * nextScale;
          translateY.value = event.focalY - panStartY.value * nextScale;
        }),
    [panStartX, panStartY, pinchStartScale, scale, translateX, translateY],
  );

  const gesture = useMemo(
    () => Gesture.Simultaneous(panGesture, pinchGesture),
    [panGesture, pinchGesture],
  );

  const handleNodeTap = useCallback((nodeId: number) => {
    setSelectedNodeId((prev) => (prev === nodeId ? null : nodeId));
    setAddingThought(null);
    setThoughtText('');
  }, []);

  useEffect(() => {
    if (selectedNodeId == null || nodeExplanationCache[selectedNodeId]) {
      return;
    }

    const selectedNode = nodes.find((node) => node.id === selectedNodeId);
    if (!selectedNode) {
      return;
    }

    const parentEdge = edges.find((edge) => edge.targetNodeId === selectedNodeId);
    const parentNode = parentEdge
      ? nodes.find((node) => node.id === parentEdge.sourceNodeId)
      : undefined;
    let cancelled = false;
    setExplanationLoadingNodeId(selectedNodeId);

    explainMindMapNode(data.map.title, selectedNode.label, parentNode?.label)
      .then((explanation) => {
        if (cancelled) {
          return;
        }
        setNodeExplanationCache((current) => ({
          ...current,
          [selectedNodeId]: explanation,
        }));
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setNodeExplanationCache((current) => ({
          ...current,
          [selectedNodeId]: 'Short explanation unavailable. Tap again after a refresh.',
        }));
      })
      .finally(() => {
        if (!cancelled) {
          setExplanationLoadingNodeId((current) => (current === selectedNodeId ? null : current));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [data.map.title, edges, nodeExplanationCache, nodes, selectedNodeId]);

  const handleAIExpand = useCallback(
    async (nodeId: number) => {
      const node = nodes.find((candidate) => candidate.id === nodeId);
      if (!node) {
        return;
      }

      setExpandingNodeId(nodeId);
      setSelectedNodeId(null);

      try {
        const layout = await expandNode(
          data.map.title,
          node.label,
          nodes.map((candidate) => candidate.label),
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
            await addEdge(data.map.id, sourceNodeId, targetNodeId, edge.label);
          }
        }

        await onRefresh();
      } catch (err: any) {
        Alert.alert('AI Error', err.message || 'Failed to expand node');
      } finally {
        setExpandingNodeId(null);
      }
    },
    [data.map.id, data.map.title, nodes, onRefresh],
  );

  const handleAddThought = useCallback(
    async (parentNodeId: number) => {
      const label = thoughtText.trim();
      if (!label) {
        return;
      }

      const parent = nodes.find((candidate) => candidate.id === parentNodeId);
      if (!parent) {
        return;
      }

      const newId = await addNode(data.map.id, label, parent.x, parent.y, { aiGenerated: false });
      await addEdge(data.map.id, parentNodeId, newId);
      setThoughtText('');
      setAddingThought(null);
      await onRefresh();
    },
    [data.map.id, nodes, onRefresh, thoughtText],
  );

  const handleDeleteNode = useCallback(
    async (nodeId: number) => {
      const node = nodes.find((candidate) => candidate.id === nodeId);
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

  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  const selectedExplanation = selectedNodeId != null ? nodeExplanationCache[selectedNodeId] : null;

  return (
    <View style={styles.canvasContainer}>
      <View style={styles.canvasHeader}>
        <TouchableOpacity onPress={onBack} hitSlop={12} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={n.colors.textPrimary} />
        </TouchableOpacity>
        <LinearText style={styles.canvasTitle} numberOfLines={1}>
          {data.map.title}
        </LinearText>
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
          {nodes.length > 0 && (
            <TouchableOpacity onPress={centerMap} hitSlop={12}>
              <Ionicons name="locate-outline" size={22} color={n.colors.textSecondary} />
            </TouchableOpacity>
          )}
          {onRetry && (
            <TouchableOpacity
              onPress={() => {
                Alert.alert(
                  'Remake Map',
                  'Regenerate the entire mind map structure using AI? This will replace the current map layout.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Regenerate', style: 'destructive', onPress: onRetry },
                  ],
                );
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

      {nodes.length === 0 && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons
            name="alert-circle-outline"
            size={48}
            color={n.colors.warning}
            style={{ marginBottom: 16 }}
          />
          <LinearText
            variant="body"
            style={{ color: n.colors.textSecondary, textAlign: 'center', marginBottom: 8 }}
          >
            This map has no concepts yet.
          </LinearText>
          <LinearText
            variant="caption"
            tone="muted"
            style={{ textAlign: 'center', marginBottom: 24 }}
          >
            The AI generation may have failed. Tap below to try again.
          </LinearText>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {onRetry && (
              <TouchableOpacity
                onPress={onRetry}
                style={styles.emptyStatePrimaryBtn}
                activeOpacity={0.8}
              >
                <Ionicons name="refresh" size={16} color="#fff" />
                <LinearText variant="label" style={{ color: n.colors.textPrimary }}>
                  Regenerate
                </LinearText>
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity
                onPress={onDelete}
                style={styles.emptyStateDeleteBtn}
                activeOpacity={0.8}
              >
                <Ionicons name="trash-outline" size={16} color={n.colors.error} />
                <LinearText variant="label" style={{ color: n.colors.error }}>
                  Delete Map
                </LinearText>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <GestureDetector gesture={gesture}>
        <View style={styles.svgWrap}>
          <Animated.View
            style={[
              styles.canvasSurface,
              {
                width: canvasMetrics.width,
                height: canvasMetrics.height,
              },
              canvasStyle,
            ]}
          >
            <Svg width={canvasMetrics.width} height={canvasMetrics.height}>
              <Defs>
                {BRANCH_COLORS.map((branchColor, index) => (
                  <LinearGradient
                    key={`bg${index}`}
                    id={`branchGrad${index}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <Stop offset="0" stopColor={branchColor.stroke} stopOpacity="0.25" />
                    <Stop offset="1" stopColor={branchColor.stroke} stopOpacity="0.06" />
                  </LinearGradient>
                ))}
              </Defs>
              <G transform={`translate(${canvasMetrics.offsetX}, ${canvasMetrics.offsetY})`}>
                {edges.map((edge) => {
                  const source = nodes.find((node) => node.id === edge.sourceNodeId);
                  const target = nodes.find((node) => node.id === edge.targetNodeId);
                  if (!source || !target) {
                    return null;
                  }

                  const branchAnchorId = source.isCenter ? target.id : source.id;
                  const branchIndex = nodes
                    .filter((node) => !node.isCenter)
                    .findIndex((node) => node.id === branchAnchorId);
                  const palette = BRANCH_COLORS[Math.abs(branchIndex) % BRANCH_COLORS.length];
                  const midX = (source.x + target.x) / 2;

                  return (
                    <Path
                      key={`e-${edge.id}`}
                      d={`M ${source.x} ${source.y} C ${midX} ${source.y}, ${midX} ${target.y}, ${target.x} ${target.y}`}
                      stroke={palette.fill}
                      strokeWidth={2}
                      fill="none"
                      strokeLinecap="round"
                      opacity={0.6}
                    />
                  );
                })}

                {edges.map((edge) => {
                  const target = nodes.find((node) => node.id === edge.targetNodeId);
                  if (!target) {
                    return null;
                  }
                  return (
                    <Circle
                      key={`dot-${edge.id}`}
                      cx={target.x}
                      cy={target.y}
                      r={3}
                      fill="rgba(255,255,255,0.3)"
                    />
                  );
                })}

                {nodes.map((node) => {
                  const { width, height, fontSize, label } = getNodeDimensions(node);
                  const isSelected = node.id === selectedNodeId;
                  const isExpanding = node.id === expandingNodeId;
                  const nonCenterIndex = nodes
                    .filter((candidate) => !candidate.isCenter)
                    .indexOf(node);
                  const palette = node.isCenter
                    ? CENTER_COLOR
                    : BRANCH_COLORS[Math.abs(nonCenterIndex) % BRANCH_COLORS.length];
                  const fillColor = node.isCenter
                    ? palette.fill
                    : isSelected
                      ? '#EFEFEF'
                      : palette.fill;
                  const strokeColor = isSelected ? '#1E1E1E' : palette.stroke;

                  return (
                    <G
                      key={`n-${node.id}`}
                      onPress={() => handleNodeTap(node.id)}
                      onLongPress={() => handleAIExpand(node.id)}
                      delayLongPress={350}
                    >
                      <Rect
                        x={node.x - width / 2 + 1.5}
                        y={node.y - height / 2 + 2}
                        width={width}
                        height={height}
                        rx={PILL_RADIUS}
                        ry={PILL_RADIUS}
                        fill="rgba(0,0,0,0.15)"
                      />
                      {isExpanding && (
                        <Rect
                          x={node.x - width / 2 - 4}
                          y={node.y - height / 2 - 4}
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
                      <Rect
                        x={node.x - width / 2}
                        y={node.y - height / 2}
                        width={width}
                        height={height}
                        rx={PILL_RADIUS}
                        ry={PILL_RADIUS}
                        fill={fillColor}
                        stroke={strokeColor}
                        strokeWidth={isSelected ? 2 : 1}
                        opacity={isExpanding ? 0.5 : 1}
                      />
                      <SvgText
                        x={node.x}
                        y={node.y + fontSize * 0.35}
                        textAnchor="middle"
                        fontSize={fontSize}
                        fill={palette.text}
                        fontWeight={node.isCenter ? 'bold' : '500'}
                        opacity={isExpanding ? 0.5 : 1}
                      >
                        {label}
                      </SvgText>
                      {!node.isCenter && !isExpanding && (
                        <G transform={`translate(${node.x + width / 2 + 10}, ${node.y})`}>
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
                      {node.isCenter && !isExpanding && (
                        <G transform={`translate(${node.x - width / 2 - 10}, ${node.y})`}>
                          <Circle cx={0} cy={0} r={7} fill={fillColor} />
                          <SvgText
                            x={0}
                            y={4}
                            textAnchor="middle"
                            fontSize={10}
                            fill={palette.text}
                            fontWeight="bold"
                          >
                            &lt;
                          </SvgText>
                        </G>
                      )}
                    </G>
                  );
                })}
              </G>
            </Svg>
          </Animated.View>

          {expandingNodeId != null && (
            <View style={styles.expandingBanner}>
              <ActivityIndicator size="small" color={n.colors.accent} />
              <LinearText style={styles.expandingText}>AI expanding...</LinearText>
            </View>
          )}
        </View>
      </GestureDetector>

      {selectedNode && addingThought == null && (
        <>
          <View style={styles.explanationCard}>
            <View style={styles.explanationHeader}>
              <LinearText style={styles.explanationTitle} numberOfLines={1}>
                {selectedNode.label}
              </LinearText>
              {explanationLoadingNodeId === selectedNode.id && (
                <ActivityIndicator size="small" color={n.colors.accent} />
              )}
            </View>
            <LinearText style={styles.explanationBody}>
              {selectedExplanation ??
                'Loading a short explanation so the node makes sense at a glance.'}
            </LinearText>
            <LinearText style={styles.explanationHint}>Tap the node again to hide this.</LinearText>
          </View>
          <View style={styles.actionBar}>
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
          </View>
        </>
      )}

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
  const [maps, setMaps] = useState<MindMap[]>([]);
  const [activeMapData, setActiveMapData] = useState<MindMapFull | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadMapWithLayout = useCallback(async (mapId: number) => {
    const full = await loadFullMindMap(mapId);
    if (!full) {
      return null;
    }

    const normalized = applyAutoLayout(full);
    if (normalized.changed) {
      await bulkUpdateNodePositions(
        full.map.id,
        normalized.full.nodes.map((node) => ({
          id: node.id,
          x: node.x,
          y: node.y,
        })),
      );
      return {
        ...normalized.full,
        map: {
          ...normalized.full.map,
          viewportJson: '',
        },
      };
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
      await bulkInsertNodesAndEdges(mapId, layoutNodes, layout.edges);
      await openMap(mapId);
    } catch (err: any) {
      Alert.alert(
        'Regeneration Failed',
        err.message || 'AI could not generate a mind map. Try again later.',
      );
    } finally {
      setCreating(false);
    }
  }, [openMap]);

  const deleteActiveMap = useCallback(() => {
    const current = activeMapRef.current;
    if (!current) return;
    Alert.alert('Delete Map', `Are you sure you want to delete "${current.map.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteMindMap(current.map.id);
          setActiveMapData(null);
          await refreshList();
        },
      },
    ]);
  }, [refreshList]);

  const recreateMapItem = useCallback(
    async (mapId: number, title: string) => {
      Alert.alert(
        'Recreate Map',
        `Are you sure you want to completely regenerate "${title}" with AI? This will replace the current map layout.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Regenerate',
            onPress: async () => {
              setCreating(true);
              try {
                const layout = await generateMindMap(title);
                const layoutNodes = layout.nodes.map((ln) => ({
                  label: ln.label,
                  x: ln.x,
                  y: ln.y,
                  isCenter: ln.isCenter,
                }));
                await bulkInsertNodesAndEdges(mapId, layoutNodes, layout.edges);
                await refreshList();
              } catch (err: any) {
                Alert.alert(
                  'Regeneration Failed',
                  err.message || 'AI could not generate a mind map. Try again later.',
                );
              } finally {
                setCreating(false);
              }
            },
          },
        ],
      );
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

      // Generate AI layout first before committing to DB
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
          <LinearText style={styles.loadingText}>
            {creating ? 'AI is mapping concepts...' : 'Loading...'}
          </LinearText>
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
      <ScreenHeader title="Mind Map" />
      <MapListView
        maps={maps}
        onSelect={openMap}
        onNew={handleNew}
        onDelete={handleDelete}
        onRecreate={recreateMapItem}
      />

      {/* New map dialog (Android-compatible) */}
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
    overflow: 'hidden',
  },
  canvasSurface: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  emptyStatePrimaryBtn: {
    backgroundColor: n.colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: n.radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  emptyStateDeleteBtn: {
    backgroundColor: 'rgba(255,80,80,0.15)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: n.radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  // Action bar
  explanationCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 88,
    backgroundColor: 'rgba(7, 10, 16, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
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
  explanationTitle: {
    flex: 1,
    color: n.colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  explanationBody: {
    color: n.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  explanationHint: {
    color: n.colors.textMuted,
    fontSize: 11,
  },
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
