import { getDrizzleDb } from '../drizzle';
import { brainDumpsRepositoryDrizzle, type BrainDumpRow } from './brainDumpsRepository.drizzle';

jest.mock('../drizzle', () => ({
  getDrizzleDb: jest.fn(),
}));

type MockDb = {
  insert: jest.Mock;
  select: jest.Mock;
  delete: jest.Mock;
};

const makeDb = (): MockDb => ({
  insert: jest.fn(),
  select: jest.fn(),
  delete: jest.fn(),
});

const makeBrainDumpRow = (overrides: Partial<BrainDumpRow> = {}): BrainDumpRow => ({
  id: 7,
  note: 'Need to revise renal tubular acidosis',
  createdAt: 1710000000000,
  ...overrides,
});

describe('brainDumpsRepositoryDrizzle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('addBrainDump returns -1 for blank notes without touching the database', async () => {
    const result = await brainDumpsRepositoryDrizzle.addBrainDump('   ');

    expect(result).toBe(-1);
    expect(getDrizzleDb).not.toHaveBeenCalled();
  });

  it('addBrainDump inserts the note with a created timestamp and returns the inserted id', async () => {
    const db = makeDb();
    const returning = jest.fn().mockResolvedValue([{ id: 41 }]);
    const values = jest.fn(() => ({ returning }));
    db.insert.mockReturnValue({ values });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);
    jest.spyOn(Date, 'now').mockReturnValue(1710001234567);

    const result = await brainDumpsRepositoryDrizzle.addBrainDump('Review cardio murmurs');

    expect(values).toHaveBeenCalledWith({
      note: 'Review cardio murmurs',
      createdAt: 1710001234567,
    });
    expect(result).toBe(41);
  });

  it('getBrainDumps maps rows into query-compatible records', async () => {
    const db = makeDb();
    const orderBy = jest.fn().mockResolvedValue([
      makeBrainDumpRow(),
      makeBrainDumpRow({
        id: 6,
        note: 'Revise shock classification',
        createdAt: 1709999999999,
      }),
    ]);
    const from = jest.fn(() => ({ orderBy }));
    db.select.mockReturnValue({ from });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    const result = await brainDumpsRepositoryDrizzle.getBrainDumps();

    expect(orderBy).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        id: 7,
        note: 'Need to revise renal tubular acidosis',
        createdAt: 1710000000000,
      },
      {
        id: 6,
        note: 'Revise shock classification',
        createdAt: 1709999999999,
      },
    ]);
  });

  it('clearBrainDumps deletes all rows', async () => {
    const db = makeDb();
    db.delete.mockResolvedValue(undefined);
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    await brainDumpsRepositoryDrizzle.clearBrainDumps();

    expect(db.delete).toHaveBeenCalledTimes(1);
  });

  it('deleteBrainDump deletes only the requested id', async () => {
    const db = makeDb();
    const where = jest.fn().mockResolvedValue(undefined);
    db.delete.mockReturnValue({ where });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    await brainDumpsRepositoryDrizzle.deleteBrainDump(13);

    expect(where).toHaveBeenCalledTimes(1);
  });
});
