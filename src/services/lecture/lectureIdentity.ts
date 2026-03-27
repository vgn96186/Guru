interface LectureIdentityInput {
  subjectName?: string | null;
  topics?: string[] | null;
  note?: string | null;
  summary?: string | null;
}

const UNKNOWN_SUBJECT_LABEL = 'General';
const UNKNOWN_TOPIC_LABEL = 'general';
const GENERIC_SUBJECT_LABELS = new Set(['general', 'unknown', 'lecture']);
const GENERIC_TITLE_LINES = new Set([
  'subject',
  'topics',
  'key concepts',
  'high-yield facts',
  'clinical links',
  'integrated summary',
  'check yourself',
]);

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

function normalizeNoteLine(line: string): string {
  return normalizeWhitespace(line.replace(/\*\*/g, '').replace(/^[^\p{L}\p{N}#]+/gu, ''));
}

function extractStructuredLineValue(note: string | null | undefined, label: RegExp): string | null {
  if (!note?.trim()) return null;

  const lines = note.split('\n');
  for (const rawLine of lines) {
    const line = normalizeNoteLine(rawLine);
    const match = line.match(label);
    if (!match?.[1]) continue;
    const value = normalizeWhitespace(match[1]);
    if (value) return value;
  }
  return null;
}

function extractSubjectFromNote(note: string | null | undefined): string | null {
  return extractStructuredLineValue(note, /^subject\s*:\s*(.+)$/i);
}

function extractTopicsFromNote(note: string | null | undefined): string[] {
  const value = extractStructuredLineValue(note, /^topics?\s*:\s*(.+)$/i);
  if (!value) return [];

  return uniqueTopics(
    value
      .split(/[;,|]/)
      .flatMap((chunk) => chunk.split(/\s+·\s+/))
      .map((topic) => normalizeWhitespace(topic)),
  );
}

function extractHeadlineFromNote(note: string | null | undefined): string | null {
  if (!note?.trim()) return null;

  const lines = note
    .split('\n')
    .map((line) => normalizeNoteLine(line.replace(/^#+\s*/, '')))
    .filter(Boolean);

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (/^(subject|topics?)\s*:/i.test(line)) continue;
    if (GENERIC_TITLE_LINES.has(lower)) continue;
    if (line.length < 8) continue;
    return line;
  }

  return null;
}

function isGenericSubjectLabel(label: string): boolean {
  return GENERIC_SUBJECT_LABELS.has(label.toLowerCase());
}

export function resolveLectureSubjectLabel(input: LectureIdentityInput): string {
  const cleanSubject = getLectureSubjectLabel(input.subjectName);
  if (!isGenericSubjectLabel(cleanSubject)) {
    return cleanSubject;
  }

  const noteSubject = extractSubjectFromNote(input.note);
  if (noteSubject) {
    const resolved = getLectureSubjectLabel(noteSubject);
    if (!isGenericSubjectLabel(resolved)) return resolved;
  }

  return cleanSubject;
}

export function resolveLectureTopicLabels(input: LectureIdentityInput): string[] {
  const directTopics = getLectureTopicLabels(input.topics);
  if (directTopics.length > 0) return directTopics;
  return extractTopicsFromNote(input.note);
}

export function buildLectureDisplayTitle(input: LectureIdentityInput, maxTopics = 3): string {
  const subjectLabel = resolveLectureSubjectLabel(input);
  const topicLabels = resolveLectureTopicLabels(input);

  if (topicLabels.length === 0) {
    if (!isGenericSubjectLabel(subjectLabel)) return subjectLabel;
    return (
      extractHeadlineFromNote(input.note) ||
      normalizeWhitespace(input.summary ?? '') ||
      subjectLabel
    );
  }

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

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}_${hh}${min}`;
}

export function buildLectureArtifactFileName(
  kind: 'transcript' | 'note' | 'recording',
  input: LectureIdentityInput,
  timestamp: number,
  extension: string,
): string {
  const safeExtension = extension.startsWith('.') ? extension : `.${extension}`;
  const subject = clipPart(slugify(resolveLectureSubjectLabel(input)), 32);
  const topics = resolveLectureTopicLabels(input)
    .slice(0, 2)
    .map((t) => clipPart(slugify(t), 28));
  const topicPart = topics.length > 0 ? `_${topics.join('_')}` : '';
  const dateStr = formatTimestamp(timestamp);
  // Format: "anatomy_cardiac-valves_transcript_2025-03-26_1430.txt"
  return `${subject}${topicPart}_${kind}_${dateStr}${safeExtension}`;
}
