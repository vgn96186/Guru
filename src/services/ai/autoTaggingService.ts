/**
 * AutoTaggingService — Background semantic organization for notes.
 *
 * Uses Gemini Nano (local) or cloud fallbacks to analyze notes and apply
 * semantic tags using the tag_note tool.
 */

import { generateText } from 'ai';
import type { LanguageModel } from '@ai-sdk/provider';
import { createGuruFallbackModel } from './v2/providers/guruFallback';
import { profileRepository } from '../../db/repositories';
import { tagNoteTool } from './tools/noteLinkingTools';

export async function triggerAutoTagging(
  noteId: number,
  content: string,
  noteType: 'lecture' | 'topic' = 'lecture',
) {
  // Run in background to not block the UI or the main save pipeline
  void (async () => {
    try {
      if (__DEV__) console.log(`[AutoTagging] Starting for note ${noteId}...`);

      const profile = await profileRepository.getProfile();
      // createGuruFallbackModel will automatically prefer Gemini Nano if available/enabled
      const model = createGuruFallbackModel({
        profile,
        textMode: true,
      }) as unknown as LanguageModel;

      await generateText({
        model,
        tools: {
          tag_note: tagNoteTool,
        },
        prompt: `
          You are a medical study assistant. Analyze the following study note and apply 2-4 highly relevant semantic tags (e.g., subject names, specific diseases, or "High Yield") using the tag_note tool.
          
          Note Content:
          "${content.slice(0, 4000)}"
          
          Note ID: ${noteId}
          Note Type: ${noteType}
        `,
      });

      if (__DEV__) console.log(`[AutoTagging] Completed for note ${noteId}`);
    } catch (err) {
      if (__DEV__) console.error(`[AutoTagging] Failed for note ${noteId}:`, err);
    }
  })();
}
