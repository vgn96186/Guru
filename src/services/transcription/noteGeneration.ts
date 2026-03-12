import { generateTextWithRouting } from '../aiService';
import type { LectureAnalysis } from './analysis';

const ADHD_NOTE_SYSTEM_PROMPT = `You create study notes for a medical student with ADHD.
Rules:
- SCANNABLE: Short chunks, never walls of text. Max 250 words total.
- VISUAL: Use emoji anchors so the eye has landmarks.
- MEMORABLE: Include one weird/funny mnemonic or analogy for the hardest concept.
- ACTIONABLE: End with 2 quick self-test questions.
`;

export async function generateADHDNote(analysis: LectureAnalysis): Promise<string> {
  const input = `Subject: ${analysis.subject}
Topics: ${analysis.topics.join(', ')}
Key concepts:
${analysis.keyConcepts.map(c => `- ${c}`).join('\n')}
Summary: ${analysis.lectureSummary}`;

  try {
    const { text } = await generateTextWithRouting(
      [
        { role: 'system', content: ADHD_NOTE_SYSTEM_PROMPT },
        { role: 'user', content: input },
      ],
    );
    return text.trim();
  } catch (e) {
    console.warn('[NoteGen] ADHD note generation failed, using fallback.');
    return buildQuickLectureNote(analysis);
  }
}

export function buildQuickLectureNote(analysis: LectureAnalysis): string {
  const topicStr = analysis.topics.length > 0 ? analysis.topics[0] : analysis.subject;
  const points = analysis.keyConcepts.map((c, i) => `${i + 1}. ${c}`).join('\n');

  return `# ${topicStr} — ${analysis.lectureSummary}
## Key Points
${points || '(No key concepts extracted)'}
## Quick Self-Test
- Q: What are the main concepts from this ${analysis.subject} lecture?
`;
}
