import {
  generateADHDNote,
  buildQuickLectureNote,
  shouldReplaceLectureNote,
} from './noteGeneration';
import { generateText } from '../ai/v2/generateText';
import type { LectureAnalysis } from './analysis';

jest.mock('../ai/v2/generateText', () => ({
  generateText: jest.fn(),
}));

jest.mock('../ai/v2/providers/guruFallback', () => ({
  createGuruFallbackModel: jest.fn(() => ({ provider: 'test', modelId: 'test' })),
}));

jest.mock('../../db/repositories/profileRepository', () => ({
  profileRepository: { getProfile: jest.fn(async () => ({})) },
}));

// Alias so existing test assertions can reference either name
const generateTextWithRouting = generateText;

describe('Note Generation Service', () => {
  const mockAnalysis: LectureAnalysis = {
    subject: 'Anatomy',
    topics: ['Upper Limb'],
    keyConcepts: ['Brachial Plexus'],
    highYieldPoints: ["Erb's Palsy"],
    lectureSummary: 'A lecture on upper limb anatomy.',
    estimatedConfidence: 3,
    transcript: 'Long transcript content...',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateADHDNote', () => {
    it('should generate a note using AI', async () => {
      (generateTextWithRouting as jest.Mock).mockResolvedValue({
        text: 'Elite ADHD Note Content',
      });

      const note = await generateADHDNote(mockAnalysis);
      expect(note).toBe('Elite ADHD Note Content');
      expect(generateTextWithRouting).toHaveBeenCalled();
    });

    it('should return a quick note if AI fails', async () => {
      (generateTextWithRouting as jest.Mock).mockRejectedValue(new Error('AI failed'));

      const note = await generateADHDNote(mockAnalysis);
      expect(note).toContain('🎯 **Subject**: Anatomy');
      expect(note).toContain('💡 **Key Concepts**');
    });

    it('keeps tail context for long transcripts so later lecture points are not dropped', async () => {
      (generateTextWithRouting as jest.Mock).mockResolvedValue({
        text: 'Elite ADHD Note Content',
      });
      const longAnalysis: LectureAnalysis = {
        ...mockAnalysis,
        transcript: `INTRO_MARKER ${'a'.repeat(14000)} TAIL_MARKER important end content`,
      };

      await generateADHDNote(longAnalysis);

      const callArg = (generateTextWithRouting as jest.Mock).mock.calls[0][0];
      const messages = callArg.messages;
      expect(messages[1].content).toContain('INTRO_MARKER');
      expect(messages[1].content).toContain('TAIL_MARKER');
    });
  });

  describe('buildQuickLectureNote', () => {
    it('should build a formatted note from analysis', () => {
      const note = buildQuickLectureNote(mockAnalysis);
      expect(note).toContain('🎯 **Subject**: Anatomy');
      expect(note).toContain('📌 **Topics**: Upper Limb');
      expect(note).toContain('💡 **Key Concepts**');
      expect(note).toContain('• Brachial Plexus');
      expect(note).toContain("🚀 **Erb's Palsy**");
    });
  });

  describe('shouldReplaceLectureNote', () => {
    it('should return true if candidate is significantly better', () => {
      const current = 'Short note';
      const candidate = `
🎯 **Subject**: Anatomy
📌 **Topics**: Upper Limb
💡 **Key Concepts**
🚀 **High-Yield Facts**
🧠 **Clinical Links**
📝 **Integrated Summary**
❓ **Check Yourself**
• Bullet 1
• Bullet 2
• Bullet 3
**Bold 1** **Bold 2** **Bold 3**
Q: Question 1
Q: Question 2
Long detail content...
      `;
      expect(shouldReplaceLectureNote(current, candidate)).toBe(true);
    });

    it('should return false if candidate is same or worse', () => {
      const current = 'Same note content';
      const candidate = 'Same note content';
      expect(shouldReplaceLectureNote(current, candidate)).toBe(false);
    });

    it('should return true if current is empty', () => {
      expect(shouldReplaceLectureNote('', 'New note')).toBe(true);
    });
  });
});
