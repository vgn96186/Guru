// ── Concept Chip (inline tap-to-explain) ─────────────────────────

/**
 * Extracts likely medical concepts worth explaining from a quiz question + options.
 * Looks for: lab values (Na, K, Hb...), named signs/tests, drug names, and specific measurements.
 */
export function extractMedicalConcepts(
  question: string,
  options: string[],
  correctAnswer: string,
): string[] {
  const combined = `${question} ${options.join(' ')}`;
  const found: string[] = [];

  // Lab values / named signs patterns
  const patterns = [
    /\b(serum\s+\w+|\w+\s+level)\b/gi,
    /\b([A-Z][a-z]+\s+(sign|test|syndrome|disease|law|index|score|criteria|classification|reflex|phenomenon|reaction))\b/g,
    /\b(pH\s*[\d.]+|pO2|pCO2|HbA1c|INR|PT|APTT|ESR|CRP|AST|ALT|ALP|GFR|creatinine)\b/gi,
    /\b(\d+\s*(mg|g|mmol|mEq|IU|U\/L|μmol|nmol|pmol)\/[dLlmgk]+)\b/gi,
  ];

  for (const pattern of patterns) {
    const matches = combined.match(pattern) ?? [];
    for (const m of matches) {
      const clean = m.trim();
      if (clean.length > 3 && !found.includes(clean)) found.push(clean);
    }
  }

  // Also extract the correct answer text (without option prefix)
  const answerText = correctAnswer.replace(/^[A-D][.)]\s*/, '').trim();
  if (answerText.length > 5 && answerText.length < 60 && !found.includes(answerText)) {
    found.unshift(answerText); // correct answer concept is highest priority
  }

  return found.slice(0, 3); // max 3 chips to avoid clutter
}
