import { getDrizzleDb } from '../drizzle';
import { runInTransaction } from '../database';
import { questionBankRepositoryDrizzle } from './questionBankRepository.drizzle';

jest.mock('drizzle-orm', () => {
  const makeExpr = (type: string, value?: unknown) => ({ __expr: type, value });
  const sql = jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    __expr: 'sql',
    strings,
    values,
  }));

  return {
    and: jest.fn((...args: unknown[]) => makeExpr('and', args)),
    asc: jest.fn((arg: unknown) => makeExpr('asc', arg)),
    desc: jest.fn((arg: unknown) => makeExpr('desc', arg)),
    eq: jest.fn((left: unknown, right: unknown) => makeExpr('eq', [left, right])),
    isNull: jest.fn((arg: unknown) => makeExpr('isNull', arg)),
    like: jest.fn((left: unknown, right: unknown) => makeExpr('like', [left, right])),
    lte: jest.fn((left: unknown, right: unknown) => makeExpr('lte', [left, right])),
    notInArray: jest.fn((left: unknown, right: unknown) => makeExpr('notInArray', [left, right])),
    or: jest.fn((...args: unknown[]) => makeExpr('or', args)),
    sql,
  };
});

jest.mock('../drizzle', () => ({
  getDrizzleDb: jest.fn(),
}));

jest.mock('../database', () => ({
  runInTransaction: jest.fn(),
}));

jest.mock('../drizzleSchema', () => ({
  questionBank: {
    id: 'id',
    question: 'question',
    options: 'options',
    correctIndex: 'correctIndex',
    explanation: 'explanation',
    topicId: 'topicId',
    topicName: 'topicName',
    subjectName: 'subjectName',
    source: 'source',
    sourceId: 'sourceId',
    imageUrl: 'imageUrl',
    isBookmarked: 'isBookmarked',
    isMastered: 'isMastered',
    timesSeen: 'timesSeen',
    timesCorrect: 'timesCorrect',
    lastSeenAt: 'lastSeenAt',
    nextReviewAt: 'nextReviewAt',
    difficulty: 'difficulty',
    createdAt: 'createdAt',
  },
}));

type MockDb = {
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  transaction: jest.Mock;
};

const makeDb = (): MockDb => ({
  select: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  transaction: jest.fn(),
});

const makeQuestionRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 11,
  question: 'Most common cause of nephrotic syndrome in children?',
  options: JSON.stringify(['MCD', 'FSGS', 'MPGN', 'Membranous']),
  correctIndex: 0,
  explanation: 'Minimal change disease is the most common in children.',
  topicId: 4,
  topicName: 'Nephrotic syndrome',
  subjectName: 'Medicine',
  source: 'content_card',
  sourceId: 'cc-11',
  imageUrl: null,
  isBookmarked: 1,
  isMastered: 0,
  timesSeen: 2,
  timesCorrect: 1,
  lastSeenAt: 1710000000000,
  nextReviewAt: 1710100000000,
  difficulty: 0.45,
  createdAt: 1710005000000,
  ...overrides,
});

