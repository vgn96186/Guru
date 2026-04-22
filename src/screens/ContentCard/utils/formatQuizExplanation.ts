// ── Concept Chip (inline tap-to-explain) ─────────────────────────
// ── Deep Explanation with Reveal ─────────────────────────────────
// ── Quiz ──────────────────────────────────────────────────────────

export function formatQuizExplanation(
  rawExplanation: string,
  options: string[],
  correctIndex: number,
): string {
  const decoded = rawExplanation
    .replace(/\r\n/g, '\n')
    .replace(/\\n/g, '\n')
    // Repair common malformed option-label markdown like "**A\nLower trunk**"
    .replace(/\*\*([A-D])\s*\n\s*/g, '**$1. ')
    // Keep option labels on one line before sentence splitting
    .replace(/\b([A-D])\.\s*\n\s*/g, '$1. ')
    .trim();

  if (!decoded) return 'No explanation available.';

  // Keep already-structured markdown untouched.
  if ((/^#{1,3}\s/m.test(decoded) || /^-\s/m.test(decoded)) && decoded.includes('\n')) {
    return decoded;
  }

  const normalized = decoded
    // Protect option prefixes from sentence splitting ("A. ...", "B. ...")
    .replace(/\b([A-D])\.\s+/g, '$1) ')
    .replace(/\s+/g, ' ')
    .trim();
  const withoutPrefix = normalized.replace(/^Correct Answer\s*:\s*[A-D][.)]?\s*/i, '').trim();
  const body = withoutPrefix || normalized;

  const optionSplitPoints = body
    .replace(/\sOption\s+([A-D])\b/gi, '\nOption $1')
    .replace(/\s([A-D])\.\s+/g, '\n$1. ')
    .replace(/\s([A-D])\)\s+/g, '\n$1. ');

  const optionAnchoredLines = optionSplitPoints
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const explicitOptionLines = optionAnchoredLines.filter(
    (line) => /^[A-D][.)]\s+/.test(line) || /^Option\s+[A-D]\b/i.test(line),
  );

  const sentences = body
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((sentence) => sentence.replace(/\b([A-D])\)\s+/g, '$1. ').trim())
    .filter(Boolean);

  const whyCorrect = sentences.slice(0, 2);
  const whyOthersWrong = explicitOptionLines.length > 0 ? explicitOptionLines : sentences.slice(2);
  const fallbackPoint = sentences[0] ?? body;

  const correctOption = options[correctIndex] ?? '';
  const correctLetter =
    Number.isInteger(correctIndex) && correctIndex >= 0 && correctIndex < options.length
      ? String.fromCharCode(65 + correctIndex)
      : 'N/A';

  const whyCorrectSection = (whyCorrect.length > 0 ? whyCorrect : [fallbackPoint])
    .map((point) => `- ${point}`)
    .join('\n');

  const wrongSection = (
    whyOthersWrong.length > 0
      ? whyOthersWrong
      : ['Eliminate distractors using the most specific vignette clues and pathophysiology.']
  )
    .map((point) => {
      const cleaned = point.replace(/^-\s*/, '').trim();
      const optionWordMatch = cleaned.match(/^Option\s+([A-D])\s*(?:[:.)-])?\s*(.*)$/i);
      if (optionWordMatch) {
        const letter = optionWordMatch[1].toUpperCase();
        const rest = optionWordMatch[2].trim();
        return `- **${letter}.** ${rest}`;
      }
      if (/^[A-D][.)]\s+/.test(cleaned))
        return `- **${cleaned.slice(0, 2).replace(')', '.')}** ${cleaned.slice(2).trim()}`;
      return `- ${cleaned}`;
    })
    .join('\n');

  return `### Correct answer
**${correctLetter}. ${correctOption || 'See options above'}**

### Why this is correct
${whyCorrectSection}

### Why other options are wrong
${wrongSection}`;
}
