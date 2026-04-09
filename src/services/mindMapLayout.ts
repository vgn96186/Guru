export interface LayoutNode {
  id: number;
  label: string;
  x: number;
  y: number;
  isCenter: boolean;
  createdAt?: number;
}

export interface LayoutEdge {
  sourceNodeId: number;
  targetNodeId: number;
}

export interface NodeBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface PositionedLayoutNode extends LayoutNode {
  bounds: NodeBounds;
}

interface TreeNode extends LayoutNode {
  children: TreeNode[];
  depth: number;
  preferredY: number;
  bounds: NodeBounds;
  subtreeTop: number;
  subtreeBottom: number;
}

const ROOT_X = 0;
const MIN_LEVEL_GAP = 48; // minimum horizontal gap between node edges
const SUBTREE_GAP_Y = 28;
const PILL_HORIZONTAL_PADDING = 32;
const MIN_NODE_WIDTH = 60;
const MAX_NODE_WIDTH = 220; // clamp very long labels

function estimateNodeSize(node: LayoutNode) {
  const fontSize = node.isCenter ? 14 : 13;
  const charWidth = fontSize * 0.6;
  const rawWidth = node.label.length * charWidth + PILL_HORIZONTAL_PADDING;
  const width = Math.min(Math.max(rawWidth, MIN_NODE_WIDTH), MAX_NODE_WIDTH);
  const height = fontSize + 24;

  return { width, height };
}

function makeBounds(node: LayoutNode): NodeBounds {
  const { width, height } = estimateNodeSize(node);
  return {
    left: node.x - width / 2,
    right: node.x + width / 2,
    top: node.y - height / 2,
    bottom: node.y + height / 2,
  };
}

export function rectanglesOverlap(a: NodeBounds, b: NodeBounds) {
  return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
}

function cloneTreeNode(node: LayoutNode, depth: number): TreeNode {
  const cloned: TreeNode = {
    ...node,
    children: [],
    depth,
    preferredY: node.y,
    bounds: makeBounds(node),
    subtreeTop: 0,
    subtreeBottom: 0,
  };
  cloned.subtreeTop = cloned.bounds.top;
  cloned.subtreeBottom = cloned.bounds.bottom;
  return cloned;
}

function buildTree(nodes: LayoutNode[], edges: LayoutEdge[]): TreeNode {
  const root = nodes.find((node) => node.isCenter) ?? nodes[0];
  const byId = new Map<number, TreeNode>();

  // First pass: create root at depth 0
  byId.set(root.id, cloneTreeNode(root, 0));

  const outgoing = new Map<number, number[]>();
  for (const edge of edges) {
    const targets = outgoing.get(edge.sourceNodeId) ?? [];
    targets.push(edge.targetNodeId);
    outgoing.set(edge.sourceNodeId, targets);
  }

  // BFS to assign depths and build tree
  const visited = new Set<number>([root.id]);
  const queue = [root.id];

  while (queue.length > 0) {
    const sourceId = queue.shift()!;
    const source = byId.get(sourceId)!;
    const childIds = (outgoing.get(sourceId) ?? []).filter((id) => !visited.has(id));

    // Create child nodes at parent depth + 1
    for (const childId of childIds) {
      const originalNode = nodes.find((n) => n.id === childId);
      if (!originalNode) continue;
      byId.set(childId, cloneTreeNode(originalNode, source.depth + 1));
    }

    // Sort children by preferred y, then by creation order
    const sortedChildIds = childIds
      .filter((id) => byId.has(id))
      .sort((a, b) => {
        const left = byId.get(a)!;
        const right = byId.get(b)!;
        if (left.preferredY === right.preferredY) {
          return (left.createdAt ?? left.id) - (right.createdAt ?? right.id);
        }
        return left.preferredY - right.preferredY;
      });

    for (const childId of sortedChildIds) {
      visited.add(childId);
      queue.push(childId);
      source.children.push(byId.get(childId)!);
    }
  }

  return byId.get(root.id)!;
}

function shiftSubtree(node: TreeNode, deltaY: number) {
  node.y += deltaY;
  node.preferredY += deltaY;
  node.bounds = makeBounds(node);
  node.subtreeTop += deltaY;
  node.subtreeBottom += deltaY;

  for (const child of node.children) {
    shiftSubtree(child, deltaY);
  }
}

