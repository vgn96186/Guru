import type {
  TopicConnection,
  TopicWithProgress,
  TreeBadge,
  TreeConnectionView,
  TreeNode,
  TreeSubjectBranch,
  TreeViewModel,
} from '../../types';

interface BuildTreeViewModelArgs {
  topics: TopicWithProgress[];
  connections?: TopicConnection[];
}

function compareTopics(a: TopicWithProgress | TreeNode, b: TopicWithProgress | TreeNode): number {
  const priorityDiff = (b.inicetPriority ?? 0) - (a.inicetPriority ?? 0);
  if (priorityDiff !== 0) return priorityDiff;
  return a.name.localeCompare(b.name);
}

function toMasteryBadge(masteryLevel: number | undefined): TreeBadge | null {
  if (!masteryLevel || masteryLevel <= 0) return null;
  if (masteryLevel === 1) {
    return { label: `Mastery ${masteryLevel}`, tone: 'warning' };
  }
  if (masteryLevel === 2) {
    return { label: `Mastery ${masteryLevel}`, tone: 'accent' };
  }
  return { label: `Mastery ${masteryLevel}`, tone: 'success' };
}

function toSourceBadge(progress: TopicWithProgress['progress']): TreeBadge | null {
  if ((progress.btrStage ?? 0) > 0) {
    return { label: `BTR ${progress.btrStage}`, tone: 'accent' };
  }

  if ((progress.dbmciStage ?? 0) > 0) {
    return { label: `DBMCI ${progress.dbmciStage}`, tone: 'accent' };
  }

  const attempted = progress.marrowAttemptedCount ?? 0;
  const correct = progress.marrowCorrectCount ?? 0;
  if (attempted > 0) {
    const accuracy = attempted > 0 ? correct / attempted : 0;
    return {
      label: `Marrow ${correct}/${attempted}`,
      tone: accuracy >= 0.7 ? 'success' : 'warning',
    };
  }

  return null;
}

function makeNode(topic: TopicWithProgress, depth: number): TreeNode {
  return {
    topicId: topic.id,
    subjectId: topic.subjectId,
    parentTopicId: topic.parentTopicId ?? null,
    name: topic.name,
    depth,
    estimatedMinutes: topic.estimatedMinutes,
    inicetPriority: topic.inicetPriority,
    progress: topic.progress,
    badges: {
      overlay: toMasteryBadge(topic.progress.masteryLevel),
      source: toSourceBadge(topic.progress),
    },
    children: [],
  };
}

function buildSubjectBranch(subjectTopics: TopicWithProgress[]): TreeSubjectBranch {
  const sortedTopics = [...subjectTopics].sort(compareTopics);
  const topicMap = new Map<number, TreeNode>();

  for (const topic of sortedTopics) {
    topicMap.set(topic.id, makeNode(topic, 0));
  }

  const roots: TreeNode[] = [];

  for (const topic of sortedTopics) {
    const node = topicMap.get(topic.id)!;
    const parentId = topic.parentTopicId ?? null;
    const parentNode = parentId ? topicMap.get(parentId) : undefined;

    if (!parentNode) {
      roots.push(node);
      continue;
    }

    node.depth = parentNode.depth + 1;
    parentNode.children.push(node);
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort(compareTopics);
    for (const node of nodes) {
      sortNodes(node.children);
    }
  };

  sortNodes(roots);

  const firstTopic = sortedTopics[0];
  return {
    subjectId: firstTopic.subjectId,
    subjectName: firstTopic.subjectName,
    subjectCode: firstTopic.subjectCode,
    subjectColor: firstTopic.subjectColor,
    roots,
  };
}

function mapConnections(connections: TopicConnection[] | undefined): TreeConnectionView[] {
  if (!connections?.length) return [];

  return [...connections]
    .map((connection) => ({
      id: connection.id,
      fromTopicId: connection.fromTopicId,
      toTopicId: connection.toTopicId,
      relationType: connection.relationType,
      label: connection.label ?? null,
    }))
    .sort((a, b) => {
      if (a.fromTopicId !== b.fromTopicId) return a.fromTopicId - b.fromTopicId;
      if (a.toTopicId !== b.toTopicId) return a.toTopicId - b.toTopicId;
      return a.relationType.localeCompare(b.relationType);
    });
}

export function buildTreeViewModel({
  topics,
  connections = [],
}: BuildTreeViewModelArgs): TreeViewModel {
  const topicsBySubject = new Map<number, TopicWithProgress[]>();

  for (const topic of topics) {
    const bucket = topicsBySubject.get(topic.subjectId);
    if (bucket) {
      bucket.push(topic);
    } else {
      topicsBySubject.set(topic.subjectId, [topic]);
    }
  }

  const subjects = [...topicsBySubject.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, subjectTopics]) => buildSubjectBranch(subjectTopics));

  return {
    subjects,
    connections: mapConnections(connections),
  };
}
