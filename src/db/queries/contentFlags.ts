import type { ContentType } from '../../types';

/**
 * Log a fact-check result for content.
 */
export async function logFactCheckResult(
  _topicId: number,
  _contentType: ContentType,
  _status: 'passed' | 'failed' | 'inconclusive',
  _contradictions: Array<{
    claim: string;
    trustedSource: string;
    trustedText: string;
    similarity: number;
  }>,
): Promise<void> {
  // Stub — implementation provided by Task 3
}
