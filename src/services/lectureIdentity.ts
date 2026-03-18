interface LectureIdentityInput {
  subjectName?: string | null;
  topics?: string[] | null;
}

const UNKNOWN_SUBJECT_LABEL = 'General';
const UNKNOWN_TOPIC_LABEL = 'general';

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function uniqueTopics(topics: string[] = []): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const topic of topics) {
    const clean = normalizeWhitespace(topic);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(clean);
  }

  return normalized;
}

function slugify(value: string): string {
  const normalized = normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || UNKNOWN_TOPIC_LABEL;
}

function clipPart(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength).replace(/-+$/g, '') : value;
}

export function getLectureSubjectLabel(subjectName?: string | null): string {
  const clean = subjectName ? normalizeWhitespace(subjectName) : '';
  return clean || UNKNOWN_SUBJECT_LABEL;
}

export function getLectureTopicLabels(topics?: string[] | null): string[] {
  return uniqueTopics(topics ?? []);
}

export function buildLectureDisplayTitle(input: LectureIdentityInput, maxTopics = 3): string {
  const subjectLabel = getLectureSubjectLabel(input.subjectName);
  const topicLabels = getLectureTopicLabels(input.topics);

  if (topicLabels.length === 0) return subjectLabel;

  const visibleTopics = topicLabels.slice(0, maxTopics);
  const hiddenCount = topicLabels.length - visibleTopics.length;
  const topicSuffix = hiddenCount > 0 ? ` + ${hiddenCount} more` : '';

  return `${subjectLabel} - ${visibleTopics.join(', ')}${topicSuffix}`;
}

export function buildLectureFileStem(input: LectureIdentityInput, maxTopics = 3): string {
  const subjectSlug = clipPart(slugify(getLectureSubjectLabel(input.subjectName)), 32);
  const topicSlugs = getLectureTopicLabels(input.topics)
    .slice(0, maxTopics)
    .map((topic) => clipPart(slugify(topic), 28));

  const hiddenCount = getLectureTopicLabels(input.topics).length - topicSlugs.length;
  const suffix = hiddenCount > 0 ? [`plus-${hiddenCount}-more`] : [];

  return [subjectSlug, ...topicSlugs, ...suffix].join('__');
}

export function buildLectureArtifactFileName(
  kind: 'transcript' | 'note' | 'recording',
  input: LectureIdentityInput,
  timestamp: number,
  extension: string,
): string {
  const safeExtension = extension.startsWith('.') ? extension : `.${extension}`;
  return `${buildLectureFileStem(input)}__${kind}__${timestamp}${safeExtension}`;
}
