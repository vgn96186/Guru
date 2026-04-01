import { AIContentSchema } from './schemas';

describe('AIContentSchema flashcards', () => {
  it('strips stray strings from cards[]', () => {
    const parsed = AIContentSchema.parse({
      type: 'flashcards',
      topicName: 'Brachial Plexus',
      cards: [
        { front: 'Q0', back: 'A0' },
        'stray',
        { front: 'Q1', back: 'A1' },
        'another',
        { front: 'Q2', back: 'A2' },
      ],
    });
    expect(parsed.type).toBe('flashcards');
    if (parsed.type !== 'flashcards') throw new Error('expected flashcards');
    expect(parsed.cards).toEqual([
      { front: 'Q0', back: 'A0' },
      { front: 'Q1', back: 'A1' },
      { front: 'Q2', back: 'A2' },
    ]);
  });

  it('maps question/answer to front/back', () => {
    const parsed = AIContentSchema.parse({
      type: 'flashcards',
      topicName: 'T',
      cards: [{ question: 'Why?', answer: 'Because.' }],
    });
    expect(parsed.type).toBe('flashcards');
    if (parsed.type !== 'flashcards') throw new Error('expected flashcards');
    expect(parsed.cards).toEqual([{ front: 'Why?', back: 'Because.' }]);
  });

  it('preserves optional flashcard image fields', () => {
    const parsed = AIContentSchema.parse({
      type: 'flashcards',
      topicName: 'Retina',
      cards: [
        {
          front: 'Identify the fundus finding',
          back: 'Cherry-red spot',
          imageSearchQuery: 'central retinal artery occlusion fundus',
        },
      ],
    });
    expect(parsed.type).toBe('flashcards');
    if (parsed.type !== 'flashcards') throw new Error('expected flashcards');
    expect(parsed.cards[0]).toEqual({
      front: 'Identify the fundus finding',
      back: 'Cherry-red spot',
      imageSearchQuery: 'central retinal artery occlusion fundus',
      imageUrl: undefined,
    });
  });
});
