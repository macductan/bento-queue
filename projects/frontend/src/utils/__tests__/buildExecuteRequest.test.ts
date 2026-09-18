import { describe, it, expect } from 'vitest'
import { buildExecuteRequest } from '../buildExecuteRequest'
import type { Request } from '../../stores/requestStore'

describe('buildExecuteRequest', () => {
  const createMockRequest = (overrides: Partial<Request> = {}): Request => ({
    id: '123',
    name: 'test',
    method: 'GET',
    url: 'https://example.com',
    headers: [],
    params: [],
    body: { type: 'none', content: '' },
    created_at: '',
    updated_at: '',
    ...overrides
  })

  it('should build a simple request', () => {
    const req = createMockRequest()
    const exec = buildExecuteRequest(req)
    expect(exec.method).toBe('GET')
    expect(exec.url).toBe('https://example.com')
    expect(exec.headers).toEqual([])
    expect(exec.body).toBe('')
  })

  it('should filter disabled or empty headers', () => {
    const req = createMockRequest({
      headers: [
        { key: 'Accept', value: 'application/json', enabled: true },
        { key: 'Authorization', value: 'Bearer token', enabled: false },
        { key: '', value: 'something', enabled: true },
        { key: '  ', value: 'something else', enabled: true }
      ]
    })
    const exec = buildExecuteRequest(req)
    expect(exec.headers).toEqual([
      { key: 'Accept', value: 'application/json', enabled: true }
    ])
  })

  it('should append query params correctly', () => {
    const req = createMockRequest({
      url: 'https://api.test.com/users',
      params: [
        { key: 'sort', value: 'desc', enabled: true },
        { key: 'limit', value: '10', enabled: true },
        { key: 'disabled', value: 'true', enabled: false },
        { key: '', value: 'empty', enabled: true }
      ]
    })
    const exec = buildExecuteRequest(req)
    expect(exec.url).toBe('https://api.test.com/users?sort=desc&limit=10')
  })

  it('should append query params to url with existing query', () => {
    const req = createMockRequest({
      url: 'https://api.test.com/users?page=1',
      params: [{ key: 'limit', value: '10', enabled: true }]
    })
    const exec = buildExecuteRequest(req)
    expect(exec.url).toBe('https://api.test.com/users?page=1&limit=10')
  })

  it('should trim trailing ? before appending query params', () => {
    const req = createMockRequest({
      url: 'https://api.com/?',
      params: [{ key: 'page', value: '1', enabled: true }]
    })
    const exec = buildExecuteRequest(req)
    expect(exec.url).toBe('https://api.com/?page=1')
  })

  it('should trim trailing & before appending query params', () => {
    const req = createMockRequest({
      url: 'https://api.com/?a=1&',
      params: [{ key: 'b', value: '2', enabled: true }]
    })
    const exec = buildExecuteRequest(req)
    expect(exec.url).toBe('https://api.com/?a=1&b=2')
  })

  it('should preserve legitimate trailing ? from query values', () => {
    const req = createMockRequest({
      url: 'https://api.com/search?q=who?',
      params: [{ key: 'page', value: '1', enabled: true }]
    })
    const exec = buildExecuteRequest(req)
    expect(exec.url).toBe('https://api.com/search?q=who?&page=1')
  })

  it('should handle fragments in url', () => {
    const req = createMockRequest({
      url: 'https://api.test.com/users#section1',
      params: [{ key: 'limit', value: '10', enabled: true }]
    })
    const exec = buildExecuteRequest(req)
    expect(exec.url).toBe('https://api.test.com/users?limit=10#section1')
  })

  it('should trim trailing ? before appending query params when fragment is present', () => {
    const req = createMockRequest({
      url: 'https://api.test.com/users?#section1',
      params: [{ key: 'limit', value: '10', enabled: true }]
    })
    const exec = buildExecuteRequest(req)
    expect(exec.url).toBe('https://api.test.com/users?limit=10#section1')
  })

  it('should include json body content', () => {
    const req = createMockRequest({
      method: 'POST',
      body: { type: 'json', content: '{"foo":"bar"}' }
    })
    const exec = buildExecuteRequest(req)
    expect(exec.body).toBe('{"foo":"bar"}')
  })

  it('should include text body content', () => {
    const req = createMockRequest({
      method: 'POST',
      body: { type: 'text', content: 'hello world' }
    })
    const exec = buildExecuteRequest(req)
    expect(exec.body).toBe('hello world')
  })

  it('should resolve variables in URL, headers, params, and body', () => {
    const req = createMockRequest({
      method: 'POST',
      url: '{{host}}/api/{{path}}',
      headers: [
        { key: 'Authorization', value: 'Bearer {{token}}', enabled: true },
        { key: '{{headerKey}}', value: 'test', enabled: true } // Header key should NOT be resolved
      ],
      params: [
        { key: '{{paramKey}}', value: '{{paramValue}}', enabled: true }
      ],
      body: {
        type: 'json',
        content: '{"msg": "{{message}}"}'
      }
    });

    const vars = new Map([
      ['host', 'https://example.com'],
      ['path', 'users'],
      ['token', '12345'],
      ['headerKey', 'X-Custom'], // Should not replace key
      ['paramKey', 'search'],
      ['paramValue', 'test query'],
      ['message', 'hello world']
    ]);

    const execReq = buildExecuteRequest(req, vars);

    expect(execReq.url).toBe('https://example.com/api/users?search=test%20query');
    expect(execReq.headers).toEqual([
      { key: 'Authorization', value: 'Bearer 12345', enabled: true },
      { key: '{{headerKey}}', value: 'test', enabled: true }
    ]);
    expect(execReq.body).toBe('{"msg": "hello world"}');
  })
})
