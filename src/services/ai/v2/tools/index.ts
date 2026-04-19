/**
 * Guru Core Tools — aggregated tool sets for the AI SDK.
 */

import { planSessionTool, dailyAgendaTool } from './planningTools';
import { analyzeLectureTool } from './lectureTools';
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
} from './contentTools';
import {
  guruMedicalTools,
  generateMindmapTool,
  generateFlashcardsTool,
  fetchExamDatesTool,
} from './medicalTools';

export const guruPlanningTools = {
  plan_session: planSessionTool,
  daily_agenda: dailyAgendaTool,
};

export const guruLectureTools = {
  analyze_lecture: analyzeLectureTool,
};

export const guruContentTools = {
  create_quiz: createQuizTool,
  fetch_content: fetchContentTool,
  generate_keypoints: generateKeypointsTool,
  generate_must_know: generateMustKnowTool,
  generate_story: generateStoryTool,
  generate_mnemonic: generateMnemonicTool,
  generate_teach_back: generateTeachBackTool,
  generate_error_hunt: generateErrorHuntTool,
  generate_detective: generateDetectiveTool,
  generate_socratic: generateSocraticTool,
};

/**
 * The complete suite of tools available to the Guru AI agent.
 */
export const guruCoreTools = {
  ...guruMedicalTools,
  ...guruPlanningTools,
  ...guruLectureTools,
  ...guruContentTools,
};

// Re-export individual tools for direct usage if needed
export {
  planSessionTool,
  dailyAgendaTool,
  analyzeLectureTool,
  createQuizTool,
  fetchContentTool,
  generateMindmapTool,
  generateFlashcardsTool,
  fetchExamDatesTool,
  generateKeypointsTool,
  generateMustKnowTool,
  generateStoryTool,
  generateMnemonicTool,
  generateTeachBackTool,
  generateErrorHuntTool,
  generateDetectiveTool,
  generateSocraticTool,
};
