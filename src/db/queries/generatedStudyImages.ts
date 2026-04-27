import { generatedStudyImagesRepositoryDrizzle } from '../repositories/generatedStudyImagesRepository.drizzle';
export type {
  GeneratedStudyImageContextType,
  GeneratedStudyImageRecord,
  GeneratedStudyImageStyle,
  SaveGeneratedStudyImageInput,
} from '../../types/studyImages';

import type {
  GeneratedStudyImageContextType as ContextType,
  GeneratedStudyImageRecord as Record,
  SaveGeneratedStudyImageInput as SaveInput,
} from '../../types/studyImages';

export async function saveGeneratedStudyImage(
  input: SaveInput,
): Promise<Record> {
  return generatedStudyImagesRepositoryDrizzle.saveGeneratedStudyImage(input);
}

export async function getGeneratedStudyImagesForContext(
  contextType: ContextType,
  contextKey: string,
): Promise<Record[]> {
  return generatedStudyImagesRepositoryDrizzle.getGeneratedStudyImagesForContext(
    contextType,
    contextKey,
  );
}

export async function listGeneratedStudyImagesForContexts(
  contextType: ContextType,
  contextKeys: string[],
): Promise<Record[]> {
  return generatedStudyImagesRepositoryDrizzle.listGeneratedStudyImagesForContexts(
    contextType,
    contextKeys,
  );
}

export async function listGeneratedStudyImagesForTopic(
  contextType: ContextType,
  topicName: string,
): Promise<Record[]> {
  return generatedStudyImagesRepositoryDrizzle.listGeneratedStudyImagesForTopic(
    contextType,
    topicName,
  );
}

export async function listGeneratedStudyImages(limit = 500): Promise<Record[]> {
  return generatedStudyImagesRepositoryDrizzle.listGeneratedStudyImages(limit);
}
