import { layoutMindMapGraph, rectanglesOverlap } from './mindMapLayout';

type NodeFixture = {
  id: number;
  label: string;
  x: number;
  y: number;
  isCenter: boolean;
  createdAt: number;
};

type EdgeFixture = {
  sourceNodeId: number;
  targetNodeId: number;
};

function makeNode(id: number, label: string, overrides: Partial<NodeFixture> = {}): NodeFixture {
  return {
    id,
    label,
    x: 0,
    y: 0,
    isCenter: false,
    createdAt: id,
    ...overrides,
  };
}

describe('layoutMindMapGraph', () => {
  it('keeps the center node to the left and avoids node overlap in a multi-depth tree', () => {
    const nodes: NodeFixture[] = [
      makeNode(1, 'Diabetes Mellitus', { isCenter: true }),
      makeNode(2, 'Etiology and Risk Factors'),
      makeNode(3, 'Clinical Features'),
      makeNode(4, 'Investigations'),
      makeNode(5, 'Management'),
      makeNode(6, 'Type 1 Diabetes'),
      makeNode(7, 'Type 2 Diabetes'),
      makeNode(8, 'DKA'),
      makeNode(9, 'HbA1c'),
      makeNode(10, 'Insulin Therapy'),
    ];

    const edges: EdgeFixture[] = [
      { sourceNodeId: 1, targetNodeId: 2 },
      { sourceNodeId: 1, targetNodeId: 3 },
      { sourceNodeId: 1, targetNodeId: 4 },
      { sourceNodeId: 1, targetNodeId: 5 },
      { sourceNodeId: 2, targetNodeId: 6 },
      { sourceNodeId: 2, targetNodeId: 7 },
      { sourceNodeId: 3, targetNodeId: 8 },
      { sourceNodeId: 4, targetNodeId: 9 },
      { sourceNodeId: 5, targetNodeId: 10 },
    ];

    const laidOut = layoutMindMapGraph(nodes, edges);
    const root = laidOut.find((node) => node.id === 1);
    expect(root).toBeDefined();

    for (const node of laidOut) {
      if (node.id === 1) continue;
      expect(node.x).toBeGreaterThan(root!.x);
    }

    for (let i = 0; i < laidOut.length; i += 1) {
      for (let j = i + 1; j < laidOut.length; j += 1) {
        expect(rectanglesOverlap(laidOut[i].bounds, laidOut[j].bounds)).toBe(false);
      }
    }
  });

  it('reflows surrounding siblings when a branch expands', () => {
    const baseNodes: NodeFixture[] = [
      makeNode(1, 'Shock', { isCenter: true }),
      makeNode(2, 'Hypovolemic Shock', { y: -80 }),
      makeNode(3, 'Cardiogenic Shock', { y: 0 }),
      makeNode(4, 'Septic Shock', { y: 80 }),
    ];
    const baseEdges: EdgeFixture[] = [
      { sourceNodeId: 1, targetNodeId: 2 },
      { sourceNodeId: 1, targetNodeId: 3 },
      { sourceNodeId: 1, targetNodeId: 4 },
    ];

    const before = layoutMindMapGraph(baseNodes, baseEdges);
    const cardiogenicBefore = before.find((node) => node.id === 3)!;
    const septicBefore = before.find((node) => node.id === 4)!;

    const expandedNodes: NodeFixture[] = [
      ...baseNodes,
      makeNode(5, 'Causes of Cardiogenic Shock'),
      makeNode(6, 'Clinical Signs'),
      makeNode(7, 'Hemodynamic Profile'),
      makeNode(8, 'First-line Management'),
    ];
    const expandedEdges: EdgeFixture[] = [
      ...baseEdges,
      { sourceNodeId: 3, targetNodeId: 5 },
      { sourceNodeId: 3, targetNodeId: 6 },
      { sourceNodeId: 3, targetNodeId: 7 },
      { sourceNodeId: 3, targetNodeId: 8 },
    ];

    const after = layoutMindMapGraph(expandedNodes, expandedEdges);
    const cardiogenicAfter = after.find((node) => node.id === 3)!;
    const septicAfter = after.find((node) => node.id === 4)!;

    expect(cardiogenicAfter.y).toBe(cardiogenicBefore.y);
    expect(septicAfter.y).toBeGreaterThan(septicBefore.y);

    for (let i = 0; i < after.length; i += 1) {
      for (let j = i + 1; j < after.length; j += 1) {
        expect(rectanglesOverlap(after[i].bounds, after[j].bounds)).toBe(false);
      }
    }
  });
});
