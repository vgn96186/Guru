import { generateTextWithRouting } from '../aiService';
import { DEFAULT_PROVIDER_ORDER } from '../../types';
import type { LectureAnalysis } from './analysis';

const ADHD_NOTE_SYSTEM_PROMPT = `You create elite medical study notes for a NEET-PG student with ADHD.
Rules:
- STRUCTURE: Use clear emoji headers: 🎯 **Subject**, 📌 **Topics**, 💡 **Key Concepts**, 🚀 **High-Yield Facts**, 🧠 **Clinical Links**, 📝 **Integrated Summary**, ❓ **Check Yourself**.
- HIGHLIGHTS: Use markdown bolding (**keyword**) for clinical anchors, specific drug names, mechanisms, contraindications, diagnostic criteria, staging, scoring systems, and hallmark associations.
- SCANNABLE: Short bullets, compact subsections, never walls of text. Ensure comprehensive coverage of the ENTIRE lecture, not just the opening or closing segments.
- STITCHING: Assume the source transcript may have been split and merged from multiple chunks. Your job is to produce ONE coherent note with no repetition, no abrupt transitions, and no chunk-boundary artifacts.
- COMPLETENESS: Preserve all exam-relevant details that appear in the transcript, including differentials, definitions, classifications, investigations, treatment steps, side effects, exceptions, and classic traps.
- PRIORITIZATION: Emphasize what is most testable for NEET-PG/INICET, but do not omit secondary details if they help understanding.
- VISUAL: Use emoji anchors throughout.
- MEMORABLE: Include one brief mnemonic or clinical anchor for the most tested concept.
- ACTIONABLE: End with 2-4 quick "check-your-understanding" questions.
- OUTPUT: Return polished markdown only. Do not mention chunking, splitting, or missing context.
`;

const NOTE_HEADERS = [
  '🎯 **Subject**',
  '📌 **Topics**',
  '💡 **Key Concepts**',
  '🚀 **High-Yield Facts**',
  '🧠 **Clinical Links**',
  '📝 **Integrated Summary**',
  '❓ **Check Yourself**',
] as const;

function scoreLectureNote(note: string): number {
  const trimmed = note.trim();
  if (!trimmed) return 0;

  const headerScore = NOTE_HEADERS.reduce(
    (score, header) => score + (trimmed.includes(header) ? 2 : 0),
    0,
  );
  const bulletCount = (trimmed.match(/^[-•]\s/gm) ?? []).length;
  const boldCount = (trimmed.match(/\*\*[^*]+\*\*/g) ?? []).length;
  const questionCount = (trimmed.match(/^\s*[-•]\s+Q:|^\s*\d+\.\s+/gm) ?? []).length;
  const detailScore = Math.min(4, Math.floor(trimmed.length / 400));

  return (
    headerScore +
    Math.min(3, bulletCount) +
    Math.min(3, Math.floor(boldCount / 3)) +
    Math.min(2, questionCount) +
    detailScore
  );
}

export function shouldReplaceLectureNote(currentNote: string, candidateNote: string): boolean {
  const current = currentNote.trim();
  const candidate = candidateNote.trim();

  if (!candidate) return false;
  if (!current) return true;
  if (candidate === current) return false;

  const currentScore = scoreLectureNote(current);
  const candidateScore = scoreLectureNote(candidate);

  if (candidateScore >= currentScore + 2) return true;
  if (candidateScore >= currentScore && candidate.length >= current.length + 200) return true;
  return false;
}

export async function generateADHDNote(analysis: LectureAnalysis): Promise<string> {
  const transcriptExcerpt = buildTranscriptExcerpt(analysis.transcript);
  const input = `Subject: ${analysis.subject}
Topics: ${analysis.topics.join(', ')}
Key concepts:
${analysis.keyConcepts.map((c: string) => `- ${c}`).join('\n')}
High-yield facts:
${analysis.highYieldPoints.map((p: string) => `- ${p}`).join('\n')}
Summary: ${analysis.lectureSummary}

Transcript:
${transcriptExcerpt || '(No transcript available)'}`;

  try {
    const { text } = await generateTextWithRouting(
      [
        { role: 'system', content: ADHD_NOTE_SYSTEM_PROMPT },
        { role: 'user', content: input },
      ],
      { providerOrderOverride: DEFAULT_PROVIDER_ORDER },
    );
    return text.trim();
  } catch {
    console.warn('[NoteGen] ADHD note generation failed, using fallback.');
    return buildQuickLectureNote(analysis);
  }
}

function buildTranscriptExcerpt(transcript: string | undefined, maxChars = 12000): string {
  const trimmed = transcript?.trim() ?? '';
  if (!trimmed) return '';
  if (trimmed.length <= maxChars) return trimmed;

  const headSize = 4500;
  const middleSize = 3000;
  const tailSize = 4500;
  const middleStart = Math.max(0, Math.floor((trimmed.length - middleSize) / 2));
  const middleEnd = Math.min(trimmed.length, middleStart + middleSize);

  return [
    trimmed.slice(0, headSize).trim(),
    trimmed.slice(middleStart, middleEnd).trim(),
    trimmed.slice(-tailSize).trim(),
  ]
    .filter(Boolean)
    .join('\n\n[...]\n\n');
}

export function buildQuickLectureNote(analysis: LectureAnalysis): string {
  const conceptPoints = analysis.keyConcepts.map((c: string) => `• ${c}`).join('\n');
  const highYieldPoints = analysis.highYieldPoints.map((p: string) => `🚀 **${p}**`).join('\n');

  return `🎯 **Subject**: ${analysis.subject}
📌 **Topics**: ${analysis.topics.join(', ')}

💡 **Key Concepts**
${conceptPoints || '(No key concepts captured)'}

${highYieldPoints ? `\n🚀 **High-Yield Facts**\n${highYieldPoints}` : ''}

📝 **Integrated Summary**
${analysis.lectureSummary}

---
❓ **Check Yourself**
- Q: What is the most high-yield takeaway from this ${analysis.subject} lecture?
`;
}
