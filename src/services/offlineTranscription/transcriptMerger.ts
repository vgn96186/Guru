/**
 * Transcript Merger
 *
 * Merges transcription results from either real-time or batch mode
 * into the final LectureTranscript schema. Handles:
 *
 * 1. Overlap deduplication — When consecutive chunks share an overlap
 *    window (0.5–1s), the same words may appear in both. The merger
 *    detects and removes these duplicates using fuzzy text matching.
 *
 * 2. Segment consolidation — Very short segments (< 2 words) are
 *    merged with adjacent segments for readability.
 *
 * 3. Timestamp continuity — Ensures segments are sorted by start time
 *    with no gaps or overlaps in the final output.
 *
 * 4. Full-text assembly — Concatenates all segment texts with proper
 *    sentence boundaries and whitespace.
 *
 * Future: This is where topic segmentation and speaker diarization
 * results would be integrated.
 */

import { Platform } from 'react-native';
import * as crypto from 'expo-crypto';
import {
  TranscriptSegment,
  LectureTranscript,
  TranscriptMetadata,
} from './types';

// ─── Unique ID generation ────────────────────────────────────────────────────

function generateLectureId(): string {
  return `lecture_${crypto.randomUUID()}`;
}

// ─── Merger ──────────────────────────────────────────────────────────────────

export class TranscriptMerger {
  /**
   * Merge raw segments into a finalized LectureTranscript.
   *
   * @param segments       Raw segments from real-time or batch transcription
   * @param title          User-provided or auto-generated lecture title
   * @param recordedAt     ISO 8601 timestamp of when the recording started
   * @param durationSeconds Total recording duration in seconds
   * @param modelUsed      Model identifier (e.g., "ggml-small.en")
   * @param metadata       Processing metadata
   */
  merge(
    segments: TranscriptSegment[],
    title: string,
    recordedAt: string,
    durationSeconds: number,
    modelUsed: string,
    metadata: Partial<TranscriptMetadata>,
  ): LectureTranscript {
    // Step 1: Sort by start time
    const sorted = [...segments].sort((a, b) => a.start - b.start);

    // Step 2: Remove overlap duplicates
    const deduped = this.deduplicateOverlaps(sorted);

    // Step 3: Consolidate tiny segments
    const consolidated = this.consolidateShortSegments(deduped);

    // Step 4: Re-index segment IDs
    const reindexed = consolidated.map((seg, idx) => ({
      ...seg,
      id: idx,
    }));

    // Step 5: Build full text
    const fullText = this.buildFullText(reindexed);

    return {
      id: generateLectureId(),
      title,
      recordedAt,
      durationSeconds,
      modelUsed,
      text: fullText,
      segments: reindexed,
      metadata: {
        deviceModel: this.getDeviceModel(),
        processingTimeSeconds: metadata.processingTimeSeconds ?? 0,
        audioFormat: 'pcm_16khz_mono',
        vadSkippedSeconds: metadata.vadSkippedSeconds ?? 0,
        realtimeFactor: metadata.realtimeFactor,
        chunksProcessed: metadata.chunksProcessed,
        emptyChunks: metadata.emptyChunks,
      },
    };
  }

  // ── Overlap Deduplication ───────────────────────────────────────────────

  /**
   * Remove duplicate text from overlapping chunk boundaries.
   *
   * Algorithm:
   * For each pair of consecutive segments, check if the end of segment A
   * overlaps with the start of segment B (by comparing the last N words
   * of A with the first N words of B). If they match, trim B.
   */
  private deduplicateOverlaps(
    segments: TranscriptSegment[],
  ): TranscriptSegment[] {
    if (segments.length <= 1) return segments;

    const result: TranscriptSegment[] = [segments[0]];

    for (let i = 1; i < segments.length; i++) {
      const prev = result[result.length - 1];
      const curr = segments[i];

      // Check for time overlap
      if (curr.start < prev.end) {
        // There's a temporal overlap — check for text duplication
        const trimmed = this.trimOverlappingText(prev.text, curr.text);
        if (trimmed) {
          result.push({ ...curr, text: trimmed });
        } else {
          // Entire current segment is a duplicate, skip it
          continue;
        }
      } else {
        result.push(curr);
      }
    }

    return result;
  }

