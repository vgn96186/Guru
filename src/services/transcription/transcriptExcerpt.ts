/**
 * Build a representative transcript excerpt from across the lecture instead of
 * only taking the opening chunk. This preserves coverage for long recordings.
 */
export function buildRepresentativeTranscriptExcerpt(
  transcript: string,
  maxChars = 64000,
  segmentCount = 4,
): string {
  const normalized = transcript.trim();
  if (normalized.length <= maxChars) return normalized;

  const safeSegmentCount = Math.max(2, segmentCount);
  const separator = '\n\n[...]\n\n';
  const totalSeparatorChars = separator.length * (safeSegmentCount - 1);
  const segmentSize = Math.max(
    1000,
    Math.floor((maxChars - totalSeparatorChars) / safeSegmentCount),
  );
  const maxStart = Math.max(0, normalized.length - segmentSize);
  const starts = new Set<number>();

  for (let i = 0; i < safeSegmentCount; i += 1) {
    const ratio = safeSegmentCount === 1 ? 0 : i / (safeSegmentCount - 1);
    starts.add(Math.min(maxStart, Math.floor(maxStart * ratio)));
  }

  return Array.from(starts)
    .sort((a, b) => a - b)
    .map((start) => normalized.slice(start, start + segmentSize).trim())
    .filter(Boolean)
    .join(separator)
    .slice(0, maxChars);
}
