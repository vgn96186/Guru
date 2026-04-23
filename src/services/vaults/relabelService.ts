import { z } from 'zod';
import { generateJSONWithRouting } from '../ai/generate';
import type { Message } from '../ai/types';

export const NoteLabelSchema = z.object({
  subject: z
    .string()
    .describe('NEET-PG medical subject (e.g. "Anatomy", "Pharmacology", "Pathology")'),
  title: z
    .string()
    .describe(
      'Short note title — noun phrase only, no verbs (e.g. "Cardiac Valves & Murmurs", "Beta Blockers — MOA & Side Effects")',
    ),
  topics: z.array(z.string()).describe('2-5 specific medical topics covered'),
});

export async function aiRelabelNote(
  noteText: string,
): Promise<{ subject: string; title: string; topics: string[] } | null> {
  try {
    const snippet = noteText.split(/\s+/).slice(0, 800).join(' ');
    const messages: Message[] = [
      {
        role: 'system',
        content: `You label medical study notes. Return a subject, title, and topics.

TITLE RULES:
- Must be a short noun phrase like a textbook chapter heading (max 60 chars)
- NEVER start with "This note covers", "Focuses on", "Overview of", "The note discusses" or similar
- Good: "Cardiac Valves & Murmurs", "Iron Deficiency Anemia", "Brachial Plexus Injuries"
- Bad: "This note covers cardiac anatomy", "Focuses on iron metabolism"

Subject must be one of: Anatomy, Physiology, Biochemistry, Pathology, Pharmacology, Microbiology, Forensic Medicine, ENT, Ophthalmology, Community Medicine, Surgery, Medicine, OBG, Pediatrics, Orthopedics, Dermatology, Psychiatry, Radiology, Anesthesia.`,
      },
      { role: 'user', content: snippet },
    ];
    const { parsed } = await generateJSONWithRouting(
      messages,
      NoteLabelSchema,
      'low',
      false,
      'groq',
    );
    return parsed;
  } catch {
    return null;
  }
}
