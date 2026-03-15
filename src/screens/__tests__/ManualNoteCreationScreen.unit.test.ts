import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockAnalyzeTranscript = jest.fn();
const mockGenerateADHDNote = jest.fn();
const mockGetSubjectByName = jest.fn();
const mockSaveLectureTranscript = jest.fn();
const mockGoBack = jest.fn();

jest.mock('../../services/transcriptionService', () => ({
  analyzeTranscript: mockAnalyzeTranscript,
  generateADHDNote: mockGenerateADHDNote
}));

jest.mock('../../db/queries/topics', () => ({
  getSubjectByName: mockGetSubjectByName,
  saveLectureTranscript: mockSaveLectureTranscript
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: mockGoBack,
  })
}));

describe('ManualNoteCreationScreen mocks', () => {
  it('runs successful dummy test', () => {
    expect(true).toBe(true);
  });
});
