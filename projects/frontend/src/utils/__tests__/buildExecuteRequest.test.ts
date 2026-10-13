import { describe, it, expect } from 'vitest'
import { buildExecuteRequest } from '../buildExecuteRequest'
import type { Request } from '../../stores/requestStore'
import type { TreeNode } from '../../stores/collectionStore'

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
      { key: 'Content-Type', value: 'application/json', enabled: true },
      { key: 'Authorization', value: 'Bearer 12345', enabled: true },
      { key: '{{headerKey}}', value: 'test', enabled: true }
    ]);
    expect(execReq.body).toBe('{"msg": "hello world"}');
  })

  it('should merge inherited headers and substitute variables in their values', () => {
    const req = createMockRequest({
      method: 'GET',
      url: 'https://example.com/api',
      headers: [
        { key: 'X-Child-Header', value: 'child-{{val}}', enabled: true }
      ]
    })
    const inherited = [
      { key: 'X-Folder-Header', value: 'folder-{{val}}', enabled: true },
      { key: 'X-Disabled', value: 'skip', enabled: false }
    ]
    const vars = new Map([['val', 'resolved']])

    const execReq = buildExecuteRequest(req, vars, inherited)
    expect(execReq.headers).toEqual([
      { key: 'X-Folder-Header', value: 'folder-resolved', enabled: true },
      { key: 'X-Child-Header', value: 'child-resolved', enabled: true }
    ])
  })

  it('should allow request header to override inherited header case-insensitively', () => {
    const req = createMockRequest({
      method: 'GET',
      url: 'https://example.com/api',
      headers: [
        { key: 'authorization', value: 'Bearer child-token', enabled: true }
      ]
    })
    const inherited = [
      { key: 'Authorization', value: 'Bearer parent-token', enabled: true }
    ]

    const execReq = buildExecuteRequest(req, new Map(), inherited)
    expect(execReq.headers).toEqual([
      { key: 'authorization', value: 'Bearer child-token', enabled: true }
    ])
  })

  it('should auto-attach Content-Type: application/json when body is json and no Content-Type exists', () => {
    const req = createMockRequest({
      method: 'POST',
      url: 'https://example.com/api',
      headers: [],
      body: { type: 'json', content: '{"ok":true}' }
    })

    const execReq = buildExecuteRequest(req)
    expect(execReq.headers).toEqual([
      { key: 'Content-Type', value: 'application/json', enabled: true }
    ])
  })

  it('should not overwrite custom Content-Type when body is json', () => {
    const req = createMockRequest({
      method: 'POST',
      url: 'https://example.com/api',
      headers: [
        { key: 'Content-Type', value: 'application/merge-patch+json', enabled: true }
      ],
      body: { type: 'json', content: '{"ok":true}' }
    })

    const execReq = buildExecuteRequest(req)
    expect(execReq.headers).toEqual([
      { key: 'Content-Type', value: 'application/merge-patch+json', enabled: true }
    ])
  })

  it('should suppress auto Content-Type when explicitly disabled in request headers', () => {
    const req = createMockRequest({
      method: 'POST',
      url: 'https://example.com/api',
      headers: [
        { key: 'Content-Type', value: 'application/json', enabled: false }
      ],
      body: { type: 'json', content: '{"ok":true}' }
    })

    const execReq = buildExecuteRequest(req)
    expect(execReq.headers).toEqual([])
  })

  it('should inherit Bearer auth from parent folder in pathNodes', () => {
    const req = createMockRequest({
      auth: { type: 'inherit' }
    })
    const pathNodes: TreeNode[] = [
      {
        id: 'f1',
        name: 'Folder',
        type: 'folder',
        path: '/f1',
        auth: { type: 'bearer', bearer: { token: 'folder-secret' } },
        created_at: ''
      }
    ]

    const exec = buildExecuteRequest(req, new Map(), [], pathNodes)
    expect(exec.headers).toContainEqual({
      key: 'Authorization',
      value: 'Bearer folder-secret',
      enabled: true
    })
  })

  it('should override parent auth when request defines own Bearer auth', () => {
    const req = createMockRequest({
      auth: { type: 'bearer', bearer: { token: 'req-secret' } }
    })
    const pathNodes: TreeNode[] = [
      {
        id: 'f1',
        name: 'Folder',
        type: 'folder',
        path: '/f1',
        auth: { type: 'bearer', bearer: { token: 'folder-secret' } },
        created_at: ''
      }
    ]

    const exec = buildExecuteRequest(req, new Map(), [], pathNodes)
    expect(exec.headers).toEqual([
      { key: 'Authorization', value: 'Bearer req-secret', enabled: true }
    ])
  })

  it('should send no auth headers when request sets auth to none even if parent has auth', () => {
    const req = createMockRequest({
      auth: { type: 'none' }
    })
    const pathNodes: TreeNode[] = [
      {
        id: 'f1',
        name: 'Folder',
        type: 'folder',
        path: '/f1',
        auth: { type: 'bearer', bearer: { token: 'folder-secret' } },
        created_at: ''
      }
    ]

    const exec = buildExecuteRequest(req, new Map(), [], pathNodes)
    expect(exec.headers).toEqual([])
  })

  it('should support Basic auth with variable substitution', () => {
    const req = createMockRequest({
      auth: { type: 'basic', basic: { username: '{{user}}', password: '{{pass}}' } }
    })
    const vars = new Map([
      ['user', 'alice'],
      ['pass', '123456']
    ])

    const exec = buildExecuteRequest(req, vars)
    expect(exec.headers).toEqual([
      { key: 'Authorization', value: 'Basic ' + btoa('alice:123456'), enabled: true }
    ])
  })

  it('should support API Key in header', () => {
    const req = createMockRequest({
      auth: { type: 'apiKey', apiKey: { key: 'X-API-KEY', value: 'my-key', addTo: 'header' } }
    })

    const exec = buildExecuteRequest(req)
    expect(exec.headers).toEqual([
      { key: 'X-API-KEY', value: 'my-key', enabled: true }
    ])
  })

  it('should support API Key in query parameter', () => {
    const req = createMockRequest({
      url: 'https://api.example.com/data',
      auth: { type: 'apiKey', apiKey: { key: 'token', value: 'secret', addTo: 'query' } }
    })

    const exec = buildExecuteRequest(req)
    expect(exec.url).toBe('https://api.example.com/data?token=secret')
  })

  it('should allow request headers to override auth-generated Authorization', () => {
    const req = createMockRequest({
      auth: { type: 'bearer', bearer: { token: 'auth-token' } },
      headers: [
        { key: 'Authorization', value: 'CustomManualToken', enabled: true }
      ]
    })

    const exec = buildExecuteRequest(req)
    expect(exec.headers).toEqual([
      { key: 'Authorization', value: 'CustomManualToken', enabled: true }
    ])
  })

  it('should allow auth headers to override folder inherited headers', () => {
    const req = createMockRequest({
      auth: { type: 'bearer', bearer: { token: 'auth-token-effective' } }
    })
    const inherited = [
      { key: 'Authorization', value: 'Bearer parent-folder-old', enabled: true }
    ]
    const exec = buildExecuteRequest(req, new Map(), inherited)
    expect(exec.headers).toEqual([
      { key: 'Authorization', value: 'Bearer auth-token-effective', enabled: true }
    ])
  })

  it('should allow request query params to override auth apiKey query param', () => {
    const req = createMockRequest({
      url: 'https://example.com/api',
      auth: { type: 'apiKey', apiKey: { key: 'token', value: 'auth-secret', addTo: 'query' } },
      params: [
        { key: 'token', value: 'manual-override', enabled: true }
      ]
    })
    const exec = buildExecuteRequest(req)
    expect(exec.url).toBe('https://example.com/api?token=manual-override')
  })

  it('should append auth apiKey query param cleanly to url with existing query', () => {
    const req = createMockRequest({
      url: 'https://example.com/api?existing=1',
      auth: { type: 'apiKey', apiKey: { key: 'token', value: 'secret', addTo: 'query' } }
    })
    const exec = buildExecuteRequest(req)
    expect(exec.url).toBe('https://example.com/api?existing=1&token=secret')
  })

  it('should generate no auth headers when request is inherit and pathNodes is empty', () => {
    const req = createMockRequest({ auth: { type: 'inherit' } })
    const exec = buildExecuteRequest(req, new Map(), [], [])
    expect(exec.headers.some(h => h.key.toLowerCase() === 'authorization')).toBe(false)
  })

  it('should suppress auth query param when request defines it disabled', () => {
    const req = createMockRequest({
      url: 'https://example.com/api',
      auth: { type: 'apiKey', apiKey: { key: 'token', value: 'auth-secret', addTo: 'query' } },
      params: [
        { key: 'token', value: '', enabled: false }
      ]
    })
    const exec = buildExecuteRequest(req)
    expect(exec.url).toBe('https://example.com/api')
  })

  it('should avoid secondary variable expansion on auth token containing literal variable syntax', () => {
    const vars = new Map([
      ['token', 'literal_{{nested}}'],
      ['nested', 'corrupted']
    ])
    const req = createMockRequest({
      auth: { type: 'bearer', bearer: { token: '{{token}}' } }
    })
    const exec = buildExecuteRequest(req, vars)
    expect(exec.headers).toEqual([
      { key: 'Authorization', value: 'Bearer literal_{{nested}}', enabled: true }
    ])
  })

  it('should inherit Basic auth from parent folder in pathNodes', () => {
    const pathNodes: TreeNode[] = [
      {
        id: 'f1',
        name: 'Folder',
        type: 'folder',
        path: '/f1',
        auth: { type: 'basic', basic: { username: 'user1', password: 'pw1' } },
        created_at: ''
      }
    ]
    const req = createMockRequest({ auth: { type: 'inherit' } })
    const exec = buildExecuteRequest(req, new Map(), [], pathNodes)
    expect(exec.headers).toContainEqual({
      key: 'Authorization',
      value: 'Basic ' + btoa('user1:pw1'),
      enabled: true
    })
  })

  it('should inherit API Key in header from parent folder in pathNodes', () => {
    const pathNodes: TreeNode[] = [
      {
        id: 'f1',
        name: 'Folder',
        type: 'folder',
        path: '/f1',
        auth: { type: 'apiKey', apiKey: { key: 'X-Folder-Key', value: 'secret1', addTo: 'header' } },
        created_at: ''
      }
    ]
    const req = createMockRequest({ auth: { type: 'inherit' } })
    const exec = buildExecuteRequest(req, new Map(), [], pathNodes)
    expect(exec.headers).toContainEqual({
      key: 'X-Folder-Key',
      value: 'secret1',
      enabled: true
    })
  })

  it('should not duplicate query params when url already has query params matching params', () => {
    const req = createMockRequest({
      url: 'https://api.test.com/users?sort=desc&limit=10',
      params: [
        { key: 'sort', value: 'desc', enabled: true },
        { key: 'limit', value: '10', enabled: true }
      ]
    })
    const exec = buildExecuteRequest(req)
    expect(exec.url).toBe('https://api.test.com/users?sort=desc&limit=10')
  })

  it('should append only missing query params when url has partial params', () => {
    const req = createMockRequest({
      url: 'https://api.test.com/users?sort=desc',
      params: [
        { key: 'sort', value: 'desc', enabled: true },
        { key: 'limit', value: '10', enabled: true }
      ]
    })
    const exec = buildExecuteRequest(req)
    expect(exec.url).toBe('https://api.test.com/users?sort=desc&limit=10')
  })

  it('should format flag query params with empty value without = and deduplicate cleanly', () => {
    const req = createMockRequest({
      url: 'https://api.test.com/users?pretty',
      params: [
        { key: 'pretty', value: '', enabled: true },
        { key: 'debug', value: '', enabled: true }
      ]
    })
    const exec = buildExecuteRequest(req)
    expect(exec.url).toBe('https://api.test.com/users?pretty&debug')
  })

  it('should not cause delimiter collisions when query parameter keys or values contain =', () => {
    const req = createMockRequest({
      url: 'https://api.test.com/search?filter=id=1',
      params: [
        { key: 'filter=id', value: '1', enabled: true },
        { key: 'filter', value: 'id=1', enabled: true }
      ]
    })
    const exec = buildExecuteRequest(req)
    expect(exec.url).toBe('https://api.test.com/search?filter=id=1&filter%3Did=1')
  })

  it('should preserve hash fragment correctly when appending query params', () => {
    const req = createMockRequest({
      url: 'https://api.test.com/users#section',
      params: [
        { key: 'page', value: '1', enabled: true }
      ]
    })
    const exec = buildExecuteRequest(req)
    expect(exec.url).toBe('https://api.test.com/users?page=1#section')
  })
})

