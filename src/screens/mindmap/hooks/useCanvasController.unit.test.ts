import { renderHook } from '@testing-library/react-native';

jest.mock('../../../db/queries/mindMaps', () => ({
  addNode: jest.fn(),
  addEdge: jest.fn(),
  deleteNode: jest.fn(),
  saveViewport: jest.fn().mockResolvedValue(undefined),
  updateNodeExplanation: jest.fn(),
  updateNodePosition: jest.fn(),
  findTopicsByLabel: jest.fn(),
}));

jest.mock('../../../services/mindMapAI', () => ({
  expandNode: jest.fn(),
  explainMindMapNode: jest.fn(),
}));

jest.mock('../../../navigation/typedHooks', () => ({
  HomeNav: { useNav: () => ({ navigate: jest.fn() }) },
}));

jest.mock('../../../hooks/mindmap/useMindMapUndo', () => ({
  useMindMapUndo: () => ({ undoStack: [], pushUndoState: jest.fn(), handleUndo: jest.fn() }),
}));

jest.mock('react-native-reanimated', () => ({
  useSharedValue: (v: any) => ({ value: v }),
  withTiming: (v: any) => v,
  withDecay: (v: any) => v,
  runOnJS: (fn: any) => fn,
  useAnimatedStyle: () => ({}),
}));

jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

jest.mock('react-native-gesture-handler', () => {
  const chainable = () => {
    const api: any = {};
    api.maxPointers = () => api;
    api.minDistance = () => api;
    api.onStart = () => api;
    api.onUpdate = () => api;
    api.onEnd = () => api;
    api.numberOfTaps = () => api;
    api.maxDuration = () => api;
    return api;
  };

  return {
    Gesture: {
      Pan: chainable,
      Pinch: chainable,
      Tap: chainable,
      Simultaneous: () => ({}),
    },
  };
});

describe('useCanvasController', () => {
  it('initializes correctly', () => {
    const mindMaps = require('../../../db/queries/mindMaps');
    (mindMaps.saveViewport as jest.Mock).mockResolvedValue(undefined);
    const { useCanvasController } = require('./useCanvasController');
    const mockData = {
      map: { id: 1, title: 'Test Map', originTopicId: 1, subjectId: 1, topicId: 10, viewportJson: '', lastZoom: 1, lastPanX: 0, lastPanY: 0, createdAt: 0, updatedAt: 0 },
      nodes: [],
      edges: []
    };
    
    const { result } = renderHook(() => useCanvasController({ data: mockData }));
    
    expect(result.current.searchQuery).toBe('');
    expect(result.current.showSearch).toBe(false);
    expect(result.current.scale.value).toBe(1);
  });
});
