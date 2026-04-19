/**
 * useGuruChatImageGeneration — Image generation state and helpers
 */

import { useState, useCallback } from 'react';
import {
  listGeneratedStudyImagesForTopic,
  type GeneratedStudyImageRecord,
  type GeneratedStudyImageStyle,
} from '../db/queries/generatedStudyImages';
import { buildChatImageContextKey, generateStudyImage } from '../services/studyImageService';

export interface UseGuruChatImageGenerationOptions {
  topicName: string;
  threadId: number | null;
}

export interface UseGuruChatImageGenerationReturn {
  imageJobKey: string | null;
  isGenerating: boolean;
  generateImageForMessage: (
    messageId: string,
    messageText: string,
    timestamp: number,
    style: GeneratedStudyImageStyle,
  ) => Promise<GeneratedStudyImageRecord | null>;
  loadExistingImages: () => Promise<GeneratedStudyImageRecord[]>;
}

export function useGuruChatImageGeneration(
  options: UseGuruChatImageGenerationOptions,
): UseGuruChatImageGenerationReturn {
  const { topicName, threadId } = options;
  const [imageJobKey, setImageJobKey] = useState<string | null>(null);

  const isGenerating = imageJobKey !== null;

  const generateImageForMessage = useCallback(
    async (
      messageId: string,
      messageText: string,
      timestamp: number,
      style: GeneratedStudyImageStyle,
    ): Promise<GeneratedStudyImageRecord | null> => {
      const jobKey = `${messageId}:${style}`;
      if (imageJobKey) return null;

      setImageJobKey(jobKey);
      try {
        const image = await generateStudyImage({
          contextType: 'chat',
          contextKey: buildChatImageContextKey(topicName, timestamp),
          topicName,
          sourceText: messageText,
          style,
        });
        return image;
      } catch {
        return null;
      } finally {
        setImageJobKey(null);
      }
    },
    [imageJobKey, topicName],
  );

  const loadExistingImages = useCallback(async (): Promise<GeneratedStudyImageRecord[]> => {
    if (!threadId) return [];
    try {
      return await listGeneratedStudyImagesForTopic('chat', topicName);
    } catch {
      return [];
    }
  }, [threadId, topicName]);

  return {
    imageJobKey,
    isGenerating,
    generateImageForMessage,
    loadExistingImages,
  };
}
