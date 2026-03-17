/**
 * Guru chat prompt suggestions (starter chips).
 * Edit here to change the suggestions shown when the chat is empty.
 */

export type ChatStarter = { icon: string; text: string };

/** Starters when no specific topic is selected (e.g. General Medicine). */
export const GENERAL_CHAT_STARTERS: ChatStarter[] = [
  { icon: 'heart-outline', text: 'First-line treatment for HFrEF?' },
  { icon: 'fitness-outline', text: 'GLP-1 agonists in obesity - key trials?' },
  { icon: 'pulse-outline', text: 'Sepsis bundle essentials 2024' },
  { icon: 'medical-outline', text: 'Hypertension guidelines - thresholds?' },
  { icon: 'flask-outline', text: 'CKD staging and management approach' },
  { icon: 'medkit-outline', text: 'Migraine prophylaxis options ranked' },
];

/** Templates for topic-specific starters. %s is replaced with the topic name. */
const TOPIC_STARTER_TEMPLATES: { icon: string; textTemplate: string }[] = [
  { icon: 'book-outline', textTemplate: 'What are the highest-yield exam concepts for %s?' },
  { icon: 'help-circle-outline', textTemplate: 'Give me a hard clinical vignette MCQ on %s.' },
  { icon: 'bulb-outline', textTemplate: 'Can you share a memory hook or mnemonic for %s?' },
  { icon: 'list-outline', textTemplate: 'What is the diagnostic algorithm or criteria for %s?' },
  {
    icon: 'alert-circle-outline',
    textTemplate: 'What are common pitfalls and mistakes when studying %s?',
  },
  {
    icon: 'medkit-outline',
    textTemplate: 'What is the first-line treatment and management for %s?',
  },
];

export function getChatStartersForTopic(topicName: string): ChatStarter[] {
  const trimmed = (topicName || '').trim();
  if (!trimmed || trimmed === 'General Medicine') {
    return GENERAL_CHAT_STARTERS;
  }
  return TOPIC_STARTER_TEMPLATES.map(({ icon, textTemplate }) => ({
    icon,
    text: textTemplate.replace(/%s/g, trimmed),
  }));
}
