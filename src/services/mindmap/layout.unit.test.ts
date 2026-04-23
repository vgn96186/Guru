import {
  wrapText,
  getNodeDimensions,
  clamp,
  getCanvasMetrics,
  computeFittedViewport,
  applyAutoLayout,
  getHiddenNodeIds,
  getBranchIndex,
  Viewport,
} from './layout';
import { MindMapNode, MindMapEdge, MindMapFull } from '../../db/queries/mindMaps';

describe('MindMap Layout Helpers', () => {
  describe('wrapText', () => {
    it('wraps text that fits in one line', () => {
      expect(wrapText('Hello world', 20)).toEqual(['Hello world']);
    });

    it('wraps text into multiple lines', () => {
      const lines = wrapText('This is a longer text that should be wrapped', 15);
      expect(lines).toEqual(['This is a', 'longer text', 'that should be', 'wrapped']);
    });

    it('truncates very long words', () => {
      const lines = wrapText('Supercalifragilisticexpialidocious', 10);
      expect(lines[0]).toContain('\u2026');
    });
  });

  describe('getNodeDimensions', () => {
    it('calculates center node dimensions', () => {
      const dim = getNodeDimensions({ label: 'Center', isCenter: true });
      expect(dim.fontSize).toBe(14);
      expect(dim.label).toBe('Center');
      expect(dim.width).toBeGreaterThan(60);
    });

    it('calculates child node dimensions', () => {
      const dim = getNodeDimensions({ label: 'Child', isCenter: false });
      expect(dim.fontSize).toBe(13);
      expect(dim.label).toBe('Child');
    });
  });

  describe('clamp', () => {
    it('clamps values correctly', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });
  });

  describe('getCanvasMetrics', () => {
    it('returns default metrics for empty nodes', () => {
      const viewport: Viewport = { width: 800, height: 600 };
      const metrics = getCanvasMetrics([], viewport);
      expect(metrics.width).toBe(800);
      expect(metrics.height).toBe(600);
    });

    it('computes metrics from nodes', () => {
      const viewport: Viewport = { width: 800, height: 600 };
      const nodes = [
        { id: 1, x: 0, y: 0, label: 'Root', isCenter: true } as MindMapNode,
        { id: 2, x: 100, y: 100, label: 'Child', isCenter: false } as MindMapNode,
      ];
      const metrics = getCanvasMetrics(nodes, viewport);
      expect(metrics.width).toBeGreaterThan(800);
    });
  });

  describe('computeFittedViewport', () => {
    it('computes default for empty nodes', () => {
      const viewport: Viewport = { width: 800, height: 600 };
      const fitted = computeFittedViewport([], viewport);
      expect(fitted.scale).toBe(1);
    });

    it('computes scaled viewport', () => {
      const viewport: Viewport = { width: 800, height: 600 };
      const nodes = [{ id: 1, x: 0, y: 0, label: 'Root', isCenter: true } as MindMapNode];
      const fitted = computeFittedViewport(nodes, viewport);
      expect(fitted.scale).toBeLessThanOrEqual(1);
    });
  });

  describe('applyAutoLayout', () => {
    it('does nothing for empty graph', () => {
      const mapFull: MindMapFull = {
        map: {
          id: 1,
          title: 'Test',
          createdAt: 0,
          updatedAt: 0,
          viewportJson: '',
          subjectId: null,
          topicId: null,
        },
        nodes: [],
        edges: [],
      };
      const res = applyAutoLayout(mapFull);
      expect(res.changed).toBe(false);
    });
  });

  describe('getHiddenNodeIds', () => {
    it('returns hidden node ids for collapsed parents', () => {
      const nodes = [
        { id: 1, x: 0, y: 0, label: 'Root', isCenter: true } as MindMapNode,
        { id: 2, x: 1, y: 1, label: 'A', isCenter: false } as MindMapNode,
        { id: 3, x: 2, y: 2, label: 'B', isCenter: false } as MindMapNode,
      ];
      const edges = [
        { id: 1, mapId: 1, sourceNodeId: 1, targetNodeId: 2, isCrossLink: false } as MindMapEdge,
        { id: 2, mapId: 1, sourceNodeId: 2, targetNodeId: 3, isCrossLink: false } as MindMapEdge,
      ];
      const collapsedIds = new Set([2]);
      const hidden = getHiddenNodeIds(nodes, edges, collapsedIds);
      expect(hidden.has(3)).toBe(true);
      expect(hidden.has(2)).toBe(false);
    });
  });

  describe('getBranchIndex', () => {
    it('computes branch index based on center child', () => {
      const nodes = [
        { id: 1, x: 0, y: 0, label: 'Root', isCenter: true } as MindMapNode,
        { id: 2, x: 1, y: 1, label: 'A', isCenter: false } as MindMapNode,
        { id: 3, x: 2, y: 2, label: 'B', isCenter: false } as MindMapNode,
      ];
      const edges = [
        { id: 1, mapId: 1, sourceNodeId: 1, targetNodeId: 2, isCrossLink: false } as MindMapEdge,
        { id: 2, mapId: 1, sourceNodeId: 2, targetNodeId: 3, isCrossLink: false } as MindMapEdge,
      ];
      const idx = getBranchIndex(nodes, 3, edges);
      // Node 2 is the child of center (Node 1).
      // nonCenterNodes is [Node 2, Node 3]
      // Node 2 is index 0 in nonCenterNodes.
      expect(idx).toBe(0);
    });
  });
});
