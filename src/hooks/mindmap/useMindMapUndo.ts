import { useState, useCallback } from 'react';
import {
  MindMapNode,
  MindMapEdge,
  deleteNode,
  addNode,
  addEdge,
  updateNodePosition,
} from '../../db/queries/mindMaps';

export type UndoAction =
  | { type: 'add_node'; nodeId: number }
  | { type: 'delete_node'; node: MindMapNode; edges: MindMapEdge[] }
  | { type: 'expand'; nodeIds: number[] }
  | { type: 'move_node'; nodeId: number; prevX: number; prevY: number };

export function useMindMapUndo(mapId: number, onRefresh: () => Promise<void>) {
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);

  const pushUndo = useCallback((action: UndoAction) => {
    setUndoStack((prev) => [...prev.slice(-19), action]);
  }, []);

  const handleUndo = useCallback(async () => {
    const action = undoStack[undoStack.length - 1];
    if (!action) return;
    setUndoStack((prev) => prev.slice(0, -1));

    if (action.type === 'add_node') {
      await deleteNode(action.nodeId);
    } else if (action.type === 'delete_node') {
      const newId = await addNode(mapId, action.node.label, action.node.x, action.node.y, {
        isCenter: action.node.isCenter,
        aiGenerated: action.node.aiGenerated,
      });
      for (const edge of action.edges) {
        const src = edge.sourceNodeId === action.node.id ? newId : edge.sourceNodeId;
        const tgt = edge.targetNodeId === action.node.id ? newId : edge.targetNodeId;
        await addEdge(mapId, src, tgt, edge.label ?? undefined, edge.isCrossLink);
      }
    } else if (action.type === 'expand') {
      for (const nodeId of action.nodeIds) {
        await deleteNode(nodeId);
      }
    } else if (action.type === 'move_node') {
      await updateNodePosition(action.nodeId, action.prevX, action.prevY);
    }
    await onRefresh();
  }, [undoStack, mapId, onRefresh]);

  return { undoStack, pushUndo, handleUndo };
}
