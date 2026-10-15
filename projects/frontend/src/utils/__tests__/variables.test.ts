import { describe, it, expect } from 'vitest';
import { resolveVariables, parseVariables } from '../variables';

describe('variables utility', () => {
  describe('resolveVariables', () => {
    it('should resolve valid variables', () => {
      const vars = new Map([['host', 'localhost']]);
      expect(resolveVariables('{{host}}/api', vars)).toBe('localhost/api');
    });

    it('should handle keys with spaces', () => {
      const vars = new Map([['host', 'localhost']]);
      expect(resolveVariables('{{ host }}/api', vars)).toBe('localhost/api');
    });

    it('should leave missing variables intact', () => {
      const vars = new Map();
      expect(resolveVariables('{{token}}', vars)).toBe('{{token}}');
    });

    it('should not resolve nested variables (single pass)', () => {
      const vars = new Map([['msg', '{{nested}}']]);
      expect(resolveVariables('{{msg}}', vars)).toBe('{{nested}}');
    });

    it('should resolve multiple variables in one string', () => {
      const vars = new Map([['host', 'db'], ['port', '5432']]);
      expect(resolveVariables('{{host}}:{{port}}', vars)).toBe('db:5432');
    });

    it('should handle empty input', () => {
      const vars = new Map();
      expect(resolveVariables('', vars)).toBe('');
    });
  });

  describe('parseVariables', () => {
    it('should parse strings into segments', () => {
      const vars = new Map([['b', '1']]);
      const result = parseVariables('A {{ b }} C', vars);
      
      expect(result).toEqual([
        { type: 'text', value: 'A ' },
        { type: 'resolved', value: '1', original: '{{ b }}', key: 'b' },
        { type: 'text', value: ' C' }
      ]);
    });

    it('should mark missing variables correctly', () => {
      const vars = new Map();
      const result = parseVariables('{{missing}} text', vars);
      
      expect(result).toEqual([
        { type: 'missing', value: '{{missing}}', key: 'missing' },
        { type: 'text', value: ' text' }
      ]);
    });
  });
});
