/**
 * Guru medical tools — definitions the model can call mid-stream.
 *
 * Each tool is a thin wrapper around existing services. The agentic loop in
 * streamText handles invocation, schema validation, and result feeding.
 */

import { z } from 'zod';
import { tool } from '../tool';
import { searchLatestMedicalSources } from '../../medicalSearch';
import { getDrizzleDb } from '../../../../db/drizzle';
import { topics, topicProgress, questionBank } from '../../../../db/drizzleSchema';
import { sql, like, eq } from 'drizzle-orm';

/**
 * search_medical — PubMed / EuropePMC / Wikipedia / Brave (whichever are
 * configured). Returns a trimmed list the model can cite.
 */
export const searchMedicalTool = tool({
  name: 'search_medical',
  description:
    'Search authoritative medical sources (PubMed, EuropePMC, Wikipedia) for a clinical topic. Use when the user asks about diseases, mechanisms, drugs, or needs citations. Prefer this over guessing.',
  inputSchema: z.object({
    query: z.string().describe('Focused clinical search phrase, e.g. "SGLT2 inhibitor mechanism"'),
    maxResults: z.number().optional(),
  }),
  execute: async ({ query, maxResults }) => {
    const sources = await searchLatestMedicalSources(query, maxResults ?? 5);
    return {
      results: sources.map((s) => ({
        title: s.title,
        url: s.url,
        snippet: s.snippet,
        source: s.source,
        journal: s.journal,
        publishedAt: s.publishedAt,
      })),
    };
  },
});

/**
 * lookup_topic — find a topic in Guru's NEET-PG syllabus and return the
 * user's current progress (status, confidence, FSRS stability). Lets the
 * AI tailor explanations to what the user already knows.
 */
export const lookupTopicTool = tool({
  name: 'lookup_topic',
  description:
    "Look up a topic in the user's NEET-PG syllabus by name. Returns the user's current progress (status, confidence, FSRS stability) so you can tailor the explanation. Use at the start of a study-related answer.",
  inputSchema: z.object({
    name: z
      .string()
      .describe('Topic name as it would appear in the syllabus, e.g. "Diabetes mellitus"'),
  }),
  execute: async ({ name }) => {
    const db = getDrizzleDb();
    const rows = await db
      .select({
        id: topics.id,
        name: topics.name,
        status: topicProgress.status,
        confidence: topicProgress.confidence,
        subject_id: topics.subjectId,
        stability: topicProgress.fsrsStability,
      })
      .from(topics)
      .leftJoin(topicProgress, eq(topicProgress.topicId, topics.id))
      .where(like(sql`lower(${topics.name})`, `%${name.toLowerCase()}%`))
      .orderBy(sql`LENGTH(${topics.name}) ASC`)
      .limit(1);
    const row = rows[0];
    if (!row) return { found: false, name };
    return {
      found: true,
      id: row.id,
      name: row.name,
      status: row.status ?? 'unseen',
      confidence: row.confidence ?? 0,
      subjectId: row.subject_id,
      fsrsStability: row.stability,
    };
  },
});

/**
 * get_quiz_questions — pull MCQs from the user's question bank for a given
 * topic. Useful when the AI wants to reinforce the explanation with a quick
 * self-test.
 */
export const getQuizQuestionsTool = tool({
  name: 'get_quiz_questions',
  description:
    "Fetch MCQs from the user's question bank for a given topic id. Use to reinforce an explanation with practice.",
  inputSchema: z.object({
    topicId: z.number(),
    limit: z.number().optional(),
  }),
  execute: async ({ topicId, limit }) => {
    const db = getDrizzleDb();
    const rowsRaw = await db
      .select({
        id: questionBank.id,
        stem: questionBank.question,
        options_json: questionBank.options,
        correct_index: questionBank.correctIndex,
        explanation: questionBank.explanation,
      })
      .from(questionBank)
      .where(eq(questionBank.topicId, topicId))
      .orderBy(sql`RANDOM()`)
      .limit(limit ?? 3);
    const rows = rowsRaw.map((r) => ({
      id: r.id,
      stem: r.stem,
      options_json: r.options_json ?? '[]',
      correct_index: r.correct_index,
      explanation: r.explanation,
    }));
    return {
      questions: rows.map((r) => ({
        id: r.id,
        stem: r.stem,
        options: safeParseArray(r.options_json),
        correctIndex: r.correct_index,
        explanation: r.explanation,
      })),
    };
  },
});

