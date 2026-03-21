import { getDb, nowTs } from '../database';

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

function mapRow(row: {
  id: number;
  context_type: GeneratedStudyImageContextType;
  context_key: string;
  topic_id: number | null;
  topic_name: string;
  lecture_note_id: number | null;
  style: GeneratedStudyImageStyle;
  prompt: string;
  provider: string;
  model_used: string;
  mime_type: string;
  local_uri: string;
  remote_url: string | null;
  width: number | null;
  height: number | null;
  created_at: number;
}): GeneratedStudyImageRecord {
  return {
    id: row.id,
    contextType: row.context_type,
    contextKey: row.context_key,
    topicId: row.topic_id,
    topicName: row.topic_name,
    lectureNoteId: row.lecture_note_id,
    style: row.style,
    prompt: row.prompt,
    provider: row.provider,
    modelUsed: row.model_used,
    mimeType: row.mime_type,
    localUri: row.local_uri,
    remoteUrl: row.remote_url,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
  };
}

export async function saveGeneratedStudyImage(
  input: SaveGeneratedStudyImageInput,
): Promise<GeneratedStudyImageRecord> {
  const db = getDb();
  const createdAt = nowTs();
  const result = await db.runAsync(
    `INSERT INTO generated_study_images (
       context_type, context_key, topic_id, topic_name, lecture_note_id, style, prompt,
       provider, model_used, mime_type, local_uri, remote_url, width, height, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.contextType,
      input.contextKey,
      input.topicId ?? null,
      input.topicName,
      input.lectureNoteId ?? null,
      input.style,
      input.prompt,
      input.provider,
      input.modelUsed,
      input.mimeType,
      input.localUri,
      input.remoteUrl ?? null,
      input.width ?? null,
      input.height ?? null,
      createdAt,
    ],
  );

  return {
    id: Number(result.lastInsertRowId),
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
}

export async function getGeneratedStudyImagesForContext(
  contextType: GeneratedStudyImageContextType,
  contextKey: string,
): Promise<GeneratedStudyImageRecord[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{
    id: number;
    context_type: GeneratedStudyImageContextType;
    context_key: string;
    topic_id: number | null;
    topic_name: string;
    lecture_note_id: number | null;
    style: GeneratedStudyImageStyle;
    prompt: string;
    provider: string;
    model_used: string;
    mime_type: string;
    local_uri: string;
    remote_url: string | null;
    width: number | null;
    height: number | null;
    created_at: number;
  }>(
    `SELECT *
     FROM generated_study_images
     WHERE context_type = ? AND context_key = ?
     ORDER BY created_at DESC`,
    [contextType, contextKey],
  );
  return rows.map(mapRow);
}

export async function listGeneratedStudyImagesForTopic(
  contextType: GeneratedStudyImageContextType,
  topicName: string,
): Promise<GeneratedStudyImageRecord[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{
    id: number;
    context_type: GeneratedStudyImageContextType;
    context_key: string;
    topic_id: number | null;
    topic_name: string;
    lecture_note_id: number | null;
    style: GeneratedStudyImageStyle;
    prompt: string;
    provider: string;
    model_used: string;
    mime_type: string;
    local_uri: string;
    remote_url: string | null;
    width: number | null;
    height: number | null;
    created_at: number;
  }>(
    `SELECT *
     FROM generated_study_images
     WHERE context_type = ? AND topic_name = ?
     ORDER BY created_at DESC`,
    [contextType, topicName],
  );
  return rows.map(mapRow);
}
