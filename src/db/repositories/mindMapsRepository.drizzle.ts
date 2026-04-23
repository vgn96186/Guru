import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { MindMap, MindMapEdge, MindMapFull, MindMapNode } from '../queries/mindMaps';
import { getDrizzleDb } from '../drizzle';
import { mindMapEdges, mindMapNodes, mindMaps, subjects, topics } from '../drizzleSchema';

type MindMapRow = typeof mindMaps.$inferSelect;
type MindMapNodeRow = typeof mindMapNodes.$inferSelect & {
  explanation?: string | null;
};
type MindMapEdgeRow = typeof mindMapEdges.$inferSelect & {
  isCrossLink?: number | boolean | null;
};

function mapMindMapRow(row: MindMapRow): MindMap {
  return {
    id: row.id,
    title: row.title,
    subjectId: row.subjectId ?? null,
    topicId: row.topicId ?? null,
    viewportJson: row.viewportJson,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapMindMapNodeRow(row: MindMapNodeRow): MindMapNode {
  return {
    id: row.id,
    mapId: row.mapId,
    topicId: row.topicId ?? null,
    label: row.label,
    x: row.x,
    y: row.y,
    color: row.color ?? null,
    isCenter: row.isCenter === 1,
    aiGenerated: row.aiGenerated === 1,
    explanation: row.explanation ?? null,
    createdAt: row.createdAt,
  };
}

function mapMindMapEdgeRow(row: MindMapEdgeRow): MindMapEdge {
  return {
    id: row.id,
    mapId: row.mapId,
    sourceNodeId: row.sourceNodeId,
    targetNodeId: row.targetNodeId,
    label: row.label ?? null,
    isCrossLink: Boolean(row.isCrossLink),
    createdAt: row.createdAt,
  };
}

function nowTs(): number {
  return Date.now();
}

export const mindMapsRepositoryDrizzle = {
  async listMindMaps(): Promise<MindMap[]> {
    const db = getDrizzleDb();
    const rows = await db.select().from(mindMaps).orderBy(desc(mindMaps.updatedAt));
    return rows.map(mapMindMapRow);
  },

  async createMindMap(
    title: string,
    subjectId?: number | null,
    topicId?: number | null,
  ): Promise<number> {
    const db = getDrizzleDb();
    const now = nowTs();
    const insertedRows = await db
      .insert(mindMaps)
      .values({
        title: title.trim(),
        subjectId: subjectId ?? null,
        topicId: topicId ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: mindMaps.id });

    return insertedRows[0]?.id ?? 0;
  },

  async deleteMindMap(mapId: number): Promise<void> {
    const db = getDrizzleDb();
    await db.delete(mindMaps).where(eq(mindMaps.id, mapId));
  },

  async touchMindMap(mapId: number): Promise<void> {
    const db = getDrizzleDb();
    await db
      .update(mindMaps)
      .set({
        updatedAt: nowTs(),
      })
      .where(eq(mindMaps.id, mapId));
  },

  async saveViewport(mapId: number, viewportJson: string): Promise<void> {
    const db = getDrizzleDb();
    await db
      .update(mindMaps)
      .set({
        viewportJson,
        updatedAt: nowTs(),
      })
      .where(eq(mindMaps.id, mapId));
  },

  async addNode(
    mapId: number,
    label: string,
    x: number,
    y: number,
    opts?: { topicId?: number; color?: string; isCenter?: boolean; aiGenerated?: boolean },
  ): Promise<number> {
    const db = getDrizzleDb();
    const insertedRows = await db
      .insert(mindMapNodes)
      .values({
        mapId,
        topicId: opts?.topicId ?? null,
        label,
        x,
        y,
        color: opts?.color ?? null,
        isCenter: opts?.isCenter ? 1 : 0,
        aiGenerated: opts?.aiGenerated ? 1 : 0,
        createdAt: nowTs(),
      })
      .returning({ id: mindMapNodes.id });

    await this.touchMindMap(mapId);
    return insertedRows[0]?.id ?? 0;
  },

  async updateNodePosition(nodeId: number, x: number, y: number): Promise<void> {
    const db = getDrizzleDb();
    await db
      .update(mindMapNodes)
      .set({
        x,
        y,
      })
      .where(eq(mindMapNodes.id, nodeId));
  },

  async bulkUpdateNodePositions(
    mapId: number,
    positions: Array<{ id: number; x: number; y: number }>,
  ): Promise<void> {
    if (positions.length === 0) {
      return;
    }

    const db = getDrizzleDb();
    for (const position of positions) {
      await db
        .update(mindMapNodes)
        .set({
          x: position.x,
          y: position.y,
        })
        .where(and(eq(mindMapNodes.id, position.id), eq(mindMapNodes.mapId, mapId)));
    }

    await this.touchMindMap(mapId);
  },

  async updateNodeLabel(nodeId: number, label: string): Promise<void> {
    const db = getDrizzleDb();
    await db
      .update(mindMapNodes)
      .set({
        label,
      })
      .where(eq(mindMapNodes.id, nodeId));
  },

  async updateNodeExplanation(nodeId: number, explanation: string): Promise<void> {
    void nodeId;
    void explanation;
    // The current persisted schema does not have an explanation column.
    // Preserve the legacy API surface as a safe no-op until the schema grows.
  },

  async deleteNode(nodeId: number): Promise<void> {
    const db = getDrizzleDb();
    await db.delete(mindMapNodes).where(eq(mindMapNodes.id, nodeId));
  },

  async addEdge(
    mapId: number,
    sourceNodeId: number,
    targetNodeId: number,
    label?: string,
    isCrossLink?: boolean,
  ): Promise<number> {
    const db = getDrizzleDb();
    const insertedRows = await db
      .insert(mindMapEdges)
      .values({
        mapId,
        sourceNodeId,
        targetNodeId,
        label: label ?? null,
        createdAt: nowTs(),
      })
      .returning({ id: mindMapEdges.id });

    void isCrossLink;
    await this.touchMindMap(mapId);
    return insertedRows[0]?.id ?? 0;
  },

  async deleteEdge(edgeId: number): Promise<void> {
    const db = getDrizzleDb();
    await db.delete(mindMapEdges).where(eq(mindMapEdges.id, edgeId));
  },

  async loadFullMindMap(mapId: number): Promise<MindMapFull | null> {
    const db = getDrizzleDb();
    const mapRows = await db.select().from(mindMaps).where(eq(mindMaps.id, mapId)).limit(1);
    const mapRow = mapRows[0];
    if (!mapRow) {
      return null;
    }

    const nodeRows = await db
      .select({
        id: mindMapNodes.id,
        mapId: mindMapNodes.mapId,
        topicId: mindMapNodes.topicId,
        label: mindMapNodes.label,
        x: mindMapNodes.x,
        y: mindMapNodes.y,
        color: mindMapNodes.color,
        isCenter: mindMapNodes.isCenter,
        aiGenerated: mindMapNodes.aiGenerated,
        explanation: sql<string | null>`NULL`.as('explanation'),
        createdAt: mindMapNodes.createdAt,
      })
      .from(mindMapNodes)
      .where(eq(mindMapNodes.mapId, mapId))
      .orderBy(asc(mindMapNodes.createdAt));

    const edgeRows = await db
      .select({
        id: mindMapEdges.id,
        mapId: mindMapEdges.mapId,
        sourceNodeId: mindMapEdges.sourceNodeId,
        targetNodeId: mindMapEdges.targetNodeId,
        label: mindMapEdges.label,
        isCrossLink: sql<number>`0`.as('isCrossLink'),
        createdAt: mindMapEdges.createdAt,
      })
      .from(mindMapEdges)
      .where(eq(mindMapEdges.mapId, mapId))
      .orderBy(asc(mindMapEdges.createdAt));

    return {
      map: mapMindMapRow(mapRow),
      nodes: nodeRows.map(mapMindMapNodeRow),
      edges: edgeRows.map(mapMindMapEdgeRow),
    };
  },

  async clearMindMapContents(mapId: number): Promise<void> {
    const db = getDrizzleDb();
    await db.delete(mindMapEdges).where(eq(mindMapEdges.mapId, mapId));
    await db.delete(mindMapNodes).where(eq(mindMapNodes.mapId, mapId));
  },

  async bulkInsertNodesAndEdges(
    mapId: number,
    nodes: Array<{
      label: string;
      x: number;
      y: number;
      color?: string;
      isCenter?: boolean;
      topicId?: number;
    }>,
    edges: Array<{
      sourceIndex: number;
      targetIndex: number;
      label?: string;
      isCrossLink?: boolean;
    }>,
  ): Promise<number[]> {
    const db = getDrizzleDb();
    const createdAt = nowTs();
    const nodeIds: number[] = [];

    for (const node of nodes) {
      const insertedRows = await db
        .insert(mindMapNodes)
        .values({
          mapId,
          topicId: node.topicId ?? null,
          label: node.label,
          x: node.x,
          y: node.y,
          color: node.color ?? null,
          isCenter: node.isCenter ? 1 : 0,
          aiGenerated: 1,
          createdAt,
        })
        .returning({ id: mindMapNodes.id });
      nodeIds.push(insertedRows[0]?.id ?? 0);
    }

    for (const edge of edges) {
      const sourceNodeId = nodeIds[edge.sourceIndex];
      const targetNodeId = nodeIds[edge.targetIndex];
      if (sourceNodeId == null || targetNodeId == null) {
        continue;
      }

      await db
        .insert(mindMapEdges)
        .values({
          mapId,
          sourceNodeId,
          targetNodeId,
          label: edge.label ?? null,
          createdAt,
        })
        .returning({ id: mindMapEdges.id });

      void edge.isCrossLink;
    }

    await this.touchMindMap(mapId);
    return nodeIds;
  },

  async findTopicsByLabel(
    label: string,
  ): Promise<Array<{ id: number; name: string; subjectName: string }>> {
    const db = getDrizzleDb();
    const rows = await db
      .select({
        id: topics.id,
        name: topics.name,
        subjectName: subjects.name,
      })
      .from(topics)
      .innerJoin(subjects, eq(topics.subjectId, subjects.id))
      .where(sql`LOWER(${topics.name}) LIKE ${`%${label.trim().toLowerCase()}%`}`)
      .orderBy(desc(topics.inicetPriority))
      .limit(3);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      subjectName: row.subjectName,
    }));
  },
};
