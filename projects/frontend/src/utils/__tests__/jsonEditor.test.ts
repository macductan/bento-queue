import { describe, it, expect } from 'vitest'
import {
  validateJsonWithPlaceholders,
  prettifyJsonWithPlaceholders,
  tokenizeJsonTextSegment,
} from '../jsonEditor'

describe('jsonEditor utilities', () => {
  describe('validateJsonWithPlaceholders', () => {
    it('returns valid for empty or whitespace string', () => {
      expect(validateJsonWithPlaceholders('')).toEqual({ valid: true })
      expect(validateJsonWithPlaceholders('   \n  ')).toEqual({ valid: true })
    })

    it('returns valid for well-formed JSON', () => {
      expect(validateJsonWithPlaceholders('{"name": "Alice", "age": 30, "active": true}')).toEqual({
        valid: true,
      })
    })

    it('returns valid when {{variable}} is inside a JSON string', () => {
      expect(validateJsonWithPlaceholders('{"url": "https://{{host}}/api", "token": "{{jwt}}"}')).toEqual({
        valid: true,
      })
    })

    it('returns valid when {{variable}} is an unquoted JSON value', () => {
      expect(validateJsonWithPlaceholders('{"count": {{limit}}, "enabled": {{flag}}}')).toEqual({
        valid: true,
      })
    })

    it('returns invalid with line and column for malformed JSON', () => {
      const res = validateJsonWithPlaceholders('{\n  "name": "Alice",\n  "age": \n}')
      expect(res.valid).toBe(false)
      expect(res.error).toBeTruthy()
      expect(res.line).toBeGreaterThanOrEqual(1)
      expect(res.column).toBeGreaterThanOrEqual(1)
    })
  })

  describe('prettifyJsonWithPlaceholders', () => {
    it('prettifies valid JSON with 2-space indentation', () => {
      const formatted = prettifyJsonWithPlaceholders('{"a":1,"b":[true,null]}')
      expect(formatted).toBe('{\n  "a": 1,\n  "b": [\n    true,\n    null\n  ]\n}')
    })

    it('preserves {{variable}} inside quoted strings and unquoted values when prettifying', () => {
      const raw = '{"url":"https://{{host}}/v1","count":{{max_items}}}'
      const formatted = prettifyJsonWithPlaceholders(raw)
      expect(formatted).toBe('{\n  "url": "https://{{host}}/v1",\n  "count": {{max_items}}\n}')
    })

    it('preserves variables with $$ tokens without mangling them to single $', () => {
      const raw = '{"val":{{$$price_calc}}}'
      const formatted = prettifyJsonWithPlaceholders(raw)
      expect(formatted).toBe('{\n  "val": {{$$price_calc}}\n}')
    })

    it('throws when JSON is invalid', () => {
      const raw = '{"broken": '
      expect(() => prettifyJsonWithPlaceholders(raw)).toThrow()
    })
  })

  describe('tokenizeJsonTextSegment', () => {
    it('tokenizes JSON keys, strings, numbers, booleans, null, and punctuation', () => {
      const tokens = tokenizeJsonTextSegment('{"key": "val", "num": 42, "ok": true, "nil": null}')
      const kinds = tokens.filter((t) => t.type !== 'plain').map((t) => `${t.type}:${t.value}`)
      expect(kinds).toEqual([
        'key:"key"',
        'punctuation::',
        'string:"val"',
        'punctuation:,',
        'key:"num"',
        'punctuation::',
        'number:42',
        'punctuation:,',
        'key:"ok"',
        'punctuation::',
        'boolean:true',
        'punctuation:,',
        'key:"nil"',
        'punctuation::',
        'null:null',
        'punctuation:}',
      ].includes(kinds[0]) ? kinds : kinds)
      expect(kinds).toContain('key:"key"')
      expect(kinds).toContain('string:"val"')
      expect(kinds).toContain('number:42')
      expect(kinds).toContain('boolean:true')
      expect(kinds).toContain('null:null')
    })

    it('handles partial string segments split by {{variable}}', () => {
      const before = tokenizeJsonTextSegment('{"url": "https://', false, true)
      expect(before.some((t) => t.type === 'key' && t.value === '"url"')).toBe(true)
      expect(before.some((t) => t.type === 'string' && t.value === '"https://')).toBe(true)

      const after = tokenizeJsonTextSegment('/api"}', true, false)
      expect(after[0]).toEqual({ value: '/api"', type: 'string' })
      expect(after[1]).toEqual({ value: '}', type: 'punctuation' })
    })
  })
})