function safeParseArray(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/** Standard tool set Guru Chat should expose. */
/**
 * generate_image — generate a study image (illustration or chart) for a topic.
 */
export const generateImageTool = tool({
  name: 'generate_image',
  description:
    'Generate a study image (illustration or chart) to help explain a medical concept visually.',
  inputSchema: z.object({
    topicName: z.string().describe('The medical topic to illustrate'),
    sourceText: z.string().describe('The text content to base the image on'),
    style: z.enum(['illustration', 'chart']).describe('The style of the image'),
  }),
  execute: async ({ topicName, sourceText, style }) => {
    // We dynamically import to avoid circular dependencies
    const { generateStudyImage } = await import('../../../studyImageService');
    try {
      const image = await generateStudyImage({
        contextType: 'chat',
        contextKey: `tool-gen-${Date.now()}`,
        topicName,
        sourceText,
        style,
      });
      return { success: true, image };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
});

/**
 * save_to_notes — save an important fact or explanation to the user's notes.
 */
export const saveToNotesTool = tool({
  name: 'save_to_notes',
  description:
    "Save an important medical fact or explanation to the user's personal notes for later review.",
  inputSchema: z.object({
    topicId: z.number().describe('The ID of the syllabus topic this note belongs to'),
    content: z.string().describe('The markdown content to save as a note'),
  }),
  execute: async ({ topicId, content }) => {
    const db = getDrizzleDb();
    try {
      const existing = await db
        .select({ notes: topicProgress.userNotes })
        .from(topicProgress)
        .where(eq(topicProgress.topicId, topicId))
        .limit(1);

      const newNotes = existing[0]?.notes
        ? `${existing[0].notes}\n\n[Guru AI Note]:\n${content}`
        : `[Guru AI Note]:\n${content}`;

      await db
        .insert(topicProgress)
        .values({ topicId, userNotes: newNotes })
        .onConflictDoUpdate({
          target: topicProgress.topicId,
          set: { userNotes: newNotes },
        });

      return { success: true, message: 'Note saved successfully.' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
});

/**
 * mark_topic_reviewed — mark a topic as reviewed in the user's progress.
 * Requires user approval.
 */
export const markTopicReviewedTool = tool({
  name: 'mark_topic_reviewed',
  description:
    'Mark a syllabus topic as reviewed after the user has successfully demonstrated understanding. Requires user approval.',
  inputSchema: z.object({
    topicId: z.number().describe('The ID of the syllabus topic to mark as reviewed'),
    confidence: z
      .number()
      .min(1)
      .max(5)
      .describe('Estimated confidence level from 1 to 5 based on the chat'),
  }),
  needsApproval: true,
  execute: async ({ topicId, confidence }) => {
    const db = getDrizzleDb();
    try {
      await db
        .update(topicProgress)
        .set({ status: 'reviewed', confidence, lastStudiedAt: Date.now() })
        .where(eq(topicProgress.topicId, topicId));
      return { success: true, message: 'Topic marked as reviewed.' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
});

/** Standard tool set Guru Chat should expose. */
/**
 * fact_check — check a medical claim against trusted sources.
 */
export const factCheckTool = tool({
  name: 'fact_check',
  description:
    'Check a specific medical claim against trusted sources (PubMed, Wikipedia, user lectures) to verify its accuracy.',
  inputSchema: z.object({
    claim: z.string().describe('The specific medical claim to verify'),
    topicName: z.string().optional().describe('The broader topic context'),
  }),
  execute: async ({ claim, topicName }) => {
    // Dynamically import to avoid circular dependencies
    const { extractMedicalEntities, extractClaims } = await import('../../medicalEntities');
    const { calculateTextSimilarity, detectContradictions } =
      await import('../../medicalFactCheck');

    const entities = extractMedicalEntities(claim);
    const claims = extractClaims(claim, entities.drugs, entities.diseases);

    if (entities.drugs.length === 0 && entities.diseases.length === 0) {
      return {
        status: 'inconclusive',
        message: 'No specific drugs or diseases detected in the claim to verify.',
      };
    }

    // Get trusted sources (simplified version of getTrustedSources)
    const sources: Array<{ source: string; text: string }> = [];
    try {
      const searchQuery = [...entities.drugs.slice(0, 3), ...entities.diseases.slice(0, 3)].join(
        ' ',
      );
      const searchResults = await searchLatestMedicalSources(
        `${searchQuery} ${topicName ?? ''}`,
        3,
      );
      sources.push(
        ...searchResults.map((s) => ({
          source: s.source,
          text: `${s.title} ${s.snippet}`,
        })),
      );
    } catch {
      // Ignore search errors
    }

    if (sources.length === 0) {
      return {
        status: 'inconclusive',
        message: 'Could not find trusted sources to verify the claim.',
      };
    }

    const contradictions = detectContradictions(claims, sources);

    if (contradictions.length > 0) {
      return {
        status: 'contradiction_found',
        contradictions: contradictions.map((c) => ({
          claim: c.claim,
          source: c.trustedSource,
          sourceText: c.trustedText,
        })),
      };
    }

    return { status: 'verified', message: 'No contradictions found in trusted sources.' };
  },
});

/**
 * fetch_exam_dates — look up INICET and NEET-PG exam dates via Brave Search
 * (or fall back to web scraping). Returns ISO dates and sources.
 */
export const fetchExamDatesTool = tool({
  name: 'fetch_exam_dates',
  description:
    'Fetch the latest official exam dates for INICET and NEET-PG from the web. Uses Brave Search when available, falls back to scraping educational sites. Returns ISO date strings and source URLs.',
  inputSchema: z.object({
    exams: z
      .array(z.enum(['inicet', 'neetpg']))
      .optional()
      .describe('Which exams to look up. Defaults to both.'),
  }),
  execute: async ({ exams }) => {
    const { fetchExamDatesViaBrave } = await import('../../../examDateSyncService');
    const result = await fetchExamDatesViaBrave();
    const requested = exams ?? ['inicet', 'neetpg'];
    return {
      method: result.method,
      inicetDate: requested.includes('inicet') ? result.inicetDate : undefined,
      neetDate: requested.includes('neetpg') ? result.neetDate : undefined,
      inicetSources: result.inicetSources,
      neetSources: result.neetSources,
    };
  },
});

/**
 * generate_mindmap — create a visual mind map for a medical topic.
 * Organizes concepts hierarchically with center topic and branches.
 */
export const generateMindmapTool = tool({
  name: 'generate_mindmap',
  description:
    'Generate a visual mind map for a medical topic. Creates hierarchical structure with center topic and branches covering etiology, pathophysiology, clinical features, investigations, management, etc. Saves to database for later viewing.',
  inputSchema: z.object({
    topic: z
      .string()
      .describe('The medical topic to create a mind map for, e.g. "Diabetes Mellitus"'),
    subject: z.string().optional().describe('Optional subject context, e.g. "Medicine"'),
    depth: z
      .enum(['compact', 'rich'])
      .optional()
      .describe('Detail level: compact for quick review, rich for comprehensive study'),
  }),
  execute: async ({ topic, subject, depth = 'rich' }) => {
    const { generateMindMap } = await import('../../../mindMapAI');
    const { createMindMap, bulkInsertNodesAndEdges } =
      await import('../../../../db/queries/mindMaps');

    try {
      // Generate the mind map layout
      const layout = await generateMindMap(topic, subject, depth);

      // Create the mind map in the database
      const mapId = await createMindMap(topic);

      // Insert nodes and edges
      const layoutNodes = layout.nodes.map((ln) => ({
        label: ln.label,
        x: ln.x,
        y: ln.y,
        isCenter: ln.isCenter,
      }));
      await bulkInsertNodesAndEdges(mapId, layoutNodes, layout.edges);

      return {
        success: true,
        mapId,
        topic,
        nodeCount: layout.nodes.length,
        edgeCount: layout.edges.length,
        message: `Mind map created with ${layout.nodes.length} nodes. Open MindMap screen to view.`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate mind map',
      };
    }
  },
});

/**
 * generate_flashcards — create spaced repetition flashcards for a topic.
 * Generates question/answer pairs optimized for medical exam retention.
 */
export const generateFlashcardsTool = tool({
  name: 'generate_flashcards',
  description:
    'Generate spaced repetition flashcards for a medical topic. Creates question/answer pairs with high-yield facts, buzzwords, and exam-focused content. Saves to database for review.',
  inputSchema: z.object({
    topicName: z.string().describe('The medical topic to generate flashcards for'),
    cardCount: z
      .number()
      .min(3)
      .max(20)
      .optional()
      .describe('Number of flashcards to generate (default: 8)'),
    focus: z
      .enum(['high_yield', 'comprehensive', 'clinical_only', 'basic_only'])
      .optional()
      .describe('Content focus: high_yield for exam facts, comprehensive for full coverage'),
  }),
  execute: async ({ topicName, cardCount = 8, focus = 'high_yield' }) => {
    const { getDrizzleDb } = await import('../../../../db/drizzle');
    const { topics } = await import('../../../../db/drizzleSchema');
    const { sql, like } = await import('drizzle-orm');
    const db = getDrizzleDb();

    try {
      // Find the topic
      const rows = await db
        .select({ id: topics.id, name: topics.name, subject_id: topics.subjectId })
        .from(topics)
        .where(like(sql`lower(${topics.name})`, `%${topicName.toLowerCase()}%`))
        .orderBy(sql`LENGTH(${topics.name}) ASC`)
        .limit(1);
      const topicRow = rows[0];

      if (!topicRow) {
        return { error: `Topic not found matching "${topicName}"` };
      }

      // Generate flashcards via content generation
      const { generateObject } = await import('ai');
      const { createGuruFallbackModel } = await import('../providers/guruFallback');
      const { profileRepository } = await import('../../../../db/repositories/profileRepository');
      const { AIContentSchema } = await import('../../schemas');

      const profile = await profileRepository.getProfile();
      const model = createGuruFallbackModel({ profile }) as any;

      const focusPrompt =
        focus === 'high_yield'
          ? 'Focus on high-yield exam facts, buzzwords, triads, gold-standard tests, and first-line treatments.'
          : focus === 'clinical_only'
            ? 'Focus only on clinical presentation, diagnosis, and management.'
            : focus === 'basic_only'
              ? 'Focus on basic sciences: anatomy, physiology, pathology mechanisms.'
              : 'Cover the topic comprehensively across all dimensions.';

      const userPrompt = `Generate ${cardCount} flashcards for "${topicRow.name}".
${focusPrompt}

Each flashcard should have:
- Front: A clear question (can include "What is...", "Why does...", "Name the...", "Identify...")
- Back: A concise answer with the key fact
- Optional imageSearchQuery: If a visual would help (anatomy, pathology, imaging)

Return valid JSON matching the flashcards schema.`;

      const result = await generateObject({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are Guru, a NEET-PG/INICET medical tutor. Generate high-quality flashcards optimized for spaced repetition.',
          },
          { role: 'user', content: userPrompt },
        ],
        schema: AIContentSchema,
      });

      if (result.object.type !== 'flashcards') {
        return { error: 'Failed to generate flashcards - wrong content type returned' };
      }

      // Save flashcards to database
      const { setCachedContent } = await import('../../../../db/queries/aiCache');
      await setCachedContent(
        topicRow.id,
        'flashcards',
        result.object,
        `${model.provider}/${model.modelId}`,
      );

      return {
        success: true,
        topicId: topicRow.id,
        topicName: topicRow.name,
        cardCount: result.object.cards.length,
        cards: result.object.cards.map((c) => ({
          front: c.front || (c as unknown as { question: string }).question,
          back: c.back || (c as unknown as { answer: string }).answer,
        })),
        message: `Generated ${result.object.cards.length} flashcards for ${topicRow.name}. View in topic details.`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate flashcards',
      };
    }
  },
});

/** Standard tool set Guru Chat should expose. */
export const guruMedicalTools = {
  search_medical: searchMedicalTool,
  lookup_topic: lookupTopicTool,
  get_quiz_questions: getQuizQuestionsTool,
  generate_image: generateImageTool,
  save_to_notes: saveToNotesTool,
  mark_topic_reviewed: markTopicReviewedTool,
  fact_check: factCheckTool,
  fetch_exam_dates: fetchExamDatesTool,
  generate_mindmap: generateMindmapTool,
  generate_flashcards: generateFlashcardsTool,
};