/** Collect the maximum half-width at each depth level */
function collectMaxHalfWidths(node: TreeNode, depthWidths: Map<number, number>) {
  const { width } = estimateNodeSize(node);
  const halfW = width / 2;
  const current = depthWidths.get(node.depth) ?? 0;
  if (halfW > current) {
    depthWidths.set(node.depth, halfW);
  }
  for (const child of node.children) {
    collectMaxHalfWidths(child, depthWidths);
  }
}

/** Compute x center for each depth so no depth band overlaps the previous */
function computeDepthXPositions(depthWidths: Map<number, number>): Map<number, number> {
  const depths = [...depthWidths.keys()].sort((a, b) => a - b);
  const depthX = new Map<number, number>();

  if (depths.length === 0) return depthX;

  depthX.set(depths[0], ROOT_X);

  for (let i = 1; i < depths.length; i++) {
    const prevDepth = depths[i - 1];
    const curDepth = depths[i];
    const prevHalfW = depthWidths.get(prevDepth) ?? 0;
    const curHalfW = depthWidths.get(curDepth) ?? 0;
    const prevX = depthX.get(prevDepth) ?? 0;
    depthX.set(curDepth, prevX + prevHalfW + MIN_LEVEL_GAP + curHalfW);
  }

  return depthX;
}

/** Assign y positions recursively (vertical packing), x is set later */
function layoutVertical(node: TreeNode) {
  node.bounds = makeBounds(node);
  node.subtreeTop = node.bounds.top;
  node.subtreeBottom = node.bounds.bottom;

  if (node.children.length === 0) return;

  let previousBottom = Number.NEGATIVE_INFINITY;

  for (const child of node.children) {
    layoutVertical(child);
    const requiredTop = previousBottom + SUBTREE_GAP_Y;
    if (child.subtreeTop < requiredTop) {
      shiftSubtree(child, requiredTop - child.subtreeTop);
    }
    previousBottom = child.subtreeBottom;
  }

  // Center parent vertically among its children
  const firstChild = node.children[0];
  const lastChild = node.children[node.children.length - 1];
  const childrenMidY = (firstChild.y + lastChild.y) / 2;
  const deltaY = childrenMidY - node.y;
  node.y += deltaY;
  node.preferredY += deltaY;
  node.bounds = makeBounds(node);

  node.subtreeTop = Math.min(node.bounds.top, firstChild.subtreeTop);
  node.subtreeBottom = Math.max(node.bounds.bottom, lastChild.subtreeBottom);
}

/** Assign x positions from the depth map */
function assignXPositions(node: TreeNode, depthX: Map<number, number>) {
  node.x = depthX.get(node.depth) ?? ROOT_X;
  node.bounds = makeBounds(node);
  for (const child of node.children) {
    assignXPositions(child, depthX);
  }
}

function flattenTree(node: TreeNode, acc: PositionedLayoutNode[]) {
  acc.push({
    id: node.id,
    label: node.label,
    x: node.x,
    y: node.y,
    isCenter: node.isCenter,
    createdAt: node.createdAt,
    bounds: node.bounds,
  });

  for (const child of node.children) {
    flattenTree(child, acc);
  }
}

export function layoutMindMapGraph(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
): PositionedLayoutNode[] {
  if (nodes.length === 0) return [];

  const root = buildTree(nodes, edges);
  root.y = root.isCenter ? 0 : root.y;
  root.preferredY = root.y;

  // 1. Vertical packing (assigns y, uses placeholder x)
  layoutVertical(root);

  // 2. Compute per-depth x based on actual node widths
  const depthWidths = new Map<number, number>();
  collectMaxHalfWidths(root, depthWidths);
  const depthX = computeDepthXPositions(depthWidths);

  // 3. Assign final x positions
  assignXPositions(root, depthX);

  // 4. Flatten
  const positioned: PositionedLayoutNode[] = [];
  flattenTree(root, positioned);
  const positionedIds = new Set(positioned.map((n) => n.id));

  // Handle detached nodes (not reachable from root)
  const detached = nodes
    .filter((node) => !positionedIds.has(node.id))
    .sort((left, right) => left.y - right.y)
    .map((node, index) => {
      const firstLevelX = depthX.get(1) ?? 320;
      const fallbackNode = {
        ...node,
        x: firstLevelX,
        y: root.subtreeBottom + 80 + index * 72,
      };
      return {
        ...fallbackNode,
        bounds: makeBounds(fallbackNode),
      };
    });

  return [...positioned, ...detached];
}

export function relayoutMindMap(nodes: LayoutNode[], edges: LayoutEdge[]): LayoutNode[] {
  return layoutMindMapGraph(nodes, edges).map(({ bounds: _bounds, ...node }) => node);
}
