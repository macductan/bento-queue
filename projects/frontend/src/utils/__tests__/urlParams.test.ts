import { describe, it, expect } from 'vitest'
import {
  splitPreservingVars,
  encodeQueryComponent,
  decodeQueryComponent,
  parseQueryParams,
  parseUrl,
  buildQueryString,
  updateUrlWithParams,
  areParamsEqual,
  reconcileParamsFromUrl,
  findPathParamTokens,
  extractPathParamKeys,
  reconcilePathParamsFromUrl,
  resolvePathParamsInUrl
} from '../urlParams'
import type { KVPair } from '../../stores/requestStore'

describe('urlParams utility', () => {
  describe('splitPreservingVars', () => {
    it('should split by delimiter outside {{...}}', () => {
      const parts = splitPreservingVars('a=1&b=2&c=3', '&')
      expect(parts).toEqual(['a=1', 'b=2', 'c=3'])
    })

    it('should not split delimiter inside {{...}}', () => {
      const parts = splitPreservingVars('a={{b&c}}&d=4', '&')
      expect(parts).toEqual(['a={{b&c}}', 'd=4'])
    })

    it('should respect split limit', () => {
      const parts = splitPreservingVars('key=value=more', '=', 2)
      expect(parts).toEqual(['key', 'value=more'])
    })

    it('should not split on limit when = is inside {{...}}', () => {
      const parts = splitPreservingVars('{{k=1}}=value', '=', 2)
      expect(parts).toEqual(['{{k=1}}', 'value'])
    })
  })

  describe('encodeQueryComponent & decodeQueryComponent', () => {
    it('should preserve {{variable}} syntax during encode', () => {
      expect(encodeQueryComponent('{{token}}')).toBe('{{token}}')
      expect(encodeQueryComponent('user_{{id}}')).toBe('user_{{id}}')
      expect(encodeQueryComponent('{{my_key}}')).toBe('{{my_key}}')
    })

    it('should encode spaces and special characters outside {{...}}', () => {
      expect(encodeQueryComponent('hello world')).toBe('hello%20world')
      expect(encodeQueryComponent('{{tag}} & more')).toBe('{{tag}}%20%26%20more')
    })

    it('should decode percent-encoded chars and preserve literal + and variables', () => {
      expect(decodeQueryComponent('hello%20world')).toBe('hello world')
      expect(decodeQueryComponent('hello+world')).toBe('hello+world')
      expect(decodeQueryComponent('token=a%2Bb==')).toBe('token=a+b==')
      expect(decodeQueryComponent('{{token}}')).toBe('{{token}}')
      expect(decodeQueryComponent('{{tag}}%20%26%20more')).toBe('{{tag}} & more')
    })

    it('should safely handle malformed percent encoding without throwing', () => {
      expect(decodeQueryComponent('100%_discount')).toBe('100%_discount')
    })
  })

  describe('parseQueryParams', () => {
    it('should parse simple query string with or without leading ?', () => {
      const p1 = parseQueryParams('?a=1&b=2')
      expect(p1).toEqual([
        { key: 'a', value: '1', enabled: true },
        { key: 'b', value: '2', enabled: true }
      ])

      const p2 = parseQueryParams('a=1&b=2')
      expect(p2).toEqual([
        { key: 'a', value: '1', enabled: true },
        { key: 'b', value: '2', enabled: true }
      ])
    })

    it('should parse query params without value as empty string', () => {
      const p = parseQueryParams('?flag&key=val')
      expect(p).toEqual([
        { key: 'flag', value: '', enabled: true },
        { key: 'key', value: 'val', enabled: true }
      ])
    })

    it('should parse query params with empty value after =', () => {
      const p = parseQueryParams('?flag=&key=val')
      expect(p).toEqual([
        { key: 'flag', value: '', enabled: true },
        { key: 'key', value: 'val', enabled: true }
      ])
    })

    it('should support duplicate keys in query string', () => {
      const p = parseQueryParams('?tag=news&tag=sports')
      expect(p).toEqual([
        { key: 'tag', value: 'news', enabled: true },
        { key: 'tag', value: 'sports', enabled: true }
      ])
    })

    it('should preserve variables in keys and values', () => {
      const p = parseQueryParams('?{{param_key}}={{param_val}}&normal=1')
      expect(p).toEqual([
        { key: '{{param_key}}', value: '{{param_val}}', enabled: true },
        { key: 'normal', value: '1', enabled: true }
      ])
    })

    it('should ignore empty segments from extra &', () => {
      const p = parseQueryParams('?&&a=1&&b=2&&')
      expect(p).toEqual([
        { key: 'a', value: '1', enabled: true },
        { key: 'b', value: '2', enabled: true }
      ])
    })
  })

  describe('parseUrl', () => {
    it('should parse full URL into baseUrl, params, and hash', () => {
      const parsed = parseUrl('https://example.com/api/users?page=1&limit=10#section1')
      expect(parsed.baseUrl).toBe('https://example.com/api/users')
      expect(parsed.hash).toBe('#section1')
      expect(parsed.params).toEqual([
        { key: 'page', value: '1', enabled: true },
        { key: 'limit', value: '10', enabled: true }
      ])
    })

    it('should handle URL with port and path', () => {
      const parsed = parseUrl('http://localhost:8080/v1/search?q=test')
      expect(parsed.baseUrl).toBe('http://localhost:8080/v1/search')
      expect(parsed.hash).toBe('')
      expect(parsed.params).toEqual([
        { key: 'q', value: 'test', enabled: true }
      ])
    })

    it('should handle URL with variables in baseUrl and hash', () => {
      const parsed = parseUrl('{{host}}:{{port}}/{{path}}?token={{auth}}#{{frag}}')
      expect(parsed.baseUrl).toBe('{{host}}:{{port}}/{{path}}')
      expect(parsed.hash).toBe('#{{frag}}')
      expect(parsed.params).toEqual([
        { key: 'token', value: '{{auth}}', enabled: true }
      ])
    })

    it('should return empty params for URL with no query string', () => {
      const parsed = parseUrl('https://example.com/api')
      expect(parsed.baseUrl).toBe('https://example.com/api')
      expect(parsed.hash).toBe('')
      expect(parsed.params).toEqual([])
    })

    it('should handle empty or null string gracefully', () => {
      expect(parseUrl('')).toEqual({ baseUrl: '', params: [], hash: '' })
    })
  })

  describe('buildQueryString', () => {
    it('should build query string filtering disabled and empty key items', () => {
      const params: KVPair[] = [
        { key: 'sort', value: 'desc', enabled: true },
        { key: 'hidden', value: '1', enabled: false },
        { key: '', value: 'ignored', enabled: true },
        { key: 'limit', value: '20', enabled: true }
      ]
      expect(buildQueryString(params)).toBe('sort=desc&limit=20')
    })

    it('should serialize empty value as key without =', () => {
      const params: KVPair[] = [
        { key: 'flag', value: '', enabled: true },
        { key: 'key', value: 'val', enabled: true }
      ]
      expect(buildQueryString(params)).toBe('flag&key=val')
    })

    it('should preserve variables without escaping to %7B%7B', () => {
      const params: KVPair[] = [
        { key: '{{custom_key}}', value: '{{custom_val}}', enabled: true }
      ]
      expect(buildQueryString(params)).toBe('{{custom_key}}={{custom_val}}')
    })
  })

  describe('updateUrlWithParams', () => {
    it('should update query string while preserving baseUrl, port, and hash', () => {
      const current = 'http://localhost:3000/api?old=1#target'
      const params: KVPair[] = [
        { key: 'newKey', value: 'newVal', enabled: true }
      ]
      expect(updateUrlWithParams(current, params)).toBe('http://localhost:3000/api?newKey=newVal#target')
    })

    it('should remove query string and ? when all params are disabled or empty', () => {
      const current = 'https://example.com/api?old=1#target'
      const params: KVPair[] = [
        { key: 'old', value: '1', enabled: false }
      ]
      expect(updateUrlWithParams(current, params)).toBe('https://example.com/api#target')
    })

    it('should add query string to URL that had none', () => {
      const current = 'https://example.com/api#section'
      const params: KVPair[] = [
        { key: 'q', value: 'test', enabled: true }
      ]
      expect(updateUrlWithParams(current, params)).toBe('https://example.com/api?q=test#section')
    })
  })

  describe('areParamsEqual', () => {
    it('should correctly identify identical and different params', () => {
      const a: KVPair[] = [{ key: 'k', value: 'v', enabled: true }]
      const b: KVPair[] = [{ key: 'k', value: 'v', enabled: true }]
      const c: KVPair[] = [{ key: 'k', value: 'v', enabled: false }]
      const d: KVPair[] = [{ key: 'k', value: 'diff', enabled: true }]

      expect(areParamsEqual(a, b)).toBe(true)
      expect(areParamsEqual(a, c)).toBe(false)
      expect(areParamsEqual(a, d)).toBe(false)
      expect(areParamsEqual(a, [])).toBe(false)
    })
  })

  describe('reconcileParamsFromUrl', () => {
    it('should adopt parsed params when current store params are empty', () => {
      const reconciled = reconcileParamsFromUrl('https://api.com?a=1&b=2', [])
      expect(reconciled).toEqual([
        { key: 'a', value: '1', enabled: true },
        { key: 'b', value: '2', enabled: true }
      ])
    })

    it('should preserve disabled params when url is updated', () => {
      const current: KVPair[] = [
        { key: 'a', value: '1', enabled: true },
        { key: 'debug', value: 'true', enabled: false },
        { key: 'b', value: '2', enabled: true }
      ]
      const reconciled = reconcileParamsFromUrl('https://api.com?a=10&b=20', current)
      expect(reconciled).toEqual([
        { key: 'a', value: '10', enabled: true },
        { key: 'debug', value: 'true', enabled: false },
        { key: 'b', value: '20', enabled: true }
      ])
    })

    it('should preserve disabled params even when key matches an active parameter in URL', () => {
      const current: KVPair[] = [
        { key: 'tag', value: 'news', enabled: true },
        { key: 'tag', value: 'sports', enabled: false }
      ]
      const reconciled = reconcileParamsFromUrl('https://api.com?tag=tech', current)
      expect(reconciled).toEqual([
        { key: 'tag', value: 'tech', enabled: true },
        { key: 'tag', value: 'sports', enabled: false }
      ])
    })

    it('should preserve custom properties like _isAuto on existing params during reconciliation', () => {
      const current: KVPair[] = [
        { key: 'a', value: '1', enabled: true, _isAuto: true }
      ]
      const reconciled = reconcileParamsFromUrl('https://api.com?a=2', current)
      expect(reconciled[0]).toEqual({
        key: 'a',
        value: '2',
        enabled: true,
        _isAuto: true
      })
    })

    it('should keep disabled params when all query params are deleted from URL', () => {
      const current: KVPair[] = [
        { key: 'a', value: '1', enabled: true },
        { key: 'debug', value: 'true', enabled: false }
      ]
      const reconciled = reconcileParamsFromUrl('https://api.com/items', current)
      expect(reconciled).toEqual([
        { key: 'debug', value: 'true', enabled: false }
      ])
    })
  })

  describe('path parameter utilities (:param)', () => {
    it('extracts :param tokens only from pathname, ignoring scheme, authority user:pass@host:port, query ?k=:v, and #hash:v', () => {
      expect(
        extractPathParamKeys(
          'https://user:pass@api.example.com:8443/v1/:api_key/items/:item_id?filter=status:active#sec:intro'
        )
      ).toEqual(['api_key', 'item_id'])

      expect(
        extractPathParamKeys('{{base_url}}:8080/v1/:org_id/repos/:repo_id?tag=v1:latest')
      ).toEqual(['org_id', 'repo_id'])

      expect(extractPathParamKeys('user:pass@localhost:8080/users/:uid')).toEqual(['uid'])
    })

    it('reconciles path_params preserving existing values, enabled state, and descriptions', () => {
      const current: KVPair[] = [
        { key: 'api_key', value: 'sec-123', enabled: true, description: 'API Key' },
        { key: 'removed', value: 'old', enabled: true }
      ]
      const next = reconcilePathParamsFromUrl(
        'https://api.example.com/:api_key/orders/:order_id',
        current
      )
      expect(next).toEqual([
        { key: 'api_key', value: 'sec-123', enabled: true, description: 'API Key' },
        { key: 'order_id', value: '', enabled: true }
      ])
    })

    it('resolves :param tokens in URL pathname without touching query or hash colons', () => {
      const resolved = resolvePathParamsInUrl(
        'https://api.example.com/:api_key/items/:id?q=type:book#part:one',
        [{ key: 'api_key', value: 'k-999', enabled: true }],
        new Map([['id', '77']])
      )
      expect(resolved).toBe('https://api.example.com/k-999/items/77?q=type:book#part:one')
    })
  })
})
