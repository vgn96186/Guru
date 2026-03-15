import { z } from 'zod';
import { parseStructuredJson } from './jsonRepair';

const SimpleSchema = z.object({
  name: z.string(),
  count: z.number(),
  items: z.array(z.string()),
});

describe('jsonRepair', () => {
  beforeEach(() => {
    (globalThis as any).__DEV__ = false;
  });

  describe('parseStructuredJson', () => {
    it('parses clean JSON', async () => {
      const raw = '{"name":"test","count":3,"items":["a","b","c"]}';
      const result = await parseStructuredJson(raw, SimpleSchema);
      expect(result).toEqual({ name: 'test', count: 3, items: ['a', 'b', 'c'] });
    });

    it('strips markdown code fences', async () => {
      const raw = '```json\n{"name":"fenced","count":1,"items":[]}\n```';
      const result = await parseStructuredJson(raw, SimpleSchema);
      expect(result).toEqual({ name: 'fenced', count: 1, items: [] });
    });

    it('strips BOM and code fences', async () => {
      const raw = '\uFEFF```json\n{"name":"bom","count":0,"items":[]}\n```';
      const result = await parseStructuredJson(raw, SimpleSchema);
      expect(result).toEqual({ name: 'bom', count: 0, items: [] });
    });

    it('repairs smart quotes when used as structural delimiters', async () => {
      // Smart quotes in keys get repaired to regular quotes
      const raw = '{\u201Cname\u201D:\u201Cvalue\u201D,"count":1,"items":[]}';
      const result = await parseStructuredJson(raw, SimpleSchema);
      expect(result).toEqual({ name: 'value', count: 1, items: [] });
    });

    it('repairs single-quoted keys', async () => {
      const raw = "{ 'name': 'single', 'count': 2, 'items': [] }";
      const result = await parseStructuredJson(raw, SimpleSchema);
      expect(result).toEqual({ name: 'single', count: 2, items: [] });
    });

    it('repairs single-quoted values', async () => {
      const raw = '{"name": \'value\', "count": 1, "items": []}';
      const result = await parseStructuredJson(raw, SimpleSchema);
      expect(result.name).toBe('value');
    });

    it('repairs unquoted keys', async () => {
      const raw = '{ name: "unquoted", count: 1, items: [] }';
      const result = await parseStructuredJson(raw, SimpleSchema);
      expect(result).toEqual({ name: 'unquoted', count: 1, items: [] });
    });

    it('repairs trailing commas', async () => {
      const raw = '{"name":"trailing","count":1,"items":["x"],}';
      const result = await parseStructuredJson(raw, SimpleSchema);
      expect(result).toEqual({ name: 'trailing', count: 1, items: ['x'] });
    });

    it('repairs missing commas between properties', async () => {
      const raw = '{"name":"a"\n"count":1\n"items":[]}';
      const result = await parseStructuredJson(raw, SimpleSchema);
      expect(result).toEqual({ name: 'a', count: 1, items: [] });
    });

    it('repairs truncated JSON (missing closing brace)', async () => {
      const raw = '{"name":"truncated","count":1,"items":["a"';
      const result = await parseStructuredJson(raw, SimpleSchema);
      expect(result).toEqual({ name: 'truncated', count: 1, items: ['a'] });
    });

    it('repairs truncated JSON with nested object', async () => {
      const raw = '{"name":"x","count":1,"items":["a","b"';
      const result = await parseStructuredJson(raw, SimpleSchema);
      expect(result).toEqual({ name: 'x', count: 1, items: ['a', 'b'] });
    });

    it('extracts JSON from surrounding text', async () => {
      const raw =
        'Here is the response:\n{"name":"extracted","count":5,"items":["x"]}\nHope that helps!';
      const result = await parseStructuredJson(raw, SimpleSchema);
      expect(result).toEqual({ name: 'extracted', count: 5, items: ['x'] });
    });

    it('strips leading "json" prefix', async () => {
      const raw = 'json {"name":"prefixed","count":1,"items":[]}';
      const result = await parseStructuredJson(raw, SimpleSchema);
      expect(result).toEqual({ name: 'prefixed', count: 1, items: [] });
    });

    it('handles JSON with line comments (repair)', async () => {
      const raw = '{"name":"commented", // inline\n"count":1,"items":[]}';
      const result = await parseStructuredJson(raw, SimpleSchema);
      expect(result).toEqual({ name: 'commented', count: 1, items: [] });
    });

    it('validates against schema and throws on invalid structure', async () => {
      const raw = '{"name":"ok","count":"not-a-number","items":[]}';
      await expect(parseStructuredJson(raw, SimpleSchema)).rejects.toThrow();
    });

    it('throws when all repair candidates fail', async () => {
      const raw = 'not json at all { broken';
      await expect(parseStructuredJson(raw, SimpleSchema)).rejects.toThrow();
    });

    it('parses array root', async () => {
      const ArraySchema = z.array(z.object({ id: z.number() }));
      const raw = '[{"id":1},{"id":2}]';
      const result = await parseStructuredJson(raw, ArraySchema);
      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('extracts array from markdown', async () => {
      const ArraySchema = z.array(z.string());
      const raw = '```\n["a","b","c"]\n```';
      const result = await parseStructuredJson(raw, ArraySchema);
      expect(result).toEqual(['a', 'b', 'c']);
    });
  });
});
