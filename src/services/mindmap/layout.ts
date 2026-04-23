import { MindMapNode, MindMapEdge, MindMapFull } from '../../db/queries/mindMaps';
import { layoutMindMapGraph } from '../mindMapLayout';

export const NODE_FONT_SIZE = 13;
export const CENTER_FONT_SIZE = 14;
export const PILL_PAD_X = 16;
export const PILL_PAD_Y = 12;
export const PILL_RADIUS = 6;
export const MAX_NODE_WIDTH = 220;

export const MIN_ZOOM = 0.35;
export const MAX_ZOOM = 2.4;
export const VIEWPORT_PADDING = 110;
export const VIEWPORT_SCHEMA_VERSION = 2;

export type Viewport = { width: number; height: number };

export function wrapText(text: string, maxChars: number): string[] {
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

export function getNodeDimensions(node: Pick<MindMapNode, 'label' | 'isCenter'>) {
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

export function clamp(value: number, min: number, max: number) {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

export function getCanvasMetrics(nodes: MindMapNode[], viewport: Viewport) {
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

export function computeFittedViewport(nodes: MindMapNode[], viewport: Viewport) {
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

export function applyAutoLayout(full: MindMapFull): { full: MindMapFull; changed: boolean } {
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
export function getHiddenNodeIds(
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
export function getBranchIndex(nodes: MindMapNode[], nodeId: number, edges: MindMapEdge[]): number {
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
