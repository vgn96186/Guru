import { mindMapsRepositoryDrizzle } from '../repositories/mindMapsRepository.drizzle';

// ── Types ──────────────────────────────────────────────────────────────────

export interface MindMap {
  id: number;
  title: string;
  subjectId: number | null;
  topicId: number | null;
  viewportJson: string;
  createdAt: number;
  updatedAt: number;
}

export interface MindMapNode {
  id: number;
  mapId: number;
  topicId: number | null;
  label: string;
  x: number;
  y: number;
  color: string | null;
  isCenter: boolean;
  aiGenerated: boolean;
  explanation: string | null;
  createdAt: number;
}

export interface MindMapEdge {
  id: number;
  mapId: number;
  sourceNodeId: number;
  targetNodeId: number;
  label: string | null;
  isCrossLink: boolean;
  createdAt: number;
}

export interface MindMapFull {
  map: MindMap;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
}

// ── Queries ────────────────────────────────────────────────────────────────

export function listMindMaps() {
  return mindMapsRepositoryDrizzle.listMindMaps();
}

export function createMindMap(title: string, subjectId?: number | null, topicId?: number | null) {
  return mindMapsRepositoryDrizzle.createMindMap(title, subjectId, topicId);
}

export function deleteMindMap(mapId: number) {
  return mindMapsRepositoryDrizzle.deleteMindMap(mapId);
}

export function touchMindMap(mapId: number) {
  return mindMapsRepositoryDrizzle.touchMindMap(mapId);
}

export function saveViewport(mapId: number, viewportJson: string) {
  return mindMapsRepositoryDrizzle.saveViewport(mapId, viewportJson);
}

export function addNode(
  mapId: number,
  label: string,
  x: number,
  y: number,
  opts?: { topicId?: number; color?: string; isCenter?: boolean; aiGenerated?: boolean },
) {
  return mindMapsRepositoryDrizzle.addNode(mapId, label, x, y, opts);
}

export function updateNodePosition(nodeId: number, x: number, y: number) {
  return mindMapsRepositoryDrizzle.updateNodePosition(nodeId, x, y);
}

export function bulkUpdateNodePositions(
  mapId: number,
  positions: Array<{ id: number; x: number; y: number }>,
) {
  return mindMapsRepositoryDrizzle.bulkUpdateNodePositions(mapId, positions);
}

export function updateNodeLabel(nodeId: number, label: string) {
  return mindMapsRepositoryDrizzle.updateNodeLabel(nodeId, label);
}

export function updateNodeExplanation(nodeId: number, explanation: string) {
  return mindMapsRepositoryDrizzle.updateNodeExplanation(nodeId, explanation);
}

export function deleteNode(nodeId: number) {
  return mindMapsRepositoryDrizzle.deleteNode(nodeId);
}

export function addEdge(
  mapId: number,
  sourceNodeId: number,
  targetNodeId: number,
  label?: string,
  isCrossLink?: boolean,
) {
  return mindMapsRepositoryDrizzle.addEdge(mapId, sourceNodeId, targetNodeId, label, isCrossLink);
}

export function deleteEdge(edgeId: number) {
  return mindMapsRepositoryDrizzle.deleteEdge(edgeId);
}

export function loadFullMindMap(mapId: number) {
  return mindMapsRepositoryDrizzle.loadFullMindMap(mapId);
}

export function clearMindMapContents(mapId: number) {
  return mindMapsRepositoryDrizzle.clearMindMapContents(mapId);
}

export function bulkInsertNodesAndEdges(
  mapId: number,
  nodes: Array<{
    label: string;
    x: number;
    y: number;
    color?: string;
    isCenter?: boolean;
    topicId?: number;
  }>,
  edges: Array<{ sourceIndex: number; targetIndex: number; label?: string; isCrossLink?: boolean }>,
) {
  return mindMapsRepositoryDrizzle.bulkInsertNodesAndEdges(mapId, nodes, edges);
}

export function findTopicsByLabel(label: string) {
  return mindMapsRepositoryDrizzle.findTopicsByLabel(label);
}
