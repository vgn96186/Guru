import type { ToolSet } from 'ai';

// Medical tools
import {
  searchMedicalTool,
  lookupTopicTool,
  getQuizQuestionsTool,
  generateImageTool,
  saveToNotesTool,
  markTopicReviewedTool,
  factCheckTool,
  fetchExamDatesTool,
  generateMindmapTool,
  generateFlashcardsTool,
} from '../v2/tools/medicalTools';

// Content tools
import {
  createQuizTool,
  fetchContentTool,
  generateKeypointsTool,
  generateMustKnowTool,
  generateStoryTool,
  generateMnemonicTool,
  generateTeachBackTool,
  generateErrorHuntTool,
  generateDetectiveTool,
  generateSocraticTool,
} from '../v2/tools/contentTools';

// Lecture tools
import { analyzeLectureTool } from '../v2/tools/lectureTools';

// Planning tools
import { planSessionTool, dailyAgendaTool } from '../v2/tools/planningTools';

/**
 * Build the grounding tool set for the LLM to use.
 * These tools allow the model to decide when to search, fact-check, or access data.
 *
 * Tools are organized by category (24 total):
 * - Knowledge (3): search_medical, lookup_topic, fact_check
 * - Content (2): create_quiz, fetch_content
 * - AI Content Generation (8): keypoints, must_know, story, mnemonic, teach_back, error_hunt, detective, socratic
 * - Study (3): get_quiz_questions, generate_flashcards, mark_topic_reviewed
 * - Lecture (1): analyze_lecture
 * - Planning (2): plan_session, daily_agenda
 * - Visualization (2): generate_mindmap, generate_image (opt-in)
 * - Utility (3): fetch_exam_dates, save_to_notes
 */
export function buildGroundingTools(options?: { allowImages?: boolean }): ToolSet {
  const tools: ToolSet = {
    // ========== Knowledge Tools ==========
    /** Search authoritative medical sources (PubMed, EuropePMC, Wikipedia, Brave) */
    search_medical: searchMedicalTool,

    /** Look up topic in syllabus with user's progress */
    lookup_topic: lookupTopicTool,

    /** Verify medical claims against trusted sources */
    fact_check: factCheckTool,

    // ========== Content Tools ==========
    /** Generate custom quiz for a topic */
    create_quiz: createQuizTool,

    /** Fetch study notes/summaries for a topic */
    fetch_content: fetchContentTool,

    // ========== AI Content Generation Tools ==========
    /** Generate high-yield key points with memory hook */
    generate_keypoints: generateKeypointsTool,

    /** Generate must-know and most-tested exam facts */
    generate_must_know: generateMustKnowTool,

    /** Generate clinical story embedding key facts */
    generate_story: generateStoryTool,

    /** Generate memorable mnemonic with expansion */
    generate_mnemonic: generateMnemonicTool,

    /** Generate teach-back challenge for self-testing */
    generate_teach_back: generateTeachBackTool,

    /** Generate error hunt with deliberate mistakes */
    generate_error_hunt: generateErrorHuntTool,

    /** Generate clinical detective game with clues */
    generate_detective: generateDetectiveTool,

    /** Generate Socratic questioning drill */
    generate_socratic: generateSocraticTool,

    // ========== Study Tools ==========
    /** Get MCQs from question bank for a topic */
    get_quiz_questions: getQuizQuestionsTool,


    /** Generate spaced repetition flashcards for a topic */
    generate_flashcards: generateFlashcardsTool,

    /** Mark topic as reviewed (requires approval) */
    mark_topic_reviewed: markTopicReviewedTool,

    // ========== Planning Tools ==========
    /** Create study session plan with time allocations */
    plan_session: planSessionTool,

    /** Generate full-day study schedule */
    daily_agenda: dailyAgendaTool,

    // ========== Lecture Tools ==========
    /** Analyze lecture transcript for topics and weak areas */
    analyze_lecture: analyzeLectureTool,

    // ========== Visualization Tools ==========
    /** Generate hierarchical mind map for a medical topic */
    generate_mindmap: generateMindmapTool,

    // ========== Utility Tools ==========
    /** Fetch INICET/NEET-PG exam dates */
    fetch_exam_dates: fetchExamDatesTool,

    /** Save important facts to user's notes */
    save_to_notes: saveToNotesTool,
  };

  // Only add image generation if explicitly allowed (can be expensive)
  if (options?.allowImages) {
    tools.generate_image = generateImageTool;
  }

  return tools;
}
