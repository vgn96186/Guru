/**
 * Guru Core Tools — aggregated tool sets for the AI SDK.
 */

import { planSessionTool, dailyAgendaTool } from './planningTools';
import { analyzeLectureTool, catalyzeTranscriptTool } from './lectureTools';
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
import {
  guruAiPlanningTools,
  planSessionAiTool,
  accountabilityMessagesTool,
  guruPresenceMessagesTool,
  dailyAgendaAiTool,
  replanDayAiTool,
} from './aiPlanningTools';
import {
  guruNotificationTools,
  wakeUpMessageTool,
  breakEndMessagesTool,
} from './notificationTools';

export const guruPlanningTools = {
  plan_session: planSessionTool,
  daily_agenda: dailyAgendaTool,
};

export const guruLectureTools = {
  analyze_lecture: analyzeLectureTool,
  catalyze_transcript: catalyzeTranscriptTool,
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
  ...guruAiPlanningTools,
  ...guruLectureTools,
  ...guruContentTools,
  ...guruNotificationTools,
};

// Re-export individual tools for direct usage if needed
export {
  planSessionTool,
  dailyAgendaTool,
  analyzeLectureTool,
  catalyzeTranscriptTool,
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
  planSessionAiTool,
  accountabilityMessagesTool,
  guruPresenceMessagesTool,
  dailyAgendaAiTool,
  replanDayAiTool,
  wakeUpMessageTool,
  breakEndMessagesTool,
};

export { guruAiPlanningTools, guruNotificationTools };
