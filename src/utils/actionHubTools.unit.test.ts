import { sanitizeActionHubTools } from './actionHubTools';

describe('sanitizeActionHubTools', () => {
  it('filters unknown + de-dupes + pads to 6', () => {
    expect(sanitizeActionHubTools(['StudyPlan', 'StudyPlan', 'nope', 'Flashcards'])).toHaveLength(
      6,
    );
  });

  it('caps to 6', () => {
    expect(
      sanitizeActionHubTools([
        'StudyPlan',
        'QuestionBank',
        'Flashcards',
        'NotesVault',
        'TranscriptVault',
        'RecordingVault',
        'Stats',
      ]),
    ).toEqual([
      'StudyPlan',
      'QuestionBank',
      'Flashcards',
      'NotesVault',
      'TranscriptVault',
      'RecordingVault',
    ]);
  });
});
