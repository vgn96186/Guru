/**
 * chatTools — Medical tool definitions for Vercel AI SDK
 * Uses Zod schemas for type-safe tool definitions
 */

import { z } from 'zod';
import { searchLatestMedicalSources, searchMedicalImages } from './medicalSearch';
import { generateStudyImage, buildChatImageContextKey } from '../studyImageService';
import type { GeneratedStudyImageStyle } from '../../db/queries/generatedStudyImages';
import type { ToolSet } from './v2/tool';
import { guruCoreTools } from './v2/tools';

// Search medical schema
const searchMedicalSchema = z.object({
  query: z.string().describe('The medical search query'),
  limit: z.number().optional().describe('Number of results to return (default: 5)'),
});

// Search reference images schema
const searchReferenceImagesSchema = z.object({
  query: z.string().describe('The image search query'),
  limit: z.number().optional().describe('Number of images to return (default: 3)'),
});

// Generate image schema
const generateImageSchema = z.object({
  prompt: z.string().describe('Detailed description of the image to generate'),
  style: z
    .enum(['illustration', 'chart'])
    .describe('Image style: illustration for anatomical diagrams, chart for flowcharts'),
});

// Tool implementations
const searchMedicalImpl = async (args: z.infer<typeof searchMedicalSchema>) => {
  try {
    const results = await searchLatestMedicalSources(args.query, args.limit ?? 5);
    return {
      results: results.map((r) => ({
        id: r.id,
        title: r.title,
        source: r.source,
        url: r.url,
        snippet: r.snippet,
        imageUrl: r.imageUrl,
        publishedAt: r.publishedAt,
      })),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Search failed',
      results: [],
    };
  }
};

const searchReferenceImagesImpl = async (args: z.infer<typeof searchReferenceImagesSchema>) => {
  try {
    const results = await searchMedicalImages(args.query, args.limit ?? 3);
    return {
      results: results
        .filter((r) => r.imageUrl)
        .map((r) => ({
          id: r.id,
          title: r.title,
          source: r.source,
          url: r.url,
          imageUrl: r.imageUrl,
          publishedAt: r.publishedAt,
        })),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Image search failed',
      results: [],
    };
  }
};

const createGenerateImageImpl =
  (topicName: string, getAssistantTimestamp?: () => number) =>
  async (args: z.infer<typeof generateImageSchema>) => {
    try {
      const timestamp = getAssistantTimestamp?.() ?? Date.now();
      const image = await generateStudyImage({
        contextType: 'chat',
        contextKey: buildChatImageContextKey(topicName, timestamp),
        topicName,
        sourceText: args.prompt,
        style: args.style as GeneratedStudyImageStyle,
      });
      return {
        image: {
          id: image.id,
          localUri: image.localUri,
          prompt: image.prompt,
          style: image.style,
        },
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Image generation failed',
      };
    }
  };

/**
 * Chat-specific tool overrides that require conversation context
 * (topic name + assistant-message timestamp for DB keys).
 * These win over any same-named tool in `guruCoreTools`.
 */
const createChatOverrides = (topicName: string, getAssistantTimestamp?: () => number): ToolSet => ({
  search_medical: {
    name: 'search_medical',
    description:
      'Search medical knowledge base (Wikipedia, Europe PMC, PubMed) for accurate medical information',
    inputSchema: searchMedicalSchema,
    execute: searchMedicalImpl,
  },
  search_reference_images: {
    name: 'search_reference_images',
    description: 'Search for medical reference images (anatomy diagrams, charts, illustrations)',
    inputSchema: searchReferenceImagesSchema,
    execute: searchReferenceImagesImpl,
  },
  generate_image: {
    name: 'generate_image',
    description: 'Generate a custom study image based on the conversation context',
    inputSchema: generateImageSchema,
    execute: createGenerateImageImpl(topicName, getAssistantTimestamp),
  },
});

/**
 * Full tool set for useChat: all `guruCoreTools` (planning, lecture, content,
 * medical) merged with chat-specific overrides that need topic/timestamp
 * context.
 *
 * Chat-specific entries win where names overlap (e.g. generate_image binds to
 * the current topic + assistant timestamp).
 */
export const createGuruChatTools = (
  topicName: string,
  getAssistantTimestamp?: () => number,
): ToolSet => ({
  ...(guruCoreTools as ToolSet),
  ...createChatOverrides(topicName, getAssistantTimestamp),
});
