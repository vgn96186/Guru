import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../constants/theme';
import type { TreeConnectionView, TreeNode, TreeSubjectBranch } from '../../types';

interface SubjectSummary {
  subjectId: number;
  subjectName: string;
  color: string;
  progressRatio: number;
  averageMastery: number;
  topicCount: number;
}

export interface SourceOverlayState {
  btr: boolean;
  dbmci: boolean;
  marrow: boolean;
  connections: boolean;
}

export interface DigitalTreeCanvasProps {
  branch: TreeSubjectBranch;
  subjects: SubjectSummary[];
  connections: TreeConnectionView[];
  overlays: SourceOverlayState;
  isTablet: boolean;
  isLandscape: boolean;
  onSelectSubject: (subjectId: number) => void;
  onSelectTopic: (topic: TreeNode) => void;
}

type Point = { x: number; y: number };

const WIDE_POSITIONS: Point[] = [
  { x: 76, y: 17 },
  { x: 88, y: 34 },
  { x: 84, y: 58 },
  { x: 70, y: 78 },
  { x: 51, y: 82 },
  { x: 61, y: 31 },
];

const STACKED_POSITIONS: Point[] = [
  { x: 75, y: 18 },
  { x: 84, y: 38 },
  { x: 79, y: 62 },
  { x: 62, y: 79 },
  { x: 40, y: 78 },
  { x: 27, y: 55 },
];

const EDGE_POSITIONS: Point[] = [
  { x: 12, y: 18 },
  { x: 24, y: 8 },
  { x: 84, y: 10 },
  { x: 90, y: 34 },
  { x: 88, y: 76 },
  { x: 18, y: 84 },
];

const CONSTELLATION_POINTS: Point[] = [
  { x: 18, y: 66 },
  { x: 36, y: 30 },
  { x: 54, y: 58 },
  { x: 70, y: 20 },
  { x: 78, y: 72 },
];

const CONSTELLATION_EDGES: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [1, 3],
  [2, 4],
];

const STARFIELD = [
  { x: 8, y: 14, size: 2, opacity: 0.28 },
  { x: 19, y: 78, size: 3, opacity: 0.2 },
  { x: 28, y: 22, size: 2, opacity: 0.18 },
  { x: 42, y: 10, size: 2, opacity: 0.22 },
  { x: 58, y: 84, size: 2, opacity: 0.2 },
  { x: 76, y: 12, size: 3, opacity: 0.24 },
  { x: 84, y: 66, size: 2, opacity: 0.2 },
  { x: 91, y: 26, size: 2, opacity: 0.18 },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getTopicHubs(branch: TreeSubjectBranch): TreeNode[] {
  if (branch.roots.length >= 6) return branch.roots.slice(0, 6);

  const hubs = [...branch.roots];
  for (const root of branch.roots) {
    for (const child of root.children) {
      if (hubs.length >= 6) break;
      hubs.push(child);
    }
    if (hubs.length >= 6) break;
  }

  return hubs.slice(0, 6);
}

function getProgressRatio(topic: TreeNode): number {
  return clamp((topic.progress.masteryLevel ?? 0) / 10, 0, 1);
}

function getVisibleBadge(topic: TreeNode, overlays: SourceOverlayState): string | null {
  if (overlays.btr && (topic.progress.btrStage ?? 0) > 0) {
    return `BTR ${topic.progress.btrStage}`;
  }

  if (overlays.dbmci && (topic.progress.dbmciStage ?? 0) > 0) {
    return `DBMCI ${topic.progress.dbmciStage}`;
  }

  if (overlays.marrow && (topic.progress.marrowAttemptedCount ?? 0) > 0) {
    return `Marrow ${topic.progress.marrowCorrectCount ?? 0}/${topic.progress.marrowAttemptedCount ?? 0}`;
  }

  return null;
}

function getConnectionStyle(from: Point, to: Point) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  return {
    left: `${from.x}%` as const,
    top: `${from.y}%` as const,
    width: `${distance}%` as const,
    transform: [{ translateY: -1 }, { rotate: `${angle}deg` }],
  };
}

function getSubjectCoreProgress(subjects: SubjectSummary[], subjectId: number): number {
  return subjects.find((subject) => subject.subjectId === subjectId)?.progressRatio ?? 0;
}

