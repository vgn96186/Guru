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
    it('parses clean JSON', () => {
      const raw = '{"name":"test","count":3,"items":["a","b","c"]}';
      const result = parseStructuredJson(raw, SimpleSchema);
      expect(result).toEqual({ name: 'test', count: 3, items: ['a', 'b', 'c'] });
    });

    it('strips markdown code fences', () => {
      const raw = '```json\n{"name":"fenced","count":1,"items":[]}\n```';
      const result = parseStructuredJson(raw, SimpleSchema);
      expect(result).toEqual({ name: 'fenced', count: 1, items: [] });
    });

    it('strips BOM and code fences', () => {
      const raw = '\uFEFF```json\n{"name":"bom","count":0,"items":[]}\n```';
      const result = parseStructuredJson(raw, SimpleSchema);
      expect(result).toEqual({ name: 'bom', count: 0, items: [] });
    });

    it('repairs smart quotes when used as structural delimiters', () => {
      // Smart quotes in keys get repaired to regular quotes
      const raw = '{\u201Cname\u201D:\u201Cvalue\u201D,"count":1,"items":[]}';
      const result = parseStructuredJson(raw, SimpleSchema);
      expect(result).toEqual({ name: 'value', count: 1, items: [] });
    });

    it('repairs single-quoted keys', () => {
      const raw = "{ 'name': 'single', 'count': 2, 'items': [] }";
      const result = parseStructuredJson(raw, SimpleSchema);
      expect(result).toEqual({ name: 'single', count: 2, items: [] });
    });

    it('repairs single-quoted values', () => {
      const raw = '{"name": \'value\', "count": 1, "items": []}';
      const result = parseStructuredJson(raw, SimpleSchema);
      expect(result.name).toBe('value');
    });

    it('repairs unquoted keys', () => {
      const raw = '{ name: "unquoted", count: 1, items: [] }';
      const result = parseStructuredJson(raw, SimpleSchema);
      expect(result).toEqual({ name: 'unquoted', count: 1, items: [] });
    });

    it('repairs trailing commas', () => {
      const raw = '{"name":"trailing","count":1,"items":["x"],}';
      const result = parseStructuredJson(raw, SimpleSchema);
      expect(result).toEqual({ name: 'trailing', count: 1, items: ['x'] });
    });

    it('repairs missing commas between properties', () => {
      const raw = '{"name":"a"\n"count":1\n"items":[]}';
      const result = parseStructuredJson(raw, SimpleSchema);
      expect(result).toEqual({ name: 'a', count: 1, items: [] });
    });

    it('repairs truncated JSON (missing closing brace)', () => {
      const raw = '{"name":"truncated","count":1,"items":["a"';
      const result = parseStructuredJson(raw, SimpleSchema);
      expect(result).toEqual({ name: 'truncated', count: 1, items: ['a'] });
    });

    it('repairs truncated JSON with nested object', () => {
      const raw = '{"name":"x","count":1,"items":["a","b"';
      const result = parseStructuredJson(raw, SimpleSchema);
      expect(result).toEqual({ name: 'x', count: 1, items: ['a', 'b'] });
    });

    it('extracts JSON from surrounding text', () => {
      const raw = 'Here is the response:\n{"name":"extracted","count":5,"items":["x"]}\nHope that helps!';
      const result = parseStructuredJson(raw, SimpleSchema);
      expect(result).toEqual({ name: 'extracted', count: 5, items: ['x'] });
    });

    it('strips leading "json" prefix', () => {
      const raw = 'json {"name":"prefixed","count":1,"items":[]}';
      const result = parseStructuredJson(raw, SimpleSchema);
      expect(result).toEqual({ name: 'prefixed', count: 1, items: [] });
    });

    it('handles JSON with line comments (repair)', () => {
      const raw = '{"name":"commented", // inline\n"count":1,"items":[]}';
      const result = parseStructuredJson(raw, SimpleSchema);
      expect(result).toEqual({ name: 'commented', count: 1, items: [] });
    });

    it('validates against schema and throws on invalid structure', () => {
      const raw = '{"name":"ok","count":"not-a-number","items":[]}';
      expect(() => parseStructuredJson(raw, SimpleSchema)).toThrow();
    });

    it('throws when all repair candidates fail', () => {
      const raw = 'not json at all { broken';
      expect(() => parseStructuredJson(raw, SimpleSchema)).toThrow();
    });

    it('parses array root', () => {
      const ArraySchema = z.array(z.object({ id: z.number() }));
      const raw = '[{"id":1},{"id":2}]';
      const result = parseStructuredJson(raw, ArraySchema);
      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('extracts array from markdown', () => {
      const ArraySchema = z.array(z.string());
      const raw = '```\n["a","b","c"]\n```';
      const result = parseStructuredJson(raw, ArraySchema);
      expect(result).toEqual(['a', 'b', 'c']);
    });
  });
});
