import { getDb, nowTs } from '../database';

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
  createdAt: number;
}

export interface MindMapEdge {
  id: number;
  mapId: number;
  sourceNodeId: number;
  targetNodeId: number;
  label: string | null;
  createdAt: number;
}

export interface MindMapFull {
  map: MindMap;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
}

// ── Row mappers ────────────────────────────────────────────────────────────

function toMap(row: any): MindMap {
  return {
    id: row.id,
    title: row.title,
    subjectId: row.subject_id,
    topicId: row.topic_id,
    viewportJson: row.viewport_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toNode(row: any): MindMapNode {
  return {
    id: row.id,
    mapId: row.map_id,
    topicId: row.topic_id,
    label: row.label,
    x: row.x,
    y: row.y,
    color: row.color,
    isCenter: !!row.is_center,
    aiGenerated: !!row.ai_generated,
    createdAt: row.created_at,
  };
}

function toEdge(row: any): MindMapEdge {
  return {
    id: row.id,
    mapId: row.map_id,
    sourceNodeId: row.source_node_id,
    targetNodeId: row.target_node_id,
    label: row.label,
    createdAt: row.created_at,
  };
}

// ── Queries ────────────────────────────────────────────────────────────────

export async function listMindMaps(): Promise<MindMap[]> {
  const db = getDb();
  const rows = await db.getAllAsync('SELECT * FROM mind_maps ORDER BY updated_at DESC');
  return rows.map(toMap);
}

export async function createMindMap(
  title: string,
  subjectId?: number | null,
  topicId?: number | null,
): Promise<number> {
  const db = getDb();
  const now = nowTs();
  const result = await db.runAsync(
    'INSERT INTO mind_maps (title, subject_id, topic_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [title, subjectId ?? null, topicId ?? null, now, now],
  );
  return result.lastInsertRowId;
}

export async function deleteMindMap(mapId: number): Promise<void> {
  const db = getDb();
  await db.runAsync('DELETE FROM mind_maps WHERE id = ?', [mapId]);
}

export async function touchMindMap(mapId: number): Promise<void> {
  const db = getDb();
  await db.runAsync('UPDATE mind_maps SET updated_at = ? WHERE id = ?', [nowTs(), mapId]);
}

export async function saveViewport(mapId: number, viewportJson: string): Promise<void> {
  const db = getDb();
  await db.runAsync('UPDATE mind_maps SET viewport_json = ?, updated_at = ? WHERE id = ?', [
    viewportJson,
    nowTs(),
    mapId,
  ]);
}

export async function addNode(
  mapId: number,
  label: string,
  x: number,
  y: number,
  opts?: { topicId?: number; color?: string; isCenter?: boolean; aiGenerated?: boolean },
): Promise<number> {
  const db = getDb();
  const now = nowTs();
  const result = await db.runAsync(
    `INSERT INTO mind_map_nodes (map_id, topic_id, label, x, y, color, is_center, ai_generated, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      mapId,
      opts?.topicId ?? null,
      label,
      x,
      y,
      opts?.color ?? null,
      opts?.isCenter ? 1 : 0,
      opts?.aiGenerated ? 1 : 0,
      now,
    ],
  );
  await touchMindMap(mapId);
  return result.lastInsertRowId;
}

export async function updateNodePosition(nodeId: number, x: number, y: number): Promise<void> {
  const db = getDb();
  await db.runAsync('UPDATE mind_map_nodes SET x = ?, y = ? WHERE id = ?', [x, y, nodeId]);
}

export async function bulkUpdateNodePositions(
  mapId: number,
  positions: Array<{ id: number; x: number; y: number }>,
): Promise<void> {
  if (positions.length === 0) {
    return;
  }

  const db = getDb();
  for (const position of positions) {
    await db.runAsync('UPDATE mind_map_nodes SET x = ?, y = ? WHERE id = ? AND map_id = ?', [
      position.x,
      position.y,
      position.id,
      mapId,
    ]);
  }
  await touchMindMap(mapId);
}

export async function updateNodeLabel(nodeId: number, label: string): Promise<void> {
  const db = getDb();
  await db.runAsync('UPDATE mind_map_nodes SET label = ? WHERE id = ?', [label, nodeId]);
}

export async function deleteNode(nodeId: number): Promise<void> {
  const db = getDb();
  // Edges cascade-delete via FK
  await db.runAsync('DELETE FROM mind_map_nodes WHERE id = ?', [nodeId]);
}

export async function addEdge(
  mapId: number,
  sourceNodeId: number,
  targetNodeId: number,
  label?: string,
): Promise<number> {
  const db = getDb();
  const now = nowTs();
  const result = await db.runAsync(
    'INSERT INTO mind_map_edges (map_id, source_node_id, target_node_id, label, created_at) VALUES (?, ?, ?, ?, ?)',
    [mapId, sourceNodeId, targetNodeId, label ?? null, now],
  );
  await touchMindMap(mapId);
  return result.lastInsertRowId;
}

export async function deleteEdge(edgeId: number): Promise<void> {
  const db = getDb();
  await db.runAsync('DELETE FROM mind_map_edges WHERE id = ?', [edgeId]);
}

export async function loadFullMindMap(mapId: number): Promise<MindMapFull | null> {
  const db = getDb();
  const mapRow = await db.getFirstAsync('SELECT * FROM mind_maps WHERE id = ?', [mapId]);
  if (!mapRow) return null;
  const nodeRows = await db.getAllAsync(
    'SELECT * FROM mind_map_nodes WHERE map_id = ? ORDER BY created_at',
    [mapId],
  );
  const edgeRows = await db.getAllAsync(
    'SELECT * FROM mind_map_edges WHERE map_id = ? ORDER BY created_at',
    [mapId],
  );
  return {
    map: toMap(mapRow),
    nodes: nodeRows.map(toNode),
    edges: edgeRows.map(toEdge),
  };
}

/** Bulk insert nodes + edges from AI generation. Returns inserted node IDs keyed by temp label. */
export async function bulkInsertNodesAndEdges(
  mapId: number,
  nodes: Array<{
    label: string;
    x: number;
    y: number;
    color?: string;
    isCenter?: boolean;
    topicId?: number;
  }>,
  edges: Array<{ sourceIndex: number; targetIndex: number; label?: string }>,
): Promise<number[]> {
  const db = getDb();
  const now = nowTs();
  const nodeIds: number[] = [];

  for (const n of nodes) {
    const result = await db.runAsync(
      `INSERT INTO mind_map_nodes (map_id, topic_id, label, x, y, color, is_center, ai_generated, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [mapId, n.topicId ?? null, n.label, n.x, n.y, n.color ?? null, n.isCenter ? 1 : 0, now],
    );
    nodeIds.push(result.lastInsertRowId);
  }

  for (const e of edges) {
    const srcId = nodeIds[e.sourceIndex];
    const tgtId = nodeIds[e.targetIndex];
    if (srcId != null && tgtId != null) {
      await db.runAsync(
        'INSERT INTO mind_map_edges (map_id, source_node_id, target_node_id, label, created_at) VALUES (?, ?, ?, ?, ?)',
        [mapId, srcId, tgtId, e.label ?? null, now],
      );
    }
  }

  await touchMindMap(mapId);
  return nodeIds;
}
