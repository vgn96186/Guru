import { generateTextWithRouting } from '../aiService';
import type { LectureAnalysis } from './analysis';

const ADHD_NOTE_SYSTEM_PROMPT = `You create elite medical study notes for a NEET-PG student with ADHD.
Rules:
- STRUCTURE: Use clear emoji headers: 🎯 **Subject**, 📌 **Topics**, 💡 **Key Concepts**, 🚀 **High-Yield Facts**.
- HIGHLIGHTS: Use markdown bolding (**keyword**) for clinical anchors, specific drug names, and diagnostic criteria.
- SCANNABLE: Short bullet points, never walls of text. Max 220 words total.
- VISUAL: Use emoji anchors throughout.
- MEMORABLE: Include one brief mnemonic or clinical anchor for the most tested concept.
- ACTIONABLE: End with 2 quick "check-your-understanding" questions.
`;

export async function generateADHDNote(analysis: LectureAnalysis): Promise<string> {
  const input = `Subject: ${analysis.subject}
Topics: ${analysis.topics.join(', ')}
Key concepts:
${analysis.keyConcepts.map((c) => `- ${c}`).join('\n')}
High-yield facts:
${analysis.highYieldPoints.map((p) => `- ${p}`).join('\n')}
Summary: ${analysis.lectureSummary}`;

  try {
    const { text } = await generateTextWithRouting([
      { role: 'system', content: ADHD_NOTE_SYSTEM_PROMPT },
      { role: 'user', content: input },
    ]);
    return text.trim();
  } catch (e) {
    console.warn('[NoteGen] ADHD note generation failed, using fallback.');
    return buildQuickLectureNote(analysis);
  }
}

export function buildQuickLectureNote(analysis: LectureAnalysis): string {
  const topicStr = analysis.topics.length > 0 ? analysis.topics[0] : analysis.subject;
  const conceptPoints = analysis.keyConcepts.map((c) => `• ${c}`).join('\n');
  const highYieldPoints = analysis.highYieldPoints.map((p) => `🚀 **${p}**`).join('\n');

  return `🎯 **Subject**: ${analysis.subject}
📌 **Topics**: ${analysis.topics.join(', ')}

💡 **Key Concepts**
${conceptPoints || '(No key concepts captured)'}

${highYieldPoints ? `\n🚀 **High-Yield Facts**\n${highYieldPoints}` : ''}

📝 **Summary**: ${analysis.lectureSummary}

---
🧠 **Quick Self-Test**
- Q: What is the most high-yield takeaway from this ${analysis.subject} lecture?
`;
}
