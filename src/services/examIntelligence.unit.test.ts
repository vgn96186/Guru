import {
  buildExamIntelligenceBrief,
  getExamAwareSubjectWeight,
  getExamPhase,
  getExamTargetIntelligence,
} from './examIntelligence';

describe('examIntelligence', () => {
  it('maps countdowns into expected phases', () => {
    expect(getExamPhase(180)).toBe('foundation');
    expect(getExamPhase(90)).toBe('coverage');
    expect(getExamPhase(40)).toBe('integration');
    expect(getExamPhase(14)).toBe('crunch');
    expect(getExamPhase(5)).toBe('final_week');
    expect(getExamPhase(0)).toBe('exam_day');
  });

  it('prefers nearer exam when dates are far apart', () => {
    const intel = getExamTargetIntelligence(
      {
        examType: 'NEET',
        inicetDate: '2026-05-17',
        neetDate: '2026-08-30',
      },
      (date) => (date === '2026-05-17' ? 30 : 120),
    );

    expect(intel.targetExam).toBe('INICET');
    expect(intel.daysToTarget).toBe(30);
    expect(intel.daysToInicet).toBe(30);
    expect(intel.daysToNeetPg).toBe(120);
  });

  it('honors preferred exam when both are close', () => {
    const intel = getExamTargetIntelligence(
      {
        examType: 'NEET',
        inicetDate: '2026-05-17',
        neetDate: '2026-08-30',
      },
      (date) => (date === '2026-05-17' ? 40 : 44),
    );

    expect(intel.targetExam).toBe('NEET-PG');
  });

  it('returns exam-aware subject weight and contextual brief', () => {
    expect(getExamAwareSubjectWeight({ inicetWeight: 8, neetWeight: 5 }, 'INICET')).toBe(8);
    expect(getExamAwareSubjectWeight({ inicetWeight: 8, neetWeight: 5 }, 'NEET-PG')).toBe(5);

    const brief = buildExamIntelligenceBrief({
      targetExam: 'INICET',
      targetDate: '2026-05-17',
      daysToTarget: 27,
      daysToInicet: 27,
      daysToNeetPg: 120,
      secondaryExam: 'NEET-PG',
      secondaryExamDays: 120,
      phase: 'crunch',
      phaseLabel: 'Exam Crunch (21d)',
      plannerFocus: 'Prioritize overdue review and high-yield weak-topic repair.',
      chatTutorHint: 'Use exam-style checkpoints and management decision anchors.',
      reviewBias: 1.35,
      deepDiveBias: 0.9,
      newTopicBias: 0.45,
    });

    expect(brief).toContain('Exam intelligence');
    expect(brief).toContain('INICET');
    expect(brief).toContain('27 day(s)');
    expect(brief).toContain('+1/-0.33 marking');
    expect(brief).toContain('Secondary: NEET-PG in 120 day(s)');
  });
});
