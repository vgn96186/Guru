import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import LoadingOrb from '../components/LoadingOrb';
import DigitalTreeCanvas from '../components/tree/DigitalTreeCanvas';
import MasteryLegend from '../components/tree/MasteryLegend';
import SourceOverlayToggle from '../components/tree/SourceOverlayToggle';
import { theme } from '../constants/theme';
import { getAllTopicsWithProgress, getTopicConnections } from '../db/queries/topics';
import { ResponsiveContainer, useResponsive } from '../hooks/useResponsive';
import type { TreeConnectionView, TreeNode, TreeSubjectBranch, TreeViewModel } from '../types';
import { buildTreeViewModel } from '../services/tree/buildTreeViewModel';
import type { TreeStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<TreeStackParamList, 'KnowledgeTree'>;

type OverlayKey = 'btr' | 'dbmci' | 'marrow' | 'connections';

interface OverlayState {
  btr: boolean;
  dbmci: boolean;
  marrow: boolean;
  connections: boolean;
}

interface SubjectSummary {
  subjectId: number;
  subjectName: string;
  color: string;
  progressRatio: number;
  averageMastery: number;
  topicCount: number;
}

interface BranchStats {
  averageMastery: number;
  progressRatio: number;
  topicCount: number;
  touchedCount: number;
  strongCount: number;
  btrCount: number;
  dbmciCount: number;
  marrowCount: number;
  lastStudiedAt: number;
}

const DEFAULT_MODEL: TreeViewModel = { subjects: [], connections: [] };
const DEFAULT_OVERLAYS: OverlayState = {
  btr: true,
  dbmci: false,
  marrow: false,
  connections: false,
};

const FAMILY_HUES: Array<{ color: string; names: string[] }> = [
  {
    color: '#7F5AF0',
    names: ['Anatomy', 'Physiology', 'Biochemistry', 'Pathology', 'Pharmacology', 'Microbiology'],
  },
  {
    color: '#48B8FF',
    names: ['Medicine', 'Pediatrics', 'Psychiatry', 'Dermatology', 'Radiology'],
  },
  {
    color: '#19C37D',
    names: ['Surgery', 'Orthopedics', 'ENT', 'Ophthalmology', 'Anesthesia'],
  },
  {
    color: '#F5A524',
    names: ['Obstetrics & Gynecology', 'Obstetrics', 'Gynecology', 'Community Medicine', 'Forensic Medicine'],
  },
];

function flattenNodes(nodes: TreeNode[]): TreeNode[] {
  const flattened: TreeNode[] = [];

  for (const node of nodes) {
    flattened.push(node);
    if (node.children.length > 0) {
      flattened.push(...flattenNodes(node.children));
    }
  }

  return flattened;
}

function getBranchStats(branch: TreeSubjectBranch): BranchStats {
  const nodes = flattenNodes(branch.roots);

  if (nodes.length === 0) {
    return {
      averageMastery: 0,
      progressRatio: 0,
      topicCount: 0,
      touchedCount: 0,
      strongCount: 0,
      btrCount: 0,
      dbmciCount: 0,
      marrowCount: 0,
      lastStudiedAt: 0,
    };
  }

  let masteryTotal = 0;
  let touchedCount = 0;
  let strongCount = 0;
  let btrCount = 0;
  let dbmciCount = 0;
  let marrowCount = 0;
  let lastStudiedAt = 0;

  for (const node of nodes) {
    const masteryLevel = node.progress.masteryLevel ?? 0;
    masteryTotal += masteryLevel;
    if (masteryLevel > 0 || node.progress.status !== 'unseen') touchedCount += 1;
    if (masteryLevel >= 6) strongCount += 1;
    if ((node.progress.btrStage ?? 0) > 0) btrCount += 1;
    if ((node.progress.dbmciStage ?? 0) > 0) dbmciCount += 1;
    if ((node.progress.marrowAttemptedCount ?? 0) > 0) marrowCount += 1;
    if ((node.progress.lastStudiedAt ?? 0) > lastStudiedAt) {
      lastStudiedAt = node.progress.lastStudiedAt ?? 0;
    }
  }

  const averageMastery = masteryTotal / nodes.length;

  return {
    averageMastery,
    progressRatio: touchedCount / nodes.length,
    topicCount: nodes.length,
    touchedCount,
    strongCount,
    btrCount,
    dbmciCount,
    marrowCount,
    lastStudiedAt,
  };
}

function toSubjectHue(branch: TreeSubjectBranch): string {
  for (const family of FAMILY_HUES) {
    if (family.names.includes(branch.subjectName)) {
      return family.color;
    }
  }

  return branch.subjectColor || '#48B8FF';
}

function rankBranch(branch: TreeSubjectBranch): number {
  const stats = getBranchStats(branch);
  return stats.lastStudiedAt + stats.averageMastery * 1000 + stats.touchedCount * 250;
}

function getInitialSubjectId(subjects: TreeSubjectBranch[]): number | null {
  if (subjects.length === 0) return null;

  const ranked = [...subjects].sort((a, b) => rankBranch(b) - rankBranch(a));
  return ranked[0]?.subjectId ?? subjects[0]?.subjectId ?? null;
}

function getTopicHubs(branch: TreeSubjectBranch): TreeNode[] {
  if (branch.roots.length >= 6) {
    return branch.roots.slice(0, 6);
  }

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

function filterConnections(
  connections: TreeConnectionView[],
  branch: TreeSubjectBranch,
  enabled: boolean,
): TreeConnectionView[] {
  if (!enabled) return [];

  const ids = new Set(flattenNodes(branch.roots).map((node) => node.topicId));
  return connections.filter((connection) => ids.has(connection.fromTopicId) && ids.has(connection.toTopicId));
}

function buildSubjectSummaries(subjects: TreeSubjectBranch[]): SubjectSummary[] {
  return subjects.map((branch) => {
    const stats = getBranchStats(branch);
    return {
      subjectId: branch.subjectId,
      subjectName: branch.subjectName,
      color: toSubjectHue(branch),
      progressRatio: stats.progressRatio,
      averageMastery: stats.averageMastery,
      topicCount: stats.topicCount,
    };
  });
}

export default function KnowledgeTreeScreen() {
  const navigation = useNavigation<Nav>();
  const { isTablet, isLandscape, f } = useResponsive();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<TreeViewModel>(DEFAULT_MODEL);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [overlays, setOverlays] = useState<OverlayState>(DEFAULT_OVERLAYS);
  const hasMountedRef = useRef(false);

  const loadTree = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([getAllTopicsWithProgress(), getTopicConnections()])
      .then(([topics, connections]) => {
        if (cancelled) return;

        const nextModel = buildTreeViewModel({ topics, connections });
        setModel(nextModel);
        setSelectedSubjectId((current) => {
          if (current && nextModel.subjects.some((subject) => subject.subjectId === current)) {
            return current;
          }
          return getInitialSubjectId(nextModel.subjects);
        });
      })
      .catch((err) => {
        console.warn('[KnowledgeTree] Failed to load atlas:', err);
        if (!cancelled) {
          setError('The atlas could not load right now.');
          setModel(DEFAULT_MODEL);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    hasMountedRef.current = true;
    return loadTree();
  }, [loadTree]);

  useFocusEffect(
    useCallback(() => {
      if (!hasMountedRef.current) return undefined;
      return loadTree();
    }, [loadTree]),
  );

  const selectedBranch =
    model.subjects.find((subject) => subject.subjectId === selectedSubjectId) ?? model.subjects[0] ?? null;

  const selectedStats = selectedBranch ? getBranchStats(selectedBranch) : null;
  const subjectSummaries = buildSubjectSummaries(model.subjects);
  const topicHubs = selectedBranch ? getTopicHubs(selectedBranch) : [];
  const visibleConnections = selectedBranch
    ? filterConnections(model.connections, selectedBranch, overlays.connections)
    : [];

  const openTopic = (topic: TreeNode) => {
    if (!selectedBranch) return;
    navigation.navigate('TopicDetail', {
      subjectId: selectedBranch.subjectId,
      subjectName: selectedBranch.subjectName,
      initialTopicId: topic.topicId,
    });
  };

  const toggleOverlay = (key: OverlayKey) => {
    setOverlays((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
        <LoadingOrb message="Rendering the atlas..." />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
        <View style={styles.centerState}>
          <Text style={styles.errorTitle}>Knowledge Atlas</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={() => loadTree()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!selectedBranch) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
        <View style={styles.centerState}>
          <Text style={styles.errorTitle}>Knowledge Atlas</Text>
          <Text style={styles.errorBody}>No syllabus data is available yet.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isWideLayout = isTablet && isLandscape;

  const atlasHeader = (
    <View style={styles.headerBlock}>
      <Text style={styles.kicker}>KNOWLEDGE ATLAS</Text>
      <Text style={[styles.title, { fontSize: f(isTablet ? 24 : 20) }]}>Subject Constellations</Text>
      <Text style={styles.subtitle}>
        Zoom out for the whole syllabus, then move into a subject hub to follow the next strongest line.
      </Text>
    </View>
  );

  const atlasContent = (
    <>
      <View style={styles.atlasCard}>
        <View style={styles.atlasAccentRail} />
        <View style={styles.atlasCardHeader}>
          <View>
            <Text style={styles.atlasLabel}>ACTIVE SUBJECT</Text>
            <Text style={styles.atlasSubject}>{selectedBranch.subjectName}</Text>
          </View>
          <View style={styles.metricChip}>
            <Text style={styles.metricChipValue}>
              {Math.round((selectedStats?.averageMastery ?? 0) * 10) / 10}/10
            </Text>
            <Text style={styles.metricChipLabel}>Mastery</Text>
          </View>
        </View>

        <View style={[styles.canvasShell, isWideLayout ? styles.canvasShellWide : styles.canvasShellStacked]}>
          <DigitalTreeCanvas
            branch={selectedBranch}
            subjects={subjectSummaries}
            connections={visibleConnections}
            overlays={overlays}
            isTablet={isTablet}
            isLandscape={isLandscape}
            onSelectSubject={setSelectedSubjectId}
            onSelectTopic={openTopic}
          />
        </View>
      </View>

      <View style={[styles.insightRow, !isWideLayout && styles.insightRowStacked]}>
        <MasteryLegend />
        <SourceOverlayToggle value={overlays} onToggle={toggleOverlay} />
      </View>
    </>
  );

  const sideRail = (
    <View style={styles.sideRail}>
      <View style={styles.sidePanel}>
        <View style={styles.sidePanelAccent} />
        <Text style={styles.panelEyebrow}>Selected Subject</Text>
        <Text style={styles.panelTitle}>{selectedBranch.subjectName}</Text>
        <Text style={styles.panelBody}>
          {selectedStats?.touchedCount ?? 0} of {selectedStats?.topicCount ?? 0} topics have been touched.
          {' '}
          {selectedStats?.strongCount ?? 0} are already in strong recall territory.
        </Text>
        <View style={styles.statGrid}>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{Math.round((selectedStats?.progressRatio ?? 0) * 100)}%</Text>
            <Text style={styles.statLabel}>Coverage</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{selectedStats?.btrCount ?? 0}</Text>
            <Text style={styles.statLabel}>BTR</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{selectedStats?.dbmciCount ?? 0}</Text>
            <Text style={styles.statLabel}>DBMCI</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{selectedStats?.marrowCount ?? 0}</Text>
            <Text style={styles.statLabel}>Marrow</Text>
          </View>
        </View>
      </View>

      <View style={styles.sidePanel}>
        <View style={styles.sidePanelAccent} />
        <Text style={styles.panelEyebrow}>Topic Hubs</Text>
        <Text style={styles.panelTitle}>Open the next line</Text>
        <View style={styles.topicHubList}>
          {topicHubs.map((topic) => (
            <Pressable
              key={topic.topicId}
              style={styles.topicHubItem}
              onPress={() => openTopic(topic)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${topic.name} topic`}
            >
              <View style={[styles.topicHubAccent, { backgroundColor: toSubjectHue(selectedBranch) }]} />
              <View style={styles.topicHubCopy}>
                <Text style={styles.topicHubTitle}>{topic.name}</Text>
                <Text style={styles.topicHubMeta}>
                  {topic.badges.overlay?.label ?? 'Mastery 0'}
                  {'  •  '}
                  {topic.badges.source?.label ?? 'No source yet'}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <View style={styles.backgroundGlowA} />
      <View style={styles.backgroundGlowB} />
      <ResponsiveContainer style={styles.flex}>
        {isWideLayout ? (
          <View style={styles.wideLayout}>
            <View style={styles.primaryColumn}>
              {atlasHeader}
              {atlasContent}
            </View>
            {sideRail}
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {atlasHeader}
            {atlasContent}
            {sideRail}
          </ScrollView>
        )}
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#05070D',
  },
  flex: {
    flex: 1,
  },
  backgroundGlowA: {
    position: 'absolute',
    top: 120,
    left: -80,
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: 'rgba(127, 90, 240, 0.12)',
  },
  backgroundGlowB: {
    position: 'absolute',
    top: 90,
    right: -50,
    width: 240,
    height: 240,
    borderRadius: 999,
    backgroundColor: 'rgba(72, 184, 255, 0.1)',
  },
  wideLayout: {
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.lg,
  },
  primaryColumn: {
    flex: 1.45,
    gap: theme.spacing.lg,
  },
  sideRail: {
    flex: 0.9,
    gap: theme.spacing.lg,
  },
  headerBlock: {
    gap: theme.spacing.sm,
  },
  kicker: {
    color: '#97A9FF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  title: {
    color: theme.colors.textPrimary,
    fontWeight: '900',
  },
  subtitle: {
    color: '#9BA7BF',
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 520,
  },
  atlasCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(10, 14, 24, 0.88)',
    padding: theme.spacing.lg,
    overflow: 'hidden',
  },
  atlasAccentRail: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(72, 184, 255, 0.42)',
  },
  atlasCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  atlasLabel: {
    color: '#7F8AA3',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  atlasSubject: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    marginTop: 6,
  },
  metricChip: {
    minWidth: 88,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(72, 184, 255, 0.24)',
    backgroundColor: 'rgba(72, 184, 255, 0.08)',
    alignItems: 'center',
  },
  metricChipValue: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  metricChipLabel: {
    color: '#A8BEDA',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },
  canvasShell: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(5, 7, 13, 0.78)',
    overflow: 'hidden',
  },
  canvasShellWide: {
    minHeight: 540,
  },
  canvasShellStacked: {
    minHeight: 460,
  },
  insightRow: {
    flexDirection: 'row',
    gap: theme.spacing.lg,
  },
  insightRowStacked: {
    flexDirection: 'column',
  },
  sidePanel: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(10, 14, 24, 0.82)',
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    overflow: 'hidden',
  },
  sidePanelAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(127, 90, 240, 0.34)',
  },
  panelEyebrow: {
    color: '#7F8AA3',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  panelTitle: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  panelBody: {
    color: '#A3B1C8',
    fontSize: 14,
    lineHeight: 21,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  statTile: {
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 120,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  statValue: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  statLabel: {
    color: '#8EA2C1',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginTop: 6,
  },
  topicHubList: {
    gap: theme.spacing.sm,
  },
  topicHubItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(255,255,255,0.035)',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  topicHubAccent: {
    width: 10,
    height: 42,
    borderRadius: 999,
  },
  topicHubCopy: {
    flex: 1,
  },
  topicHubTitle: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  topicHubMeta: {
    color: '#91A2BC',
    fontSize: 12,
    marginTop: 4,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  errorTitle: {
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
  },
  errorBody: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: theme.spacing.md,
    maxWidth: 320,
  },
  retryButton: {
    marginTop: theme.spacing.xl,
    borderRadius: 999,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.primary,
  },
  retryText: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
});
