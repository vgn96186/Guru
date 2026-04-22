import { getDrizzleDb } from '../drizzle';
import { mindMapsRepositoryDrizzle } from './mindMapsRepository.drizzle';

jest.mock('../drizzle', () => ({
  getDrizzleDb: jest.fn(),
}));

jest.mock('../drizzleSchema', () => ({
  mindMaps: {
    id: 'mind_maps.id',
    title: 'mind_maps.title',
    subjectId: 'mind_maps.subject_id',
    topicId: 'mind_maps.topic_id',
    viewportJson: 'mind_maps.viewport_json',
    createdAt: 'mind_maps.created_at',
    updatedAt: 'mind_maps.updated_at',
  },
  mindMapNodes: {
    id: 'mind_map_nodes.id',
    mapId: 'mind_map_nodes.map_id',
    topicId: 'mind_map_nodes.topic_id',
    label: 'mind_map_nodes.label',
    x: 'mind_map_nodes.x',
    y: 'mind_map_nodes.y',
    color: 'mind_map_nodes.color',
    isCenter: 'mind_map_nodes.is_center',
    aiGenerated: 'mind_map_nodes.ai_generated',
    createdAt: 'mind_map_nodes.created_at',
  },
  mindMapEdges: {
    id: 'mind_map_edges.id',
    mapId: 'mind_map_edges.map_id',
    sourceNodeId: 'mind_map_edges.source_node_id',
    targetNodeId: 'mind_map_edges.target_node_id',
    label: 'mind_map_edges.label',
    createdAt: 'mind_map_edges.created_at',
  },
  topics: {
    id: 'topics.id',
    name: 'topics.name',
    subjectId: 'topics.subject_id',
    inicetPriority: 'topics.inicet_priority',
  },
  subjects: {
    id: 'subjects.id',
    name: 'subjects.name',
  },
}));

type MockDb = {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
};

type MapRow = {
  id: number;
  title: string;
  subjectId: number | null;
  topicId: number | null;
  viewportJson: string;
  createdAt: number;
  updatedAt: number;
};

type NodeRow = {
  id: number;
  mapId: number;
  topicId: number | null;
  label: string;
  x: number;
  y: number;
  color: string | null;
  isCenter: number;
  aiGenerated: number;
  createdAt: number;
};

type EdgeRow = {
  id: number;
  mapId: number;
  sourceNodeId: number;
  targetNodeId: number;
  label: string | null;
  createdAt: number;
};

const makeDb = (): MockDb => ({
  select: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
});

const makeMapRow = (overrides: Partial<MapRow> = {}): MapRow => ({
  id: 10,
  title: 'Renal map',
  subjectId: 2,
  topicId: 21,
  viewportJson: '{"x":1,"y":2,"scale":1.2}',
  createdAt: 1710000000000,
  updatedAt: 1710000100000,
  ...overrides,
});

const makeNodeRow = (overrides: Partial<NodeRow> = {}): NodeRow => ({
  id: 31,
  mapId: 10,
  topicId: 21,
  label: 'Nephron',
  x: 120,
  y: 240,
  color: '#00AEEF',
  isCenter: 1,
  aiGenerated: 0,
  createdAt: 1710000200000,
  ...overrides,
});

const makeEdgeRow = (overrides: Partial<EdgeRow> = {}): EdgeRow => ({
  id: 51,
  mapId: 10,
  sourceNodeId: 31,
  targetNodeId: 32,
  label: 'connects to',
  createdAt: 1710000300000,
  ...overrides,
});

