/**
 * Guru Core Tools — aggregated tool sets for the AI SDK.
 */

import { planSessionTool, dailyAgendaTool, updateDailyAgendaTool } from './planningTools';
import { analyzeLectureTool, catalyzeTranscriptTool } from './lectureTools';
import {
  updatePreferencesTool,
  awardXpTool,
  consumeStreakShieldTool,
  triggerDeviceSyncTool,
} from './appControlTools';
import { tagNoteTool } from '../../tools/noteLinkingTools';
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
  flagContentTool,
  resolveContentFlagTool,
} from './contentTools';
import {
  guruMedicalTools,
  generateMindmapTool,
  generateFlashcardsTool,
  fetchExamDatesTool,
  updateFlashcardTool,
  deleteFlashcardTool,
  scheduleNotificationTool,
  fetchPyqTool,
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
  update_daily_agenda: updateDailyAgendaTool,
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
  flag_content: flagContentTool,
  resolve_content_flag: resolveContentFlagTool,
};

export const guruAppControlTools = {
  update_preferences: updatePreferencesTool,
  award_xp: awardXpTool,
  consume_streak_shield: consumeStreakShieldTool,
  trigger_device_sync: triggerDeviceSyncTool,
  tag_note: tagNoteTool,
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
  ...guruAppControlTools,
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
  updateFlashcardTool,
  deleteFlashcardTool,
  scheduleNotificationTool,
  fetchPyqTool,
  generateKeypointsTool,
  generateMustKnowTool,
  generateStoryTool,
  generateMnemonicTool,
  generateTeachBackTool,
  generateErrorHuntTool,
  generateDetectiveTool,
  generateSocraticTool,
  flagContentTool,
  resolveContentFlagTool,
  planSessionAiTool,
  accountabilityMessagesTool,
  guruPresenceMessagesTool,
  dailyAgendaAiTool,
  replanDayAiTool,
  wakeUpMessageTool,
  breakEndMessagesTool,
};

export { guruAiPlanningTools, guruNotificationTools };