function MiniConstellation({
  size,
  color,
  subtle = false,
}: {
  size: number;
  color: string;
  subtle?: boolean;
}) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.miniConstellation,
        {
          width: size,
          height: size,
        },
      ]}
    >
      {CONSTELLATION_EDGES.map(([fromIndex, toIndex], index) => {
        const from = CONSTELLATION_POINTS[fromIndex];
        const to = CONSTELLATION_POINTS[toIndex];
        return (
          <View
            key={`${fromIndex}-${toIndex}-${index}`}
            style={[
              styles.constellationLine,
              getConnectionStyle(from, to),
              {
                backgroundColor: subtle ? `${color}26` : `${color}42`,
              },
            ]}
          />
        );
      })}
      {CONSTELLATION_POINTS.map((point, index) => (
        <View
          key={`${point.x}-${point.y}-${index}`}
          style={[
            styles.constellationNode,
            {
              left: `${point.x}%`,
              top: `${point.y}%`,
              backgroundColor: subtle ? `${color}AA` : '#F8FBFF',
              shadowColor: color,
              opacity: subtle ? 0.7 : 1,
              transform: [{ translateX: -3.5 }, { translateY: -3.5 }],
            },
          ]}
        />
      ))}
    </View>
  );
}

function RingArc({
  size,
  color,
  progress,
  label,
  detail,
  faint = false,
}: {
  size: number;
  color: string;
  progress: number;
  label?: string;
  detail?: string;
  faint?: boolean;
}) {
  const angle = clamp(progress, 0, 1) * 270 - 135;
  const radius = size / 2 - 6;
  const dotX = radius * Math.cos((angle * Math.PI) / 180);
  const dotY = radius * Math.sin((angle * Math.PI) / 180);

  return (
    <View
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderColor: faint ? `${color}55` : color,
          backgroundColor: faint ? `${color}0D` : `${color}16`,
        },
      ]}
    >
      <View style={[styles.ringHalo, { backgroundColor: faint ? `${color}12` : `${color}20` }]} />
      <View style={styles.ringInner}>
        <MiniConstellation size={size - 24} color={color} subtle={faint} />
        {label ? <Text style={styles.ringLabel}>{label}</Text> : null}
        {detail ? <Text style={styles.ringDetail}>{detail}</Text> : null}
      </View>
      <View
        style={[
          styles.ringDot,
          {
            backgroundColor: color,
            transform: [{ translateX: dotX }, { translateY: dotY }],
          },
        ]}
      />
    </View>
  );
}

