import { z } from 'zod';
import { zodSchemaToGeminiJsonSchema } from './zodToResponseJsonSchema';
import { AIContentSchema, CatalystSchema, DailyAgendaSchema } from '../schemas';

describe('zodSchemaToGeminiJsonSchema', () => {
  it('returns a draft-2020-12 style object for AIContentSchema', () => {
    const schema = zodSchemaToGeminiJsonSchema(AIContentSchema);
    expect(schema).not.toBeNull();
    expect(schema?.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(
      (schema as { oneOf?: unknown; anyOf?: unknown }).oneOf ??
        (schema as { anyOf?: unknown }).anyOf,
    ).toBeTruthy();
  });

  it('returns schema for DailyAgendaSchema (includes transforms)', () => {
    const schema = zodSchemaToGeminiJsonSchema(DailyAgendaSchema);
    expect(schema).not.toBeNull();
    expect((schema as { properties?: unknown }).properties).toBeTruthy();
  });

  it('returns schema for CatalystSchema', () => {
    const schema = zodSchemaToGeminiJsonSchema(CatalystSchema);
    expect(schema).not.toBeNull();
  });

  it('returns null when z.toJSONSchema throws', () => {
    const spy = jest.spyOn(z, 'toJSONSchema').mockImplementationOnce(() => {
      throw new Error('unrepresentable');
    });
    expect(zodSchemaToGeminiJsonSchema(z.object({ a: z.string() }))).toBeNull();
    spy.mockRestore();
  });
});
