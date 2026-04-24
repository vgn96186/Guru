import { AIContent } from '../../types';
import { compactLines } from './utils/compactLines';

export function buildGuruContext(content: AIContent): string | undefined {
  switch (content.type) {
    case 'keypoints':
      return compactLines([
        'Card type: Key points',
        `Points:\n${content.points
          .slice(0, 4)
          .map((point, index) => `${index + 1}. ${point}`)
          .join('\n')}`,
        `Memory hook: ${content.memoryHook}`,
      ]);
    case 'must_know':
      return compactLines([
        'Card type: Must Know & Most Tested',
        `Must know: ${content.mustKnow.join(' | ')}`,
        `Most tested: ${content.mostTested.join(' | ')}`,
        `Exam tip: ${content.examTip}`,
      ]);
    case 'quiz':
      return compactLines([
        'Card type: Quiz',
        `Topic: ${content.topicName}`,
        `Total questions: ${content.questions.length}`,
        'The live study step below contains the active question, all options, correct answer, and explanation.',
        'When answering student questions, first explain the broader concept being tested, then address the specific question.',
      ]);
    case 'story':
      return compactLines([
        'Card type: Story',
        `Story: ${content.story}`,
        `Highlights: ${content.keyConceptHighlights.join(' | ')}`,
      ]);
    case 'mnemonic':
      return compactLines(
        [
          'Card type: Mnemonic',
          `Mnemonic: ${content.mnemonic}`,
          `Expansion: ${content.expansion.join(' | ')}`,
          `Tip: ${content.tip}`,
        ],
        4,
      );
    case 'teach_back':
      return compactLines(
        [
          'Card type: Teach-back',
          `Prompt: ${content.prompt}`,
          `Key points to mention: ${content.keyPointsToMention.join(' | ')}`,
          `Guru reaction target: ${content.guruReaction}`,
        ],
        4,
      );
    case 'error_hunt':
      return compactLines(
        [
          'Card type: Error hunt',
          `Paragraph: ${content.paragraph}`,
          ...content.errors
            .slice(0, 2)
            .map(
              (error, index) =>
                `Error ${index + 1}: wrong "${error.wrong}", correct "${error.correct}". ${
                  error.explanation
                }`,
            ),
        ],
        4,
      );
    case 'detective':
      return compactLines(
        [
          'Card type: Detective',
          `Clues: ${content.clues.join(' | ')}`,
          `Answer: ${content.answer}`,
          `Explanation: ${content.explanation}`,
        ],
        4,
      );
    case 'manual':
      return 'Card type: Manual review';
    case 'socratic':
      return compactLines(
        [
          'Card type: Socratic',
          ...content.questions
            .slice(0, 3)
            .map(
              (question, index) =>
                `Q${index + 1}: ${question.question}\nAnswer: ${question.answer}\nWhy it matters: ${
                  question.whyItMatters
                }`,
            ),
        ],
        4,
      );
    default:
      return undefined;
  }
}
