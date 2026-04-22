import { getDrizzleDb } from '../drizzle';
import { subjectsRepositoryDrizzle } from './subjectsRepository.drizzle';

jest.mock('../drizzle', () => ({
  getDrizzleDb: jest.fn(),
}));

type SubjectRow = {
  id: number;
  name: string;
  shortCode: string;
  colorHex: string;
  inicetWeight: number;
  neetWeight: number;
  displayOrder: number;
};

function createDrizzleSelectChain(rows: SubjectRow[]) {
  const chain = {
    from: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockResolvedValue(rows),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  };

  return chain;
}

describe('subjectsRepositoryDrizzle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns all subjects ordered by display_order mapping to Subject type', async () => {
    const rows: SubjectRow[] = [
      {
        id: 1,
        name: 'Physiology',
        shortCode: 'PHY',
        colorHex: '#22aa88',
        inicetWeight: 8,
        neetWeight: 7,
        displayOrder: 2,
      },
      {
        id: 2,
        name: 'Anatomy',
        shortCode: 'ANA',
        colorHex: '#4488ff',
        inicetWeight: 9,
        neetWeight: 8,
        displayOrder: 1,
      },
    ];

    const selectChain = createDrizzleSelectChain(rows);
    const select = jest.fn().mockReturnValue(selectChain);
    (getDrizzleDb as jest.Mock).mockReturnValue({ select });

    const result = await subjectsRepositoryDrizzle.getAllSubjects();

    expect(select).toHaveBeenCalled();
    expect(selectChain.from).toHaveBeenCalled();
    expect(selectChain.orderBy).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        id: 1,
        name: 'Physiology',
        shortCode: 'PHY',
        colorHex: '#22aa88',
        inicetWeight: 8,
        neetWeight: 7,
        displayOrder: 2,
      },
      {
        id: 2,
        name: 'Anatomy',
        shortCode: 'ANA',
        colorHex: '#4488ff',
        inicetWeight: 9,
        neetWeight: 8,
        displayOrder: 1,
      },
    ]);
  });

  it('returns subject by name for case-insensitive exact match', async () => {
    const rows: SubjectRow[] = [
      {
        id: 11,
        name: 'Biochemistry',
        shortCode: 'BIO',
        colorHex: '#ffaa33',
        inicetWeight: 6,
        neetWeight: 6,
        displayOrder: 3,
      },
    ];

    const selectChain = createDrizzleSelectChain(rows);
    const select = jest.fn().mockReturnValue(selectChain);
    (getDrizzleDb as jest.Mock).mockReturnValue({ select });

    const result = await subjectsRepositoryDrizzle.getSubjectByName('biochemistry');

    expect(selectChain.where).toHaveBeenCalledTimes(1);
    expect(selectChain.limit).toHaveBeenCalledWith(1);
    expect(result).toEqual({
      id: 11,
      name: 'Biochemistry',
      shortCode: 'BIO',
      colorHex: '#ffaa33',
      inicetWeight: 6,
      neetWeight: 6,
      displayOrder: 3,
    });
  });

  it('returns null when subject by name is not found', async () => {
    const selectChain = createDrizzleSelectChain([]);
    const select = jest.fn().mockReturnValue(selectChain);
    (getDrizzleDb as jest.Mock).mockReturnValue({ select });

    const result = await subjectsRepositoryDrizzle.getSubjectByName('Not A Subject');

    expect(selectChain.limit).toHaveBeenCalledWith(1);
    expect(result).toBeNull();
  });

  it('returns subject by id', async () => {
    const rows: SubjectRow[] = [
      {
        id: 4,
        name: 'Pathology',
        shortCode: 'PATH',
        colorHex: '#cc3355',
        inicetWeight: 10,
        neetWeight: 9,
        displayOrder: 4,
      },
    ];

    const selectChain = createDrizzleSelectChain(rows);
    const select = jest.fn().mockReturnValue(selectChain);
    (getDrizzleDb as jest.Mock).mockReturnValue({ select });

    const result = await subjectsRepositoryDrizzle.getSubjectById(4);

    expect(selectChain.where).toHaveBeenCalledTimes(1);
    expect(selectChain.limit).toHaveBeenCalledWith(1);
    expect(result).toEqual({
      id: 4,
      name: 'Pathology',
      shortCode: 'PATH',
      colorHex: '#cc3355',
      inicetWeight: 10,
      neetWeight: 9,
      displayOrder: 4,
    });
  });

  it('returns null when subject by id is not found', async () => {
    const selectChain = createDrizzleSelectChain([]);
    const select = jest.fn().mockReturnValue(selectChain);
    (getDrizzleDb as jest.Mock).mockReturnValue({ select });

    const result = await subjectsRepositoryDrizzle.getSubjectById(999);

    expect(selectChain.limit).toHaveBeenCalledWith(1);
    expect(result).toBeNull();
  });
});
