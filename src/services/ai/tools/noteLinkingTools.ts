// AI SDK tool for semantic note tagging
import { tool } from 'ai';
import { z } from 'zod';
import { getDb } from '../../db/database';

export const tagNoteTool = tool({
  description:
    'Tag a note with semantic labels. Tags are stored as JSON metadata in the user_notes field.',
  inputSchema: z.object({
    noteId: z.number().describe('The topic ID to tag'),
    tags: z.array(z.string()).describe('Array of semantic tags to apply'),
  }),
  execute: async ({ noteId, tags }) => {
    const db = await getDb();

    // Get current user notes
    const row = await db.getFirstAsync<{ user_notes: string }>(
      'SELECT user_notes FROM topic_progress WHERE topic_id = ?',
      [noteId],
    );

    if (!row) {
      return { error: `Topic with ID ${noteId} not found` };
    }

    // Parse existing notes as JSON or create new structure
    let noteData: { text?: string; tags?: string[] } = {};
    try {
      noteData = row.user_notes ? JSON.parse(row.user_notes) : {};
    } catch {
      noteData = { text: row.user_notes || '' };
    }

    // Merge tags
    const existingTags = noteData.tags || [];
    const mergedTags = Array.from(new Set([...existingTags, ...tags]));

    // Update note data
    noteData.tags = mergedTags;

    // Save back
    await db.runAsync('UPDATE topic_progress SET user_notes = ? WHERE topic_id = ?', [
      JSON.stringify(noteData),
      noteId,
    ]);

    return {
      success: true,
      noteId,
      tags: mergedTags,
    };
  },
});
