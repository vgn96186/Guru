import { detectStudentIntent } from './intent';

describe('detectStudentIntent', () => {
  it('detects compare intent', () => {
    expect(detectStudentIntent('what is the difference between asthma and copd?')).toBe('compare');
    expect(detectStudentIntent('asthma vs copd')).toBe('compare');
  });

  it('detects quiz_me intent', () => {
    expect(detectStudentIntent('quiz me on this')).toBe('quiz_me');
    expect(detectStudentIntent('ask me a question')).toBe('quiz_me');
  });

  it('detects explain_wrong_answer intent', () => {
    expect(detectStudentIntent('why is this answer wrong?')).toBe('explain_wrong_answer');
    expect(detectStudentIntent('i made a mistake')).toBe('explain_wrong_answer');
  });

  it('detects recap intent', () => {
    expect(detectStudentIntent('can you summarize this for me')).toBe('recap');
    expect(detectStudentIntent('quick recap')).toBe('recap');
  });

  it('detects direct_teach intent', () => {
    expect(detectStudentIntent('just tell me the answer')).toBe('direct_teach');
    expect(detectStudentIntent('i have no idea')).toBe('direct_teach');
  });

  it('detects tangent intent', () => {
    expect(detectStudentIntent('by the way, what about...')).toBe('tangent');
    expect(detectStudentIntent('unrelated question')).toBe('tangent');
  });

  it('detects advance intent', () => {
    expect(detectStudentIntent('move on to the next topic')).toBe('advance');
    expect(detectStudentIntent('go ahead')).toBe('advance');
  });

  it('defaults to clarify_doubt for unknown/general questions', () => {
    expect(detectStudentIntent('how does this work?')).toBe('clarify_doubt');
    expect(detectStudentIntent('')).toBe('clarify_doubt');
  });
});