export default function DigitalTreeCanvas({
  branch,
  subjects,
  connections,
  overlays,
  isTablet,
  isLandscape,
  onSelectSubject,
  onSelectTopic,
}: DigitalTreeCanvasProps) {
  const pulse = useRef(new Animated.Value(0)).current;
  const selectedSubjectProgress = getSubjectCoreProgress(subjects, branch.subjectId);
  const subjectColor =
    subjects.find((subject) => subject.subjectId === branch.subjectId)?.color ?? branch.subjectColor ?? '#48B8FF';
  const otherSubjects = subjects
    .filter((subject) => subject.subjectId !== branch.subjectId)
    .slice(0, isTablet ? 6 : 4);
  const topicHubs = getTopicHubs(branch);
  const positions = isLandscape ? WIDE_POSITIONS : STACKED_POSITIONS;
  const topicPointMap = new Map<number, Point>();
  const activeOverlayLabels = [
    overlays.btr ? 'BTR' : null,
    overlays.dbmci ? 'DBMCI' : null,
    overlays.marrow ? 'Marrow' : null,
    overlays.connections ? 'Connections' : null,
  ].filter(Boolean) as string[];

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 2800,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 2800,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const coreGlowOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.32, 0.58],
  });

  const fieldGlowOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.14, 0.24],
  });

  topicHubs.forEach((topic, index) => {
    topicPointMap.set(topic.topicId, positions[index] ?? positions[positions.length - 1]);
  });

  return (
    <View style={styles.canvas}>
      <Animated.View
        style={[
          styles.glow,
          styles.glowPrimary,
          {
            backgroundColor: `${subjectColor}18`,
            opacity: fieldGlowOpacity,
          },
        ]}
      />
      <Animated.View
        style={[
          styles.glow,
          styles.glowSecondary,
          {
            backgroundColor: `${subjectColor}10`,
            opacity: fieldGlowOpacity,
          },
        ]}
      />
      <View style={styles.gridOverlay} />
      {STARFIELD.map((star, index) => (
        <View
          key={`${star.x}-${star.y}-${index}`}
          pointerEvents="none"
          style={[
            styles.star,
            {
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: star.size,
              height: star.size,
              opacity: star.opacity,
            },
          ]}
        />
      ))}
      <View style={styles.note}>
        <Text style={styles.noteTitle}>Atlas View</Text>
        <Text style={styles.noteBody}>
          Start zoomed out at the subject level, then follow the hubs into the topic layer.
        </Text>
      </View>
      <View style={styles.overlayPills}>
        {activeOverlayLabels.length > 0 ? (
          activeOverlayLabels.map((label) => (
            <View key={label} style={styles.overlayPill}>
              <Text style={styles.overlayPillText}>{label}</Text>
            </View>
          ))
        ) : (
          <View style={[styles.overlayPill, styles.overlayPillMuted]}>
            <Text style={styles.overlayPillText}>Clean atlas</Text>
          </View>
        )}
      </View>

      {connections.map((connection) => {
        const from = topicPointMap.get(connection.fromTopicId);
        const to = topicPointMap.get(connection.toTopicId);
        if (!from || !to) return null;

        return <View key={connection.id} pointerEvents="none" style={[styles.connectionLine, getConnectionStyle(from, to)]} />;
      })}

      {otherSubjects.map((subject, index) => {
        const point = EDGE_POSITIONS[index] ?? EDGE_POSITIONS[EDGE_POSITIONS.length - 1];
        return (
          <Pressable
            key={subject.subjectId}
            style={[styles.subjectGlimpse, { left: `${point.x}%`, top: `${point.y}%` }]}
            onPress={() => onSelectSubject(subject.subjectId)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${subject.subjectName} subject`}
          >
            <View style={styles.subjectGlimpseShell}>
              <MiniConstellation size={56} color={subject.color} subtle />
            </View>
            <RingArc
              size={isTablet ? 78 : 64}
              color={subject.color}
              progress={subject.progressRatio}
              label={`${Math.round(subject.averageMastery * 10) / 10}`}
              faint
            />
            <Text style={styles.subjectLabel}>{subject.subjectName}</Text>
            {isTablet ? <Text style={styles.subjectMeta}>{subject.topicCount} topics</Text> : null}
          </Pressable>
        );
      })}

      <Animated.View
        style={[
          styles.subjectCoreGlow,
          isLandscape ? styles.subjectCoreWide : styles.subjectCoreStacked,
          {
            backgroundColor: `${subjectColor}12`,
            opacity: coreGlowOpacity,
          },
        ]}
      />
      <View style={[styles.subjectCore, isLandscape ? styles.subjectCoreWide : styles.subjectCoreStacked]}>
        <RingArc
          size={isLandscape ? 180 : 148}
          color={subjectColor}
          progress={selectedSubjectProgress}
          label={branch.subjectCode}
          detail={`${Math.round(selectedSubjectProgress * 100)}%`}
        />
        <Text style={styles.subjectCoreName}>{branch.subjectName}</Text>
        <Text style={styles.subjectCoreBody}>
          {branch.roots.length} major hubs ready to branch into deeper topics.
        </Text>
      </View>

      {topicHubs.map((topic, index) => {
        const point = positions[index] ?? positions[positions.length - 1];
        const badge = getVisibleBadge(topic, overlays);

        return (
          <React.Fragment key={topic.topicId}>
            <View
              pointerEvents="none"
              style={[styles.spoke, getConnectionStyle(isLandscape ? { x: 40, y: 49 } : { x: 50, y: 50 }, point)]}
            />
            <Pressable
              style={[styles.topicHub, { left: `${point.x}%`, top: `${point.y}%`, borderColor: `${subjectColor}18` }]}
              onPress={() => onSelectTopic(topic)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${topic.name} topic`}
            >
              <View style={styles.topicHubShell}>
                <MiniConstellation size={54} color={subjectColor} subtle />
              </View>
              <RingArc
                size={isLandscape ? 88 : 78}
                color={subjectColor}
                progress={getProgressRatio(topic)}
                label={`${topic.progress.masteryLevel ?? 0}`}
              />
              <Text style={styles.topicName}>{topic.name}</Text>
              <Text style={styles.topicMeta}>{topic.badges.overlay?.label ?? 'Mastery 0'}</Text>
              {badge ? <Text style={styles.topicBadge}>{badge}</Text> : null}
            </Pressable>
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    minHeight: 420,
    backgroundColor: '#05070D',
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.9,
  },
  glowPrimary: {
    width: 280,
    height: 280,
    left: '26%',
    top: '18%',
  },
  glowSecondary: {
    width: 220,
    height: 220,
    right: '-10%',
    top: '10%',
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    opacity: 0.2,
  },
  star: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: '#E9F4FF',
  },
  note: {
    position: 'absolute',
    top: theme.spacing.md,
    left: theme.spacing.md,
    zIndex: 5,
    maxWidth: 280,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(10, 14, 24, 0.72)',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  overlayPills: {
    position: 'absolute',
    top: theme.spacing.md,
    right: theme.spacing.md,
    zIndex: 5,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
    maxWidth: 220,
  },
  overlayPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(10, 14, 24, 0.76)',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
  },
  overlayPillMuted: {
    borderColor: 'rgba(255,255,255,0.05)',
  },
  overlayPillText: {
    color: '#D9EAFF',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  noteTitle: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  noteBody: {
    color: '#9BA7BF',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  subjectGlimpse: {
    position: 'absolute',
    alignItems: 'center',
    transform: [{ translateX: -46 }, { translateY: -54 }],
    opacity: 0.78,
  },
  subjectGlimpseShell: {
    position: 'absolute',
    top: 10,
    width: 56,
    height: 56,
    opacity: 0.4,
  },
  subjectLabel: {
    marginTop: theme.spacing.sm,
    color: 'rgba(232, 237, 248, 0.7)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
    maxWidth: 88,
  },
  subjectMeta: {
    marginTop: 4,
    color: 'rgba(142, 162, 193, 0.72)',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  subjectCoreGlow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 999,
    transform: [{ translateX: -140 }, { translateY: -140 }],
    zIndex: 2,
  },
  subjectCore: {
    position: 'absolute',
    alignItems: 'center',
    transform: [{ translateX: -74 }, { translateY: -74 }],
    zIndex: 3,
  },
  subjectCoreWide: {
    left: '40%',
    top: '49%',
  },
  subjectCoreStacked: {
    left: '50%',
    top: '50%',
  },
  subjectCoreName: {
    marginTop: theme.spacing.md,
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  subjectCoreBody: {
    marginTop: 6,
    color: '#9BA7BF',
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 220,
    lineHeight: 18,
  },
  ring: {
    borderRadius: 999,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringHalo: {
    position: 'absolute',
    inset: -10,
    borderRadius: 999,
    opacity: 0.85,
  },
  ringInner: {
    position: 'absolute',
    inset: 8,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.025)',
    overflow: 'hidden',
  },
  ringLabel: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  ringDetail: {
    color: '#B3C4DD',
    fontSize: 10,
    marginTop: 3,
    fontWeight: '700',
  },
  ringDot: {
    position: 'absolute',
    width: 9,
    height: 9,
    borderRadius: 999,
    shadowOpacity: 0.45,
    shadowRadius: 6,
  },
  miniConstellation: {
    position: 'absolute',
    inset: 0,
  },
  constellationLine: {
    position: 'absolute',
    height: 1,
    borderRadius: 999,
  },
  constellationNode: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 999,
    shadowOpacity: 0.35,
    shadowRadius: 5,
  },
  topicHub: {
    position: 'absolute',
    width: 142,
    alignItems: 'center',
    transform: [{ translateX: -71 }, { translateY: -64 }],
    zIndex: 4,
    borderWidth: 1,
    borderRadius: 24,
    backgroundColor: 'rgba(10, 14, 24, 0.54)',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  topicHubShell: {
    position: 'absolute',
    top: 12,
    width: 54,
    height: 54,
    opacity: 0.34,
  },
  topicName: {
    marginTop: theme.spacing.sm,
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  topicMeta: {
    marginTop: 4,
    color: '#93A6C3',
    fontSize: 11,
    textAlign: 'center',
  },
  topicBadge: {
    marginTop: 6,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(72, 184, 255, 0.16)',
    color: '#DDF1FF',
    fontSize: 10,
    fontWeight: '700',
    overflow: 'hidden',
  },
  spoke: {
    position: 'absolute',
    height: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(72, 184, 255, 0.16)',
    zIndex: 2,
  },
  connectionLine: {
    position: 'absolute',
    height: 1.5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    zIndex: 1,
  },
});
