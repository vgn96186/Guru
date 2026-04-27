import { and, desc, eq, inArray } from 'drizzle-orm';
import type {
  GeneratedStudyImageContextType,
  GeneratedStudyImageRecord,
  SaveGeneratedStudyImageInput,
} from '../../types/studyImages';
import { getDrizzleDb } from '../drizzle';
import { generatedStudyImages } from '../drizzleSchema';

export type GeneratedStudyImageRow = typeof generatedStudyImages.$inferSelect;

function mapGeneratedStudyImageRow(row: GeneratedStudyImageRow): GeneratedStudyImageRecord {
  return {
    id: row.id,
    contextType: row.contextType as GeneratedStudyImageContextType,
    contextKey: row.contextKey,
    topicId: row.topicId ?? null,
    topicName: row.topicName,
    lectureNoteId: row.lectureNoteId ?? null,
    style: row.style as GeneratedStudyImageRecord['style'],
    prompt: row.prompt,
    provider: row.provider,
    modelUsed: row.modelUsed,
    mimeType: row.mimeType,
    localUri: row.localUri,
    remoteUrl: row.remoteUrl ?? null,
    width: row.width ?? null,
    height: row.height ?? null,
    createdAt: row.createdAt,
  };
}

export const generatedStudyImagesRepositoryDrizzle = {
  async saveGeneratedStudyImage(
    input: SaveGeneratedStudyImageInput,
  ): Promise<GeneratedStudyImageRecord> {
    const db = getDrizzleDb();
    const createdAt = Date.now();
    const insertedRows = await db
      .insert(generatedStudyImages)
      .values({
        contextType: input.contextType,
        contextKey: input.contextKey,
        topicId: input.topicId ?? null,
        topicName: input.topicName,
        lectureNoteId: input.lectureNoteId ?? null,
        style: input.style,
        prompt: input.prompt,
        provider: input.provider,
        modelUsed: input.modelUsed,
        mimeType: input.mimeType,
        localUri: input.localUri,
        remoteUrl: input.remoteUrl ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        createdAt,
      })
      .returning({ id: generatedStudyImages.id });

    return {
      id: insertedRows[0]?.id ?? 0,
      contextType: input.contextType,
      contextKey: input.contextKey,
      topicId: input.topicId ?? null,
      topicName: input.topicName,
      lectureNoteId: input.lectureNoteId ?? null,
      style: input.style,
      prompt: input.prompt,
      provider: input.provider,
      modelUsed: input.modelUsed,
      mimeType: input.mimeType,
      localUri: input.localUri,
      remoteUrl: input.remoteUrl ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      createdAt,
    };
  },

  async getGeneratedStudyImagesForContext(
    contextType: GeneratedStudyImageContextType,
    contextKey: string,
  ): Promise<GeneratedStudyImageRecord[]> {
    const db = getDrizzleDb();
    const rows = await db
      .select()
      .from(generatedStudyImages)
      .where(
        and(
          eq(generatedStudyImages.contextType, contextType),
          eq(generatedStudyImages.contextKey, contextKey),
        ),
      )
      .orderBy(desc(generatedStudyImages.createdAt));

    return rows.map(mapGeneratedStudyImageRow);
  },

  async listGeneratedStudyImages(limit = 500): Promise<GeneratedStudyImageRecord[]> {
    const db = getDrizzleDb();
    const rows = await db
      .select()
      .from(generatedStudyImages)
      .orderBy(desc(generatedStudyImages.createdAt))
      .limit(limit);

    return rows.map(mapGeneratedStudyImageRow);
  },

  async listGeneratedStudyImagesForContexts(
    contextType: GeneratedStudyImageContextType,
    contextKeys: string[],
  ): Promise<GeneratedStudyImageRecord[]> {
    const normalizedKeys = Array.from(new Set(contextKeys.map((key) => key.trim()).filter(Boolean)));
    if (normalizedKeys.length === 0) {
      return [];
    }

    const db = getDrizzleDb();
    const rows = await db
      .select()
      .from(generatedStudyImages)
      .where(
        and(
          eq(generatedStudyImages.contextType, contextType),
          inArray(generatedStudyImages.contextKey, normalizedKeys),
        ),
      )
      .orderBy(desc(generatedStudyImages.createdAt));

    return rows.map(mapGeneratedStudyImageRow);
  },

  async listGeneratedStudyImagesForTopic(
    contextType: GeneratedStudyImageContextType,
    topicName: string,
  ): Promise<GeneratedStudyImageRecord[]> {
    const db = getDrizzleDb();
    const rows = await db
      .select()
      .from(generatedStudyImages)
      .where(
        and(
          eq(generatedStudyImages.contextType, contextType),
          eq(generatedStudyImages.topicName, topicName),
        ),
      )
      .orderBy(desc(generatedStudyImages.createdAt));

    return rows.map(mapGeneratedStudyImageRow);
  },
};
