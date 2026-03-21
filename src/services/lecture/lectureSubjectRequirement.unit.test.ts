import { resolveLectureSubjectRequirement } from './lectureSubjectRequirement';

const mockGetSubjectByName = jest.fn();

jest.mock('../../db/queries/topics', () => ({
  getSubjectByName: (...args: unknown[]) => mockGetSubjectByName(...args),
}));

describe('lectureSubjectRequirement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires user selection for generic unknown subjects', async () => {
    const result = await resolveLectureSubjectRequirement('Unknown');

    expect(result).toEqual({
      matchedSubject: null,
      normalizedSubjectName: '',
      requiresSelection: true,
    });
    expect(mockGetSubjectByName).not.toHaveBeenCalled();
  });

  it('requires user selection when the detected subject does not match a DB subject', async () => {
    mockGetSubjectByName.mockResolvedValue(null);

    const result = await resolveLectureSubjectRequirement('Medicine and Surgery Mix');

    expect(result).toEqual({
      matchedSubject: null,
      normalizedSubjectName: 'Medicine and Surgery Mix',
      requiresSelection: true,
    });
  });

  it('accepts a detected subject when it maps to a real DB subject', async () => {
    mockGetSubjectByName.mockResolvedValue({ id: 7, name: 'Physiology' });

    const result = await resolveLectureSubjectRequirement('Physiology');

    expect(result).toEqual({
      matchedSubject: { id: 7, name: 'Physiology' },
      normalizedSubjectName: 'Physiology',
      requiresSelection: false,
    });
  });
});
