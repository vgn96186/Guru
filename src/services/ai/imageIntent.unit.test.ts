import {
  isExplicitImageRequest,
  inferRequestedImageStyle,
  canAutoGenerateStudyImage,
  getLastUserPrompt,
} from './imageIntent';
import { type ChatMessage } from '../../types/chat';

describe('imageIntent', () => {
  describe('isExplicitImageRequest', () => {
    it('returns true for explicit image requests', () => {
      expect(isExplicitImageRequest('draw an image of the heart')).toBe(true);
      expect(isExplicitImageRequest('show me a diagram of glycolysis')).toBe(true);
      expect(isExplicitImageRequest('can i see the krebs cycle')).toBe(true);
      expect(isExplicitImageRequest('what does this look like')).toBe(true);
      expect(isExplicitImageRequest('depict the visual pathway')).toBe(true);
    });

    it('returns false for unrelated requests', () => {
      expect(isExplicitImageRequest('what is the function of the heart')).toBe(false);
      expect(isExplicitImageRequest('explain glycolysis')).toBe(false);
      expect(isExplicitImageRequest('tell me a joke')).toBe(false);
      expect(isExplicitImageRequest('')).toBe(false);
    });
  });

  describe('inferRequestedImageStyle', () => {
    it('returns chart for chart-related keywords', () => {
      expect(inferRequestedImageStyle('draw a flowchart of shock')).toBe('chart');
      expect(inferRequestedImageStyle('compare type 1 and type 2 diabetes')).toBe('chart');
      expect(inferRequestedImageStyle('what is the algorithm for ACLS')).toBe('chart');
    });

    it('returns illustration for other requests', () => {
      expect(inferRequestedImageStyle('draw the heart')).toBe('illustration');
      expect(inferRequestedImageStyle('show me a picture of the liver')).toBe('illustration');
    });
  });

  describe('canAutoGenerateStudyImage', () => {
    it('returns true if any valid key is provided', () => {
      expect(canAutoGenerateStudyImage({ geminiKey: 'key' })).toBe(true);
      expect(canAutoGenerateStudyImage({ falApiKey: 'key' })).toBe(true);
      expect(canAutoGenerateStudyImage({ openrouterKey: 'key' })).toBe(true);
      expect(
        canAutoGenerateStudyImage({ cloudflareAccountId: 'id', cloudflareApiToken: 'token' }),
      ).toBe(true);
    });

    it('returns false if no valid keys are provided', () => {
      expect(canAutoGenerateStudyImage({})).toBe(false);
      expect(canAutoGenerateStudyImage(undefined)).toBe(false);
      expect(canAutoGenerateStudyImage(null)).toBe(false);
      expect(canAutoGenerateStudyImage({ cloudflareAccountId: 'id' })).toBe(false);
    });
  });

  describe('getLastUserPrompt', () => {
    it('returns the text of the last user message', () => {
      const messages: ChatMessage[] = [
        { id: '1', role: 'user', text: 'first prompt', timestamp: Date.now() },
        { id: '2', role: 'guru', text: 'response 1', timestamp: Date.now() },
        { id: '3', role: 'user', text: 'second prompt', timestamp: Date.now() },
        { id: '4', role: 'guru', text: 'response 2', timestamp: Date.now() },
      ];
      expect(getLastUserPrompt(messages)).toBe('second prompt');
    });

    it('returns null if there are no user messages', () => {
      const messages: ChatMessage[] = [
        { id: '1', role: 'guru', text: 'response 1', timestamp: Date.now() },
        { id: '2', role: 'guru', text: 'response 2', timestamp: Date.now() },
      ];
      expect(getLastUserPrompt(messages)).toBeNull();
    });

    it('returns null if messages array is empty', () => {
      expect(getLastUserPrompt([])).toBeNull();
    });
  });
});
