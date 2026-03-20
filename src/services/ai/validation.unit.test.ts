import { z } from 'zod';
import { validateAIResponse } from './validation';

describe('validateAIResponse', () => {
  const schema = z.object({ name: z.string(), count: z.number() });

  it('returns parsed data when valid', () => {
    const data = validateAIResponse(schema, { name: 'test', count: 2 });
    expect(data).toEqual({ name: 'test', count: 2 });
  });

  it('throws with path details when invalid', () => {
    expect(() => validateAIResponse(schema, { name: 1, count: 'nope' })).toThrow(
      /AI response failed validation/,
    );
  });
});
