import { describe, it, expect } from 'vitest'
import {
  validateJsonWithPlaceholders,
  prettifyJsonWithPlaceholders,
  stripJsoncToJson,
  normalizeSmartChars,
  tokenizeJsonTextSegment,
} from '../jsonEditor'

describe('jsonEditor utilities', () => {
  describe('validateJsonWithPlaceholders', () => {
    it('returns valid for empty or whitespace string', () => {
      expect(validateJsonWithPlaceholders('')).toEqual({ valid: true, isJsonc: false })
      expect(validateJsonWithPlaceholders('   \n  ')).toEqual({ valid: true, isJsonc: false })
    })

    it('returns valid for well-formed JSON', () => {
      expect(validateJsonWithPlaceholders('{"name": "Alice", "age": 30, "active": true}')).toEqual({
        valid: true,
        isJsonc: false,
      })
    })

    it('returns valid when {{variable}} is inside a JSON string', () => {
      expect(validateJsonWithPlaceholders('{"url": "https://{{host}}/api", "token": "{{jwt}}"}')).toEqual({
        valid: true,
        isJsonc: false,
      })
    })

    it('returns valid when {{variable}} is an unquoted JSON value', () => {
      expect(validateJsonWithPlaceholders('{"count": {{limit}}, "enabled": {{flag}}}')).toEqual({
        valid: true,
        isJsonc: false,
      })
    })

    it('returns valid and isJsonc=true when JSON contains comments or trailing commas', () => {
      const withComment = '{\n  // user comment\n  "name": "Alice",\n}'
      expect(validateJsonWithPlaceholders(withComment)).toEqual({
        valid: true,
        isJsonc: true,
      })

      const withBlockComment = '{\n  /* block */\n  "items": [1, 2,]\n}'
      expect(validateJsonWithPlaceholders(withBlockComment)).toEqual({
        valid: true,
        isJsonc: true,
      })
    })

    it('returns invalid with line and column for malformed JSON', () => {
      const res = validateJsonWithPlaceholders('{\n  "name": "Alice",\n  "age": \n}')
      expect(res.valid).toBe(false)
      expect(res.isJsonc).toBe(false)
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

    it('preserves comments and trailing commas when formatting JSONC', () => {
      const raw = '{\n// comment line\n"a":1,\n"b":[1,2,],\n}'
      const formatted = prettifyJsonWithPlaceholders(raw)
      expect(formatted).toContain('// comment line')
      expect(formatted).toContain('"a": 1,')
      expect(formatted).toContain('2,')
    })

    it('throws when JSON is invalid', () => {
      const raw = '{"broken": '
      expect(() => prettifyJsonWithPlaceholders(raw)).toThrow()
    })
  })

  describe('stripJsoncToJson', () => {
    it('strips line comments, block comments, and nested trailing commas while preserving strings containing //', () => {
      const raw = `{
  // API endpoint comment
  "url": "https://example.com/api // not a comment",
  "note": "trailing comma inside string ,}",
  /* multi-line
     comment */
  "nested": {
    "arr": [1, 2, 3,],
    "flag": true,
  },
}`
      const stripped = stripJsoncToJson(raw)
      const parsed = JSON.parse(stripped)
      expect(parsed).toEqual({
        url: 'https://example.com/api // not a comment',
        note: 'trailing comma inside string ,}',
        nested: {
          arr: [1, 2, 3],
          flag: true,
        },
      })
    })
  })

  describe('normalizeSmartChars', () => {
    it('replaces smart quotes and fullwidth brackets with ASCII equivalents and preserves cursor and scroll position', () => {
      const textarea = document.createElement('textarea')
      textarea.value = '｛\u201Ckey\u201D: \u300C\u2018val\u2019\u300D｝'
      textarea.setSelectionRange(5, 5)
      textarea.scrollTop = 42
      textarea.scrollLeft = 12

      const result = normalizeSmartChars(textarea)
      expect(result).toBe('{"key": [\'val\']}')
      expect(textarea.value).toBe('{"key": [\'val\']}')
      expect(textarea.selectionStart).toBe(5)
      expect(textarea.selectionEnd).toBe(5)
      expect(textarea.scrollTop).toBe(42)
      expect(textarea.scrollLeft).toBe(12)
    })
  })

  describe('tokenizeJsonTextSegment', () => {
    it('tokenizes JSON keys, strings, numbers, booleans, null, punctuation, and treats comments as plain tokens', () => {
      const tokens = tokenizeJsonTextSegment('// comment with "quote": 123\n{"key": "val", "num": 42, "ok": true, "nil": null}')
      const kinds = tokens.filter((t) => t.type !== 'plain').map((t) => `${t.type}:${t.value}`)
      expect(kinds).toContain('key:"key"')
      expect(kinds).toContain('string:"val"')
      expect(kinds).toContain('number:42')
      expect(kinds).toContain('boolean:true')
      expect(kinds).toContain('null:null')
      expect(kinds).not.toContain('key:"quote"')
      expect(kinds).not.toContain('number:123')
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
