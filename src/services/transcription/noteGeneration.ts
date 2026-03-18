import { generateTextWithRouting } from '../aiService';
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

export async function generateADHDNote(analysis: LectureAnalysis): Promise<string> {
  const input = `Subject: ${analysis.subject}
Topics: ${analysis.topics.join(', ')}
Key concepts:
${analysis.keyConcepts.map((c: string) => `- ${c}`).join('\n')}
High-yield facts:
${analysis.highYieldPoints.map((p: string) => `- ${p}`).join('\n')}
Summary: ${analysis.lectureSummary}`;

  try {
    const { text } = await generateTextWithRouting([
      { role: 'system', content: ADHD_NOTE_SYSTEM_PROMPT },
      { role: 'user', content: input },
    ]);
    return text.trim();
  } catch {
    console.warn('[NoteGen] ADHD note generation failed, using fallback.');
    return buildQuickLectureNote(analysis);
  }
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