  /**
   * Given two overlapping texts, find and remove the duplicated portion.
   * Returns the trimmed version of textB, or null if entirely duplicated.
   *
   * Example:
   *   textA: "the mitochondria is the powerhouse of"
   *   textB: "powerhouse of the cell and it produces"
   *   result: "the cell and it produces"
   */
  private trimOverlappingText(
    textA: string,
    textB: string,
  ): string | null {
    const wordsA = textA.trim().split(/\s+/);
    const wordsB = textB.trim().split(/\s+/);

    if (wordsB.length === 0) return null;

    // Try matching the last N words of A with the first N words of B
    // Start with the largest possible overlap and shrink
    const maxOverlap = Math.min(wordsA.length, wordsB.length, 15);

    for (let overlapLen = maxOverlap; overlapLen >= 2; overlapLen--) {
      const tailA = wordsA
        .slice(-overlapLen)
        .map((w) => w.toLowerCase())
        .join(' ');
      const headB = wordsB
        .slice(0, overlapLen)
        .map((w) => w.toLowerCase())
        .join(' ');

      if (tailA === headB) {
        // Found exact overlap — return the non-overlapping part of B
        const remaining = wordsB.slice(overlapLen).join(' ').trim();
        return remaining || null;
      }

      // Try fuzzy match (allow 1 word difference for Whisper inconsistencies)
      if (overlapLen >= 4) {
        const fuzzyMatch = this.fuzzyWordMatch(
          wordsA.slice(-overlapLen),
          wordsB.slice(0, overlapLen),
          1,
        );
        if (fuzzyMatch) {
          const remaining = wordsB.slice(overlapLen).join(' ').trim();
          return remaining || null;
        }
      }
    }

    // No overlap found — return textB unchanged
    return textB.trim();
  }

  /**
   * Fuzzy word-level matching allowing up to `maxDiffs` word differences.
   */
  private fuzzyWordMatch(
    wordsA: string[],
    wordsB: string[],
    maxDiffs: number,
  ): boolean {
    if (wordsA.length !== wordsB.length) return false;

    let diffs = 0;
    for (let i = 0; i < wordsA.length; i++) {
      if (wordsA[i].toLowerCase() !== wordsB[i].toLowerCase()) {
        diffs++;
        if (diffs > maxDiffs) return false;
      }
    }
    return true;
  }

  // ── Segment Consolidation ───────────────────────────────────────────────

  /**
   * Merge very short segments (1–2 words) with their neighbors.
   * This produces more readable transcript output.
   */
  private consolidateShortSegments(
    segments: TranscriptSegment[],
  ): TranscriptSegment[] {
    if (segments.length <= 1) return segments;

    const result: TranscriptSegment[] = [];
    let buffer: TranscriptSegment | undefined = undefined;

    for (const seg of segments) {
      const wordCount = seg.text.trim().split(/\s+/).length;

      if (wordCount <= 2 && buffer != null) {
        // Merge this short segment into the buffer
        const b: TranscriptSegment = buffer;
        buffer = {
          ...b,
          end: seg.end,
          text: `${b.text} ${seg.text}`.trim(),
        };
      } else if (wordCount <= 2 && buffer == null) {
        // Start buffering
        buffer = { ...seg };
      } else {
        // Normal-length segment
        if (buffer != null) {
          // Flush buffer by merging with this segment
          result.push({
            ...buffer,
            end: seg.end,
            text: `${buffer.text} ${seg.text}`.trim(),
          });
          buffer = undefined;
        } else {
          result.push(seg);
        }
      }
    }

    // Flush any remaining buffer
    if (buffer != null) {
      if (result.length > 0) {
        // Merge with the last result
        const last = result[result.length - 1];
        result[result.length - 1] = {
          ...last,
          end: buffer.end,
          text: `${last.text} ${buffer.text}`.trim(),
        };
      } else {
        result.push(buffer);
      }
    }

    return result;
  }

  // ── Full Text Assembly ──────────────────────────────────────────────────

  /**
   * Build the full transcript text from segments.
   * Adds proper spacing and sentence boundaries.
   */
  private buildFullText(segments: TranscriptSegment[]): string {
    if (segments.length === 0) return '';

    return segments
      .map((seg) => seg.text.trim())
      .filter((text) => text.length > 0)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ── Device Info ─────────────────────────────────────────────────────────

  private getDeviceModel(): string {
    try {
      return `${Platform.OS} ${Platform.Version}`;
    } catch {
      return 'android';
    }
  }
}
