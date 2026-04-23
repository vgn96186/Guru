import React from 'react';
import { Platform } from 'react-native';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import MindMapCanvas, { NodeData, EdgeData } from '../../modules/omni-canvas';

const AnimatedNativeCanvas = Animated.createAnimatedComponent(MindMapCanvas);

type Props = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  nodes: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  edges: any[];
  scale: SharedValue<number>;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  onNodePress: (nodeId: number) => void;
};

export default function MindMapComposeCanvas({
  nodes,
  edges,
  scale,
  translateX,
  translateY,
  onNodePress,
}: Props) {
  const animatedProps = useAnimatedProps(() => ({
    zoom: scale.value,
    offsetX: translateX.value,
    offsetY: translateY.value,
  }));

  const mappedNodes = React.useMemo<NodeData[]>(
    () =>
      nodes.map((n) => ({
        id: n.id,
        label: n.label,
        x: n.x,
        y: n.y,
        isCenter: !!n.isCenter,
      })),
    [nodes],
  );

  const mappedEdges = React.useMemo<EdgeData[]>(
    () =>
      edges.map((e) => ({
        sourceId: e.sourceNodeId,
        targetId: e.targetNodeId,
      })),
    [edges],
  );

  if (Platform.OS !== 'android') {
    return null; // Compose is Android-only for now in this setup
  }

  return (
    <AnimatedNativeCanvas
      style={{ flex: 1 }}
      nodes={mappedNodes}
      edges={mappedEdges}
      zoom={scale.value}
      offsetX={translateX.value}
      offsetY={translateY.value}
      animatedProps={animatedProps}
      onNodePress={(e) => onNodePress(e.nativeEvent.nodeId)}
    />
  );
}
