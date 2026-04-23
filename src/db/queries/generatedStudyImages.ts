import { generatedStudyImagesRepositoryDrizzle } from '../repositories/generatedStudyImagesRepository.drizzle';
import { getDrizzleDb } from '../drizzle';
import { generatedStudyImages } from '../drizzleSchema';
import { and, desc, eq, inArray } from 'drizzle-orm';

export type GeneratedStudyImageContextType = 'chat' | 'topic_note' | 'lecture_note';
export type GeneratedStudyImageStyle = 'illustration' | 'chart';

export interface GeneratedStudyImageRecord {
  id: number;
  contextType: GeneratedStudyImageContextType;
  contextKey: string;
  topicId: number | null;
  topicName: string;
  lectureNoteId: number | null;
  style: GeneratedStudyImageStyle;
  prompt: string;
  provider: string;
  modelUsed: string;
  mimeType: string;
  localUri: string;
  remoteUrl: string | null;
  width: number | null;
  height: number | null;
  createdAt: number;
}

export interface SaveGeneratedStudyImageInput {
  contextType: GeneratedStudyImageContextType;
  contextKey: string;
  topicId?: number | null;
  topicName: string;
  lectureNoteId?: number | null;
  style: GeneratedStudyImageStyle;
  prompt: string;
  provider: string;
  modelUsed: string;
  mimeType: string;
  localUri: string;
  remoteUrl?: string | null;
  width?: number | null;
  height?: number | null;
}

function mapRow(row: typeof generatedStudyImages.$inferSelect): GeneratedStudyImageRecord {
  return {
    id: row.id,
    contextType: row.contextType as GeneratedStudyImageContextType,
    contextKey: row.contextKey,
    topicId: row.topicId,
    topicName: row.topicName,
    lectureNoteId: row.lectureNoteId,
    style: row.style as GeneratedStudyImageStyle,
    prompt: row.prompt,
    provider: row.provider,
    modelUsed: row.modelUsed,
    mimeType: row.mimeType,
    localUri: row.localUri,
    remoteUrl: row.remoteUrl,
    width: row.width,
    height: row.height,
    createdAt: row.createdAt,
  };
}

export async function saveGeneratedStudyImage(
  input: SaveGeneratedStudyImageInput,
): Promise<GeneratedStudyImageRecord> {
  return generatedStudyImagesRepositoryDrizzle.saveGeneratedStudyImage(input);
}

export async function getGeneratedStudyImagesForContext(
  contextType: GeneratedStudyImageContextType,
  contextKey: string,
): Promise<GeneratedStudyImageRecord[]> {
  return generatedStudyImagesRepositoryDrizzle.getGeneratedStudyImagesForContext(
    contextType,
    contextKey,
  );
}

export async function listGeneratedStudyImagesForContexts(
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

  return rows.map(mapRow);
}

export async function listGeneratedStudyImagesForTopic(
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

  return rows.map(mapRow);
}

export async function listGeneratedStudyImages(limit = 500): Promise<GeneratedStudyImageRecord[]> {
  return generatedStudyImagesRepositoryDrizzle.listGeneratedStudyImages(limit);
}
