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
  preferredY: number;
  bounds: NodeBounds;
  subtreeTop: number;
  subtreeBottom: number;
}

const ROOT_X = 0;
const LEVEL_SPACING = 320;
const SUBTREE_GAP_Y = 28;
const PILL_HORIZONTAL_PADDING = 32;
const MIN_NODE_WIDTH = 60;

function estimateNodeSize(node: LayoutNode) {
  const fontSize = node.isCenter ? 14 : 13;
  const charWidth = fontSize * 0.6;
  const width = Math.max(node.label.length * charWidth + PILL_HORIZONTAL_PADDING, MIN_NODE_WIDTH);
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

function cloneTreeNode(node: LayoutNode): TreeNode {
  const cloned: TreeNode = {
    ...node,
    children: [],
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

  for (const node of nodes) {
    byId.set(node.id, cloneTreeNode(node));
  }

  const outgoing = new Map<number, number[]>();
  for (const edge of edges) {
    if (!byId.has(edge.sourceNodeId) || !byId.has(edge.targetNodeId)) {
      continue;
    }

    const targets = outgoing.get(edge.sourceNodeId) ?? [];
    targets.push(edge.targetNodeId);
    outgoing.set(edge.sourceNodeId, targets);
  }

  const visited = new Set<number>([root.id]);
  const queue = [root.id];

  while (queue.length > 0) {
    const sourceId = queue.shift()!;
    const source = byId.get(sourceId)!;
    const childIds = (outgoing.get(sourceId) ?? [])
      .filter((targetId) => !visited.has(targetId))
      .sort((leftId, rightId) => {
        const left = byId.get(leftId)!;
        const right = byId.get(rightId)!;
        if (left.preferredY === right.preferredY) {
          return (left.createdAt ?? left.id) - (right.createdAt ?? right.id);
        }
        return left.preferredY - right.preferredY;
      });

    for (const childId of childIds) {
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

function layoutNode(node: TreeNode, depth: number) {
  node.x = ROOT_X + depth * LEVEL_SPACING;
  node.bounds = makeBounds(node);
  node.subtreeTop = node.bounds.top;
  node.subtreeBottom = node.bounds.bottom;

  if (node.children.length === 0) {
    return;
  }

  let previousBottom = Number.NEGATIVE_INFINITY;

  for (const child of node.children) {
    layoutNode(child, depth + 1);
    const requiredTop = previousBottom + SUBTREE_GAP_Y;
    if (child.subtreeTop < requiredTop) {
      shiftSubtree(child, requiredTop - child.subtreeTop);
    }
    previousBottom = child.subtreeBottom;
  }

  const firstChild = node.children[0];
  const lastChild = node.children[node.children.length - 1];
  node.subtreeTop = Math.min(node.bounds.top, firstChild.subtreeTop);
  node.subtreeBottom = Math.max(node.bounds.bottom, lastChild.subtreeBottom);
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
  if (nodes.length === 0) {
    return [];
  }

  const root = buildTree(nodes, edges);
  root.x = ROOT_X;
  root.y = root.isCenter ? 0 : root.y;
  root.preferredY = root.y;

  layoutNode(root, 0);

  const positioned: PositionedLayoutNode[] = [];
  flattenTree(root, positioned);
  const positionedIds = new Set(positioned.map((node) => node.id));

  const detached = nodes
    .filter((node) => !positionedIds.has(node.id))
    .sort((left, right) => left.y - right.y)
    .map((node, index) => {
      const fallbackNode = {
        ...node,
        x: LEVEL_SPACING,
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
