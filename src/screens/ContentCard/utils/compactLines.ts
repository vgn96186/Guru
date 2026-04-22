export function compactLines(lines: string[], limit = 3): string {
  return lines
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, limit)
    .join('\n');
}
