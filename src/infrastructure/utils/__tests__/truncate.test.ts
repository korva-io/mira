import { describe, expect, it } from 'vitest';
import { truncateJsonFields, truncateValueList } from '../truncate';

describe('truncate utility', () => {
  describe('truncateJsonFields', () => {
    it('should truncate long strings', () => {
      const input = {
        short: 'hello',
        long: 'a'.repeat(100),
      };
      const result = truncateJsonFields(input);
      expect(result.short).toBe('hello');
      expect(result.long.length).toBe(50);
    });

    it('should handle nested objects', () => {
      const input = {
        level1: {
          level2: {
            level3: {
              long: 'a'.repeat(100),
            },
          },
        },
      };
      const result = truncateJsonFields(input);
      expect(result.level1.level2.level3.long.length).toBe(50);
    });

    it('should handle arrays', () => {
      const input = {
        items: [
          { id: 1, data: 'a'.repeat(100) },
          { id: 2, data: 'b'.repeat(100) },
          { id: 3, data: 'c'.repeat(100) },
        ],
      };
      const result = truncateJsonFields(input);
      expect(result.items.length).toBe(1);
      expect(result.items[0].data.length).toBe(50);
    });

    it('should handle MongoDB-like documents', () => {
      const input = {
        _id: {
          buffer: { type: 'Buffer', data: [1, 2, 3, 4, 5] },
        },
        segments: [
          {
            id: 1,
            text: 'a'.repeat(100),
            tokens: [1, 2, 3, 4, 5],
          },
          {
            id: 2,
            text: 'b'.repeat(100),
            tokens: [6, 7, 8, 9, 10],
          },
        ],
        metadata: {
          created: '2024-01-01',
          updated: '2024-01-02',
          tags: ['tag1', 'tag2', 'tag3'],
        },
      };
      const result = truncateJsonFields(input);
      expect(result.segments.length).toBe(1);
      expect(result.segments[0].text.length).toBe(50);
      expect(result.metadata.tags.length).toBe(1);
    });

    it('should handle JSON strings', () => {
      const input = {
        jsonString: JSON.stringify({
          nested: {
            data: 'a'.repeat(100),
          },
        }),
      };
      const result = truncateJsonFields(input);
      expect(typeof result.jsonString).toBe('string');
      expect(result.jsonString.length).toBe(50);
      expect(() => JSON.parse(result.jsonString)).not.toThrow();
    });
  });

  describe('truncateValueList', () => {
    it('should truncate an array of objects', () => {
      const input = [
        { id: 1, data: 'a'.repeat(100) },
        { id: 2, data: 'b'.repeat(100) },
        { id: 3, data: 'c'.repeat(100) },
      ];
      const result = truncateValueList(input);
      expect(result.length).toBe(3);
      result.forEach((item) => {
        expect(item.data.length).toBe(50);
      });
    });

    it('should handle empty arrays', () => {
      const input: any[] = [];
      const result = truncateValueList(input);
      expect(result).toEqual([]);
    });

    it('should handle arrays with nested structures', () => {
      const input = [
        {
          id: 1,
          nested: {
            array: [{ data: 'a'.repeat(100) }, { data: 'b'.repeat(100) }],
          },
        },
      ];
      const result = truncateValueList(input);
      expect(result[0].nested.array.length).toBe(1);
      expect(result[0].nested.array[0].data.length).toBe(50);
    });
  });
});