describe('mindMapsRepositoryDrizzle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists mind maps ordered by updatedAt and maps rows to the legacy shape', async () => {
    const db = makeDb();
    const orderBy = jest.fn().mockResolvedValue([makeMapRow()]);
    const from = jest.fn(() => ({ orderBy }));
    db.select.mockReturnValue({ from });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    const result = await mindMapsRepositoryDrizzle.listMindMaps();

    expect(orderBy).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        id: 10,
        title: 'Renal map',
        subjectId: 2,
        topicId: 21,
        viewportJson: '{"x":1,"y":2,"scale":1.2}',
        createdAt: 1710000000000,
        updatedAt: 1710000100000,
      },
    ]);
  });

  it('creates a mind map, trims the title, and returns the inserted id', async () => {
    const db = makeDb();
    const returning = jest.fn().mockResolvedValue([{ id: 88 }]);
    const values = jest.fn(() => ({ returning }));
    db.insert.mockReturnValue({ values });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    const result = await mindMapsRepositoryDrizzle.createMindMap('  Cardiology  ', 4, null);

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Cardiology',
        subjectId: 4,
        topicId: null,
      }),
    );
    const insertedCalls = values.mock.calls as unknown as Array<[Record<string, unknown>]>;
    const inserted = insertedCalls.at(0)?.[0] ?? {};
    expect(typeof inserted.createdAt).toBe('number');
    expect(inserted.updatedAt).toBe(inserted.createdAt);
    expect(result).toBe(88);
  });

  it('touches the map timestamp and saves viewport updates', async () => {
    const db = makeDb();
    const touchWhere = jest.fn().mockResolvedValue(undefined);
    const touchSet = jest.fn(() => ({ where: touchWhere }));
    const viewportWhere = jest.fn().mockResolvedValue(undefined);
    const viewportSet = jest.fn(() => ({ where: viewportWhere }));

    db.update.mockReturnValueOnce({ set: touchSet }).mockReturnValueOnce({ set: viewportSet });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    await mindMapsRepositoryDrizzle.touchMindMap(10);
    await mindMapsRepositoryDrizzle.saveViewport(10, '{"x":5,"y":6,"scale":0.8}');

    expect(touchSet).toHaveBeenCalledWith(
      expect.objectContaining({
        updatedAt: expect.any(Number),
      }),
    );
    expect(viewportSet).toHaveBeenCalledWith(
      expect.objectContaining({
        viewportJson: '{"x":5,"y":6,"scale":0.8}',
        updatedAt: expect.any(Number),
      }),
    );
  });

  it('adds nodes and edges, updates node fields, and touches the parent map after structural changes', async () => {
    const db = makeDb();
    const nodeReturning = jest.fn().mockResolvedValue([{ id: 301 }]);
    const nodeValues = jest.fn(() => ({ returning: nodeReturning }));
    const touchAfterNodeWhere = jest.fn().mockResolvedValue(undefined);
    const touchAfterNodeSet = jest.fn(() => ({ where: touchAfterNodeWhere }));
    const edgeReturning = jest.fn().mockResolvedValue([{ id: 401 }]);
    const edgeValues = jest.fn(() => ({ returning: edgeReturning }));
    const touchAfterEdgeWhere = jest.fn().mockResolvedValue(undefined);
    const touchAfterEdgeSet = jest.fn(() => ({ where: touchAfterEdgeWhere }));
    const updatePosWhere = jest.fn().mockResolvedValue(undefined);
    const updatePosSet = jest.fn(() => ({ where: updatePosWhere }));
    const updateLabelWhere = jest.fn().mockResolvedValue(undefined);
    const updateLabelSet = jest.fn(() => ({ where: updateLabelWhere }));
    db.insert
      .mockReturnValueOnce({ values: nodeValues })
      .mockReturnValueOnce({ values: edgeValues });
    db.update
      .mockReturnValueOnce({ set: touchAfterNodeSet })
      .mockReturnValueOnce({ set: touchAfterEdgeSet })
      .mockReturnValueOnce({ set: updatePosSet })
      .mockReturnValueOnce({ set: updateLabelSet });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    const nodeId = await mindMapsRepositoryDrizzle.addNode(10, 'Node A', 10, 20, {
      topicId: 7,
      color: '#abc',
      isCenter: true,
      aiGenerated: true,
    });
    const edgeId = await mindMapsRepositoryDrizzle.addEdge(10, 301, 302, 'links', true);
    await mindMapsRepositoryDrizzle.updateNodePosition(301, 99, 100);
    await mindMapsRepositoryDrizzle.updateNodeLabel(301, 'Renamed');
    await mindMapsRepositoryDrizzle.updateNodeExplanation(301, 'Extra context');

    expect(nodeId).toBe(301);
    expect(edgeId).toBe(401);
    expect(nodeValues).toHaveBeenCalledWith(
      expect.objectContaining({
        mapId: 10,
        topicId: 7,
        label: 'Node A',
        x: 10,
        y: 20,
        color: '#abc',
        isCenter: 1,
        aiGenerated: 1,
      }),
    );
    expect(edgeValues).toHaveBeenCalledWith(
      expect.objectContaining({
        mapId: 10,
        sourceNodeId: 301,
        targetNodeId: 302,
        label: 'links',
      }),
    );
    expect(updatePosSet).toHaveBeenCalledWith({ x: 99, y: 100 });
    expect(updateLabelSet).toHaveBeenCalledWith({ label: 'Renamed' });
    expect(db.update).toHaveBeenCalledTimes(4);
  });

  it('loads a full mind map and fills legacy defaults for optional node and edge fields', async () => {
    const db = makeDb();
    const mapLimit = jest.fn().mockResolvedValue([makeMapRow()]);
    const mapWhere = jest.fn(() => ({ limit: mapLimit }));
    const mapFrom = jest.fn(() => ({ where: mapWhere }));
    const nodeOrderBy = jest.fn().mockResolvedValue([makeNodeRow()]);
    const nodeWhere = jest.fn(() => ({ orderBy: nodeOrderBy }));
    const nodeFrom = jest.fn(() => ({ where: nodeWhere }));
    const edgeOrderBy = jest.fn().mockResolvedValue([makeEdgeRow()]);
    const edgeWhere = jest.fn(() => ({ orderBy: edgeOrderBy }));
    const edgeFrom = jest.fn(() => ({ where: edgeWhere }));
    db.select
      .mockReturnValueOnce({ from: mapFrom })
      .mockReturnValueOnce({ from: nodeFrom })
      .mockReturnValueOnce({ from: edgeFrom });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    const result = await mindMapsRepositoryDrizzle.loadFullMindMap(10);

    expect(mapLimit).toHaveBeenCalledWith(1);
    expect(result).toEqual({
      map: {
        id: 10,
        title: 'Renal map',
        subjectId: 2,
        topicId: 21,
        viewportJson: '{"x":1,"y":2,"scale":1.2}',
        createdAt: 1710000000000,
        updatedAt: 1710000100000,
      },
      nodes: [
        {
          id: 31,
          mapId: 10,
          topicId: 21,
          label: 'Nephron',
          x: 120,
          y: 240,
          color: '#00AEEF',
          isCenter: true,
          aiGenerated: false,
          explanation: null,
          createdAt: 1710000200000,
        },
      ],
      edges: [
        {
          id: 51,
          mapId: 10,
          sourceNodeId: 31,
          targetNodeId: 32,
          label: 'connects to',
          isCrossLink: false,
          createdAt: 1710000300000,
        },
      ],
    });
  });

  it('clears contents, bulk inserts nodes and edges, and searches topics by label', async () => {
    const db = makeDb();
    const deleteEdgesWhere = jest.fn().mockResolvedValue(undefined);
    const deleteNodesWhere = jest.fn().mockResolvedValue(undefined);
    const node1Returning = jest.fn().mockResolvedValue([{ id: 700 }]);
    const node1Values = jest.fn(() => ({ returning: node1Returning }));
    const node2Returning = jest.fn().mockResolvedValue([{ id: 701 }]);
    const node2Values = jest.fn(() => ({ returning: node2Returning }));
    const edgeReturning = jest.fn().mockResolvedValue([{ id: 800 }]);
    const edgeValues = jest.fn(() => ({ returning: edgeReturning }));
    const touchWhere = jest.fn().mockResolvedValue(undefined);
    const touchSet = jest.fn(() => ({ where: touchWhere }));
    const searchLimit = jest
      .fn()
      .mockResolvedValue([{ id: 5, name: 'Renal physiology', subjectName: 'Physiology' }]);
    const searchOrderBy = jest.fn(() => ({ limit: searchLimit }));
    const searchWhere = jest.fn(() => ({ orderBy: searchOrderBy }));
    const searchInnerJoin = jest.fn(() => ({ where: searchWhere }));
    const searchFrom = jest.fn(() => ({ innerJoin: searchInnerJoin }));

    db.delete
      .mockReturnValueOnce({ where: deleteEdgesWhere })
      .mockReturnValueOnce({ where: deleteNodesWhere });
    db.insert
      .mockReturnValueOnce({ values: node1Values })
      .mockReturnValueOnce({ values: node2Values })
      .mockReturnValueOnce({ values: edgeValues });
    db.update.mockReturnValueOnce({ set: touchSet });
    db.select.mockReturnValueOnce({ from: searchFrom });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    await mindMapsRepositoryDrizzle.clearMindMapContents(10);
    const ids = await mindMapsRepositoryDrizzle.bulkInsertNodesAndEdges(
      10,
      [
        { label: 'Root', x: 0, y: 0, isCenter: true },
        { label: 'Child', x: 10, y: 15, color: '#eee', topicId: 9 },
      ],
      [{ sourceIndex: 0, targetIndex: 1, label: 'branch', isCrossLink: true }],
    );
    const topics = await mindMapsRepositoryDrizzle.findTopicsByLabel(' Renal ');

    expect(deleteEdgesWhere).toHaveBeenCalledTimes(1);
    expect(deleteNodesWhere).toHaveBeenCalledTimes(1);
    expect(ids).toEqual([700, 701]);
    expect(node1Values).toHaveBeenCalledWith(
      expect.objectContaining({
        mapId: 10,
        label: 'Root',
        aiGenerated: 1,
        isCenter: 1,
      }),
    );
    expect(node2Values).toHaveBeenCalledWith(
      expect.objectContaining({
        mapId: 10,
        label: 'Child',
        topicId: 9,
        color: '#eee',
        aiGenerated: 1,
      }),
    );
    expect(edgeValues).toHaveBeenCalledWith(
      expect.objectContaining({
        mapId: 10,
        sourceNodeId: 700,
        targetNodeId: 701,
        label: 'branch',
      }),
    );
    expect(searchLimit).toHaveBeenCalledWith(3);
    expect(topics).toEqual([{ id: 5, name: 'Renal physiology', subjectName: 'Physiology' }]);
  });

  it('returns null when the requested mind map does not exist and supports deletes', async () => {
    const db = makeDb();
    const mapLimit = jest.fn().mockResolvedValue([]);
    const mapWhere = jest.fn(() => ({ limit: mapLimit }));
    const mapFrom = jest.fn(() => ({ where: mapWhere }));
    const deleteMapWhere = jest.fn().mockResolvedValue(undefined);
    const deleteNodeWhere = jest.fn().mockResolvedValue(undefined);
    const deleteEdgeWhere = jest.fn().mockResolvedValue(undefined);

    db.select.mockReturnValueOnce({ from: mapFrom });
    db.delete
      .mockReturnValueOnce({ where: deleteMapWhere })
      .mockReturnValueOnce({ where: deleteNodeWhere })
      .mockReturnValueOnce({ where: deleteEdgeWhere });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    const result = await mindMapsRepositoryDrizzle.loadFullMindMap(404);
    await mindMapsRepositoryDrizzle.deleteMindMap(10);
    await mindMapsRepositoryDrizzle.deleteNode(31);
    await mindMapsRepositoryDrizzle.deleteEdge(51);

    expect(result).toBeNull();
    expect(deleteMapWhere).toHaveBeenCalledTimes(1);
    expect(deleteNodeWhere).toHaveBeenCalledTimes(1);
    expect(deleteEdgeWhere).toHaveBeenCalledTimes(1);
  });
});
