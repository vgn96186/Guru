import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useSharedValue, withTiming, withDecay, runOnJS, useAnimatedStyle } from 'react-native-reanimated';
import { Gesture } from 'react-native-gesture-handler';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import {
  addNode,
  addEdge,
  deleteNode,
  saveViewport,
  updateNodeExplanation,
  updateNodePosition,
  findTopicsByLabel,
  type MindMapFull,
} from '../../../db/queries/mindMaps';
import { expandNode, explainMindMapNode } from '../../../services/mindMapAI';
import { showError, showWarning } from '../../../components/dialogService';
import { HomeNav } from '../../../navigation/typedHooks';
import { useMindMapUndo } from '../../../hooks/mindmap/useMindMapUndo';
import {
  getCanvasMetrics,
  computeFittedViewport,
  getHiddenNodeIds,
  clamp,
  MIN_ZOOM,
  MAX_ZOOM,
  VIEWPORT_SCHEMA_VERSION,
} from '../../../services/mindmap/layout';

export function useCanvasController({
  data,
  onRefresh,
}: {
  data: MindMapFull;
  onRefresh?: () => void;
}) {
  const navigation = HomeNav.useNav();
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
  const [, setAddingThought] = useState<number | null>(null);
  const [thoughtText, setThoughtText] = useState('');
  const [isExpandingId, setExpandingNodeId] = useState<number | null>(null);
  const [isExplainingId, setIsExplainingId] = useState<number | null>(null);

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
  const { undoStack, pushUndo, handleUndo } = useMindMapUndo(data.map.id, async () => {
    if (onRefresh) onRefresh?.();
  });

  // ── Move node ──
  const movingNodeSV = useSharedValue(-1);
  const moveAccumX = useSharedValue(0);
  const moveAccumY = useSharedValue(0);
  const [movingNodeId, setMovingNodeId] = useState<number | null>(null);
  const [, setMoveOffset] = useState({ x: 0, y: 0 });

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

  const mapId = data.map.id;
  const currentTranslateX = useRef(translateX.value);
  const currentTranslateY = useRef(translateY.value);
  const currentScale = useRef(scale.value);

  // Sync reanimated shared values to refs for the unmount effect to read safely
  useEffect(() => {
    currentTranslateX.current = translateX.value;
    currentTranslateY.current = translateY.value;
    currentScale.current = scale.value;
  });

  useEffect(() => {
    return () => {
      try {
        void saveViewport(
          mapId,
          JSON.stringify({
            version: VIEWPORT_SCHEMA_VERSION,
            x: currentTranslateX.current,
            y: currentTranslateY.current,
            scale: currentScale.current,
          }),
        );
      } catch {
        // silent
      }
    };
  }, [mapId]);

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
      updateNodePosition(node.id, node.x + dx, node.y + dy).then(() => onRefresh?.());
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

    setIsExplainingId(selectedNodeId);
    explainMindMapNode(data.map.title, selectedNode.label, parentNode?.label)
      .then((explanation) => {
        if (cancelled) return;
        updateNodeExplanation(selectedNodeId, explanation).then(() => onRefresh?.());
      })
      .catch(() => {
        if (cancelled) return;
        const fallback = 'Short explanation unavailable. Tap again after a refresh.';
        updateNodeExplanation(selectedNodeId, fallback).then(() => onRefresh?.());
      })
      .finally(() => {
        if (!cancelled) setIsExplainingId(null);
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
        await onRefresh?.();
      } catch (err: unknown) {
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
      await onRefresh?.();
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
      await onRefresh?.();
    },
    [nodes, edges, onRefresh, pushUndo],
  );

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
    } catch (err: unknown) {
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

  return {
    navigation,
    viewport,
    nodes,
    edges,
    canvasMetrics,
    canvasRef,
    hiddenNodeIds,
    searchQuery,
    setSearchQuery,
    showSearch,
    setShowSearch,
    matchingNodeIds,
    movingNodeId,
    movingNodeSV,
    moveAccumX,
    moveAccumY,
    translateX,
    translateY,
    scale,
    panStartX,
    panStartY,
    pinchStartScale,
    viewportReady,
    lastGraphShape,
    lastViewport,
    undoStack,
    pushUndoState: pushUndo,
    handleUndo,
    isExpandingId,
    selectedNodeId,
    setSelectedNodeId,
    isExplainingId,
    centerMap,
    canvasStyle,
    commitNodeMove,
    onMoveOffsetUpdate,
    panGesture,
    pinchGesture,
    doubleTapGesture,
    gesture,
    handleNodeTap,
    handleAIExpand,
    handleAddThought,
    handleDeleteNode,
    toggleCollapse,
    startMoveMode,
    cancelMoveMode,
    handleQuizBranch,
    handleShare,
    visibleNodes,
    visibleEdges,
    selectedNode: visibleNodes.find((n) => n.id === selectedNodeId),
    hasChildren: selectedNodeId ? edges.some((e) => e.sourceNodeId === selectedNodeId && !e.isCrossLink) : false,
  };
}