describe('questionBankRepositoryDrizzle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('saveQuestion inserts serialized question data and returns inserted id or zero for duplicates', async () => {
    const db = makeDb();
    const returning = jest
      .fn()
      .mockResolvedValueOnce([{ id: 41 }])
      .mockResolvedValueOnce([]);
    const onConflictDoNothing = jest.fn(() => ({ returning }));
    const values = jest.fn(() => ({ onConflictDoNothing }));
    db.insert.mockReturnValue({ values });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    const createdId = await questionBankRepositoryDrizzle.saveQuestion({
      question: 'What is the antidote for heparin?',
      options: ['Vitamin K', 'Protamine sulfate', 'FFP', 'Tranexamic acid'],
      correctIndex: 1,
      explanation: 'Protamine reverses heparin.',
      topicId: 7,
      topicName: 'Anticoagulants',
      subjectName: 'Pharmacology',
      source: 'manual',
      sourceId: 'manual-1',
      imageUrl: null,
    });

    const duplicateId = await questionBankRepositoryDrizzle.saveQuestion({
      question: 'What is the antidote for heparin?',
      options: ['Vitamin K', 'Protamine sulfate', 'FFP', 'Tranexamic acid'],
      correctIndex: 1,
      explanation: 'Protamine reverses heparin.',
      source: 'manual',
    });

    expect(createdId).toBe(41);
    expect(duplicateId).toBe(0);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        question: 'What is the antidote for heparin?',
        options: JSON.stringify(['Vitamin K', 'Protamine sulfate', 'FFP', 'Tranexamic acid']),
        correctIndex: 1,
        explanation: 'Protamine reverses heparin.',
        topicId: 7,
        topicName: 'Anticoagulants',
        subjectName: 'Pharmacology',
        source: 'manual',
        sourceId: 'manual-1',
        imageUrl: null,
        createdAt: expect.any(Number),
      }),
    );
    expect(onConflictDoNothing).toHaveBeenCalledTimes(2);
  });

  it('saveBulkQuestions short-circuits empty input and counts inserted rows inside a transaction', async () => {
    const db = makeDb();
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    await expect(questionBankRepositoryDrizzle.saveBulkQuestions([])).resolves.toBe(0);
    expect(db.transaction).not.toHaveBeenCalled();

    const tx = {
      insert: jest.fn(),
    };
    const returning = jest
      .fn()
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 3 }]);
    const onConflictDoNothing = jest.fn(() => ({ returning }));
    const values = jest.fn(() => ({ onConflictDoNothing }));
    tx.insert.mockReturnValue({ values });
    db.transaction.mockImplementation(async (callback: (txn: typeof tx) => Promise<number>) =>
      callback(tx),
    );
    (runInTransaction as jest.Mock).mockImplementation(
      async (callback: (txn: typeof tx) => Promise<number>) => db.transaction(callback),
    );

    const saved = await questionBankRepositoryDrizzle.saveBulkQuestions([
      {
        question: 'Q1',
        options: ['A', 'B', 'C', 'D'],
        correctIndex: 0,
        explanation: 'E1',
        source: 'content_card',
      },
      {
        question: 'Q2',
        options: ['A', 'B', 'C', 'D'],
        correctIndex: 1,
        explanation: 'E2',
        source: 'lecture_quiz',
      },
      {
        question: 'Q3',
        options: ['A', 'B', 'C', 'D'],
        correctIndex: 2,
        explanation: 'E3',
        source: 'manual',
      },
    ]);

    expect(saved).toBe(2);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledTimes(3);
  });

  it('recordAttempt updates spaced repetition fields for correct and incorrect attempts', async () => {
    const db = makeDb();
    const tx = {
      select: jest.fn(),
      update: jest.fn(),
    };
    const selectLimit = jest
      .fn()
      .mockResolvedValueOnce([
        {
          timesSeen: 4,
          timesCorrect: 4,
          difficulty: 0.4,
          isMastered: 0,
        },
      ])
      .mockResolvedValueOnce([
        {
          timesSeen: 2,
          timesCorrect: 1,
          difficulty: 0.35,
          isMastered: 1,
        },
      ]);
    const selectWhere = jest.fn(() => ({ limit: selectLimit }));
    const selectFrom = jest.fn(() => ({ where: selectWhere }));
    tx.select.mockReturnValue({ from: selectFrom });

    const correctWhere = jest.fn().mockResolvedValue(undefined);
    const correctSet = jest.fn(() => ({ where: correctWhere }));
    const incorrectWhere = jest.fn().mockResolvedValue(undefined);
    const incorrectSet = jest.fn(() => ({ where: incorrectWhere }));
    tx.update.mockReturnValueOnce({ set: correctSet }).mockReturnValueOnce({ set: incorrectSet });

    db.transaction.mockImplementation(async (callback: (txn: typeof tx) => Promise<void>) =>
      callback(tx),
    );
    (getDrizzleDb as jest.Mock).mockReturnValue(db);
    (runInTransaction as jest.Mock).mockImplementation(
      async (callback: (txn: typeof tx) => Promise<void>) => db.transaction(callback),
    );
    jest.spyOn(Date, 'now').mockReturnValue(1717000000000);

    await questionBankRepositoryDrizzle.recordAttempt(9, true);
    await questionBankRepositoryDrizzle.recordAttempt(9, false);

    expect(correctSet).toHaveBeenCalledWith(
      expect.objectContaining({
        timesSeen: 5,
        timesCorrect: 5,
        lastSeenAt: 1717000000000,
        nextReviewAt: 1719592000000,
        difficulty: expect.closeTo(0.35, 5),
        isMastered: 1,
      }),
    );
    expect(incorrectSet).toHaveBeenCalledWith(
      expect.objectContaining({
        timesSeen: 3,
        timesCorrect: 1,
        lastSeenAt: 1717000000000,
        nextReviewAt: 1717086400000,
        difficulty: expect.closeTo(0.45, 5),
        isMastered: 1,
      }),
    );
  });

  it('getQuestions maps rows to legacy shape and getQuestionCount returns aggregate count', async () => {
    const db = makeDb();
    const rowsOrderBy = jest.fn().mockResolvedValue([makeQuestionRow()]);
    const rowsWhere = jest.fn(() => ({ orderBy: rowsOrderBy }));
    const rowsFrom = jest.fn(() => ({ where: rowsWhere, orderBy: rowsOrderBy }));

    const countLimit = jest.fn().mockResolvedValue([{ cnt: 7 }]);
    const countWhere = jest.fn(() => ({ limit: countLimit }));
    const countFrom = jest.fn(() => ({ where: countWhere }));

    db.select.mockReturnValueOnce({ from: rowsFrom }).mockReturnValueOnce({ from: countFrom });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    const questions = await questionBankRepositoryDrizzle.getQuestions({
      subjectName: 'Medicine',
      dueForReview: true,
      search: 'nephrotic',
    });
    const count = await questionBankRepositoryDrizzle.getQuestionCount({
      subjectName: 'Medicine',
      dueForReview: true,
    });

    expect(rowsWhere).toHaveBeenCalledTimes(1);
    expect(rowsOrderBy).toHaveBeenCalledTimes(1);
    expect(questions).toEqual([
      {
        id: 11,
        question: 'Most common cause of nephrotic syndrome in children?',
        options: ['MCD', 'FSGS', 'MPGN', 'Membranous'],
        correctIndex: 0,
        explanation: 'Minimal change disease is the most common in children.',
        topicId: 4,
        topicName: 'Nephrotic syndrome',
        subjectName: 'Medicine',
        source: 'content_card',
        sourceId: 'cc-11',
        imageUrl: null,
        isBookmarked: true,
        isMastered: false,
        timesSeen: 2,
        timesCorrect: 1,
        lastSeenAt: 1710000000000,
        nextReviewAt: 1710100000000,
        difficulty: 0.45,
        createdAt: 1710005000000,
      },
    ]);
    expect(count).toBe(7);
    expect(countLimit).toHaveBeenCalledWith(1);
  });

  it('getPracticeSet prioritizes due questions and fills remaining slots from extra rows without duplicates', async () => {
    const db = makeDb();
    const dueLimit = jest
      .fn()
      .mockResolvedValue([
        makeQuestionRow({ id: 1, question: 'Due 1' }),
        makeQuestionRow({ id: 2, question: 'Due 2' }),
      ]);
    const dueOrderBy = jest.fn(() => ({ limit: dueLimit }));
    const dueWhere = jest.fn(() => ({ orderBy: dueOrderBy }));
    const dueFrom = jest.fn(() => ({ where: dueWhere }));

    const extraLimit = jest
      .fn()
      .mockResolvedValue([
        makeQuestionRow({ id: 2, question: 'Due 2' }),
        makeQuestionRow({ id: 3, question: 'Extra 1', isBookmarked: 0 }),
        makeQuestionRow({ id: 4, question: 'Extra 2', isMastered: 0 }),
      ]);
    const extraOrderBy = jest.fn(() => ({ limit: extraLimit }));
    const extraWhere = jest.fn(() => ({ orderBy: extraOrderBy }));
    const extraFrom = jest.fn(() => ({ where: extraWhere }));

    db.select.mockReturnValueOnce({ from: dueFrom }).mockReturnValueOnce({ from: extraFrom });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    const result = await questionBankRepositoryDrizzle.getPracticeSet(3, {
      subjectName: 'Medicine',
    });

    expect(dueLimit).toHaveBeenCalledWith(3);
    expect(extraLimit).toHaveBeenCalledWith(3);
    expect(result.map((item) => item.id)).toEqual([1, 2, 3]);
  });

  it('getDueForReview applies review ordering and limit', async () => {
    const db = makeDb();
    const limit = jest
      .fn()
      .mockResolvedValue([
        makeQuestionRow({ id: 5, nextReviewAt: null }),
        makeQuestionRow({ id: 6, nextReviewAt: 1710000001000 }),
      ]);
    const orderBy = jest.fn(() => ({ limit }));
    const where = jest.fn(() => ({ orderBy }));
    const from = jest.fn(() => ({ where }));
    db.select.mockReturnValue({ from });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    const result = await questionBankRepositoryDrizzle.getDueForReview(2);

    expect(limit).toHaveBeenCalledWith(2);
    expect(result.map((item) => item.id)).toEqual([5, 6]);
  });

  it('getCachedUnseenQuestionsForSessionFallback prioritizes topic then subject then global rows and deduplicates', async () => {
    const db = makeDb();
    const firstLimit = jest
      .fn()
      .mockResolvedValue([makeQuestionRow({ id: 10, question: 'Topic match', topicId: 55 })]);
    const firstOrderBy = jest.fn(() => ({ limit: firstLimit }));
    const firstWhere = jest.fn(() => ({ orderBy: firstOrderBy }));
    const firstFrom = jest.fn(() => ({ where: firstWhere }));

    const secondLimit = jest
      .fn()
      .mockResolvedValue([
        makeQuestionRow({ id: 10, question: 'Topic match', topicId: 55 }),
        makeQuestionRow({ id: 20, question: 'Subject match', topicId: 99, source: 'manual' }),
      ]);
    const secondOrderBy = jest.fn(() => ({ limit: secondLimit }));
    const secondWhere = jest.fn(() => ({ orderBy: secondOrderBy }));
    const secondFrom = jest.fn(() => ({ where: secondWhere }));

    db.select.mockReturnValueOnce({ from: firstFrom }).mockReturnValueOnce({ from: secondFrom });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    const result = await questionBankRepositoryDrizzle.getCachedUnseenQuestionsForSessionFallback(
      55,
      'Medicine',
      2,
    );

    expect(firstLimit).toHaveBeenCalledWith(6);
    expect(secondLimit).toHaveBeenCalledWith(6);
    expect(result.map((item) => item.id)).toEqual([10, 20]);
    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it('getSubjectStats maps nullish aggregate values and falls back to Unknown subject', async () => {
    const db = makeDb();
    const orderBy = jest.fn().mockResolvedValue([
      {
        subjectName: 'Medicine',
        total: 12,
        mastered: 5,
        bookmarked: 3,
      },
      {
        subjectName: '',
        total: 4,
        mastered: null,
        bookmarked: null,
      },
    ]);
    const groupBy = jest.fn(() => ({ orderBy }));
    const from = jest.fn(() => ({ groupBy }));
    db.select.mockReturnValue({ from });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    const result = await questionBankRepositoryDrizzle.getSubjectStats();

    expect(result).toEqual([
      {
        subject: 'Medicine',
        total: 12,
        mastered: 5,
        bookmarked: 3,
      },
      {
        subject: 'Unknown',
        total: 4,
        mastered: 0,
        bookmarked: 0,
      },
    ]);
  });

  it('deleteQuestion, toggleBookmark, and markMastered issue targeted updates', async () => {
    const db = makeDb();
    const deleteWhere = jest.fn().mockResolvedValue(undefined);
    const bookmarkWhere = jest.fn().mockResolvedValue(undefined);
    const bookmarkSet = jest.fn(() => ({ where: bookmarkWhere }));
    const masteredWhere = jest.fn().mockResolvedValue(undefined);
    const masteredSet = jest.fn(() => ({ where: masteredWhere }));

    db.delete.mockReturnValue({ where: deleteWhere });
    db.update.mockReturnValueOnce({ set: bookmarkSet }).mockReturnValueOnce({ set: masteredSet });
    (getDrizzleDb as jest.Mock).mockReturnValue(db);

    await questionBankRepositoryDrizzle.deleteQuestion(30);
    await questionBankRepositoryDrizzle.toggleBookmark(30);
    await questionBankRepositoryDrizzle.markMastered(30, true);

    expect(deleteWhere).toHaveBeenCalledTimes(1);
    expect(bookmarkSet).toHaveBeenCalledTimes(1);
    expect(masteredSet).toHaveBeenCalledWith({ isMastered: 1 });
    expect(bookmarkWhere).toHaveBeenCalledTimes(1);
    expect(masteredWhere).toHaveBeenCalledTimes(1);
  });
});
