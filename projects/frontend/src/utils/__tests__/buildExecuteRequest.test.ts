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

  it('should support xml body with variable resolution and auto Content-Type: application/xml', () => {
    const req = createMockRequest({
      method: 'POST',
      url: 'https://api.test.com/soap',
      body: {
        type: 'xml',
        content: '<user><name>{{username}}</name></user>'
      }
    })
    const vars = new Map([['username', 'Alice']])
    const exec = buildExecuteRequest(req, vars)
    expect(exec.body).toBe('<user><name>Alice</name></user>')
    expect(exec.headers).toContainEqual({
      key: 'Content-Type',
      value: 'application/xml',
      enabled: true
    })
  })

  it('should serialize urlencoded key-value pairs with URL encoding and auto Content-Type: application/x-www-form-urlencoded', () => {
    const req = createMockRequest({
      method: 'POST',
      url: 'https://api.test.com/oauth/token',
      body: {
        type: 'urlencoded',
        content: '',
        urlencoded: [
          { key: 'grant_type', value: 'client_credentials', enabled: true },
          { key: 'client_id', value: '{{cid}}', enabled: true },
          { key: 'scope', value: 'read write', enabled: true },
          { key: 'disabled_key', value: 'ignore', enabled: false }
        ]
      }
    })
    const vars = new Map([['cid', 'app-123']])
    const exec = buildExecuteRequest(req, vars)
    expect(exec.body).toBe('grant_type=client_credentials&client_id=app-123&scope=read%20write')
    expect(exec.headers).toContainEqual({
      key: 'Content-Type',
      value: 'application/x-www-form-urlencoded',
      enabled: true
    })
  })

  it('should populate form_data and body_type="formdata" with variable substitution', () => {
    const req = createMockRequest({
      method: 'POST',
      url: 'https://api.test.com/upload',
      body: {
        type: 'formdata',
        content: '',
        form_data: [
          { key: 'title', value: 'Report {{year}}', enabled: true },
          { key: 'draft', value: 'false', enabled: false }
        ]
      }
    })
    const vars = new Map([['year', '2026']])
    const exec = buildExecuteRequest(req, vars)
    expect(exec.body_type).toBe('formdata')
    expect(exec.form_data).toEqual([
      { key: 'title', value: 'Report 2026', enabled: true }
    ])
  })

  it('should substitute :param path parameters from req.path_params and fallback vars while respecting disabled flags', () => {
    const req = createMockRequest({
      method: 'GET',
      url: '{{base_url}}:8080/v1/:api_key/users/:user_id/disabled/:skip_me?filter=role:admin',
      path_params: [
        { key: 'api_key', value: 'key-{{env_suffix}}', enabled: true },
        { key: 'user_id', value: '', enabled: true },
        { key: 'skip_me', value: 'should-not-use', enabled: false }
      ]
    })
    const vars = new Map([
      ['base_url', 'https://api.test.com'],
      ['env_suffix', 'prod'],
      ['user_id', '42'],
      ['skip_me', 'env-skip']
    ])
    const exec = buildExecuteRequest(req, vars)
    expect(exec.url).toBe('https://api.test.com:8080/v1/key-prod/users/42/disabled/:skip_me?filter=role:admin')
  })

  describe('hideAuth option', () => {
    it('keeps full auth headers and params when hideAuth is false or undefined', () => {
      const bearerReq = createMockRequest({
        auth: { type: 'bearer', bearer: { token: 'secret-token' } },
        headers: [{ key: 'X-Trace', value: '123', enabled: true }]
      })
      expect(buildExecuteRequest(bearerReq, new Map(), [], [], { hideAuth: false }).headers).toEqual([
        { key: 'Authorization', value: 'Bearer secret-token', enabled: true },
        { key: 'X-Trace', value: '123', enabled: true }
      ])
      expect(buildExecuteRequest(bearerReq).headers).toEqual([
        { key: 'Authorization', value: 'Bearer secret-token', enabled: true },
        { key: 'X-Trace', value: '123', enabled: true }
      ])

      const apiKeyQueryReq = createMockRequest({
        url: 'https://api.example.com/items?page=1',
        auth: { type: 'apiKey', apiKey: { key: 'api_key', value: 'sec123', addTo: 'query' } }
      })
      expect(buildExecuteRequest(apiKeyQueryReq, new Map(), [], [], { hideAuth: false }).url).toBe(
        'https://api.example.com/items?page=1&api_key=sec123'
      )
    })

    it('removes Authorization header for Bearer and Basic auth when hideAuth is true while preserving non-auth headers and body', () => {
      const bearerReq = createMockRequest({
        method: 'POST',
        url: 'https://api.example.com/orders',
        auth: { type: 'bearer', bearer: { token: '{{tok}}' } },
        headers: [
          { key: 'Content-Type', value: 'application/json', enabled: true },
          { key: 'X-Trace', value: 'trace-1', enabled: true }
        ],
        body: { type: 'json', content: '{"ok":true}' }
      })
      const vars = new Map([['tok', 'secret-jwt']])

      const execBearer = buildExecuteRequest(bearerReq, vars, [], [], { hideAuth: true })
      expect(execBearer.method).toBe('POST')
      expect(execBearer.url).toBe('https://api.example.com/orders')
      expect(execBearer.body).toBe('{"ok":true}')
      expect(execBearer.headers).toEqual([
        { key: 'Content-Type', value: 'application/json', enabled: true },
        { key: 'X-Trace', value: 'trace-1', enabled: true }
      ])

      const basicReq = createMockRequest({
        auth: { type: 'basic', basic: { username: 'alice', password: 'secret' } },
        headers: [{ key: 'Accept', value: 'application/json', enabled: true }]
      })
      const execBasic = buildExecuteRequest(basicReq, new Map(), [], [], { hideAuth: true })
      expect(execBasic.headers).toEqual([
        { key: 'Accept', value: 'application/json', enabled: true }
      ])
    })

    it('removes API Key header case-insensitively including duplicates in req.headers and inheritedHeaders', () => {
      const req = createMockRequest({
        auth: { type: 'apiKey', apiKey: { key: 'X-API-Key', value: 'auth-secret', addTo: 'header' } },
        headers: [
          { key: 'x-api-key', value: 'manual-secret', enabled: true },
          { key: 'X-Custom', value: 'keep-me', enabled: true }
        ]
      })
      const inherited = [
        { key: 'X-Api-Key', value: 'folder-secret', enabled: true },
        { key: 'X-Folder', value: 'keep-folder', enabled: true }
      ]

      const exec = buildExecuteRequest(req, new Map(), inherited, [], { hideAuth: true })
      expect(exec.headers).toEqual([
        { key: 'X-Folder', value: 'keep-folder', enabled: true },
        { key: 'X-Custom', value: 'keep-me', enabled: true }
      ])
    })

    it('removes API Key query param from params and URL query string while preserving other params, raw encoding, and hash fragment', () => {
      const req = createMockRequest({
        url: 'https://api.example.com/items?api_key=123&filter=id=1&q=hello+world&page=2#sec',
        auth: { type: 'apiKey', apiKey: { key: 'api_key', value: '123', addTo: 'query' } },
        params: [
          { key: 'api_key', value: '123', enabled: true },
          { key: 'page', value: '2', enabled: true },
          { key: 'limit', value: '10', enabled: true }
        ]
      })

      const exec = buildExecuteRequest(req, new Map(), [], [], { hideAuth: true })
      expect(exec.url).toBe('https://api.example.com/items?filter=id=1&q=hello+world&page=2&limit=10#sec')
    })

    it('removes trailing ? cleanly when API Key query param is the only query param in URL', () => {
      const reqWithHash = createMockRequest({
        url: 'https://api.example.com/items?api_key=123#sec',
        auth: { type: 'apiKey', apiKey: { key: 'api_key', value: '123', addTo: 'query' } },
        params: [{ key: 'api_key', value: '123', enabled: true }]
      })
      expect(buildExecuteRequest(reqWithHash, new Map(), [], [], { hideAuth: true }).url).toBe(
        'https://api.example.com/items#sec'
      )

      const reqWithoutHash = createMockRequest({
        url: 'https://api.example.com/items?api_key=123',
        auth: { type: 'apiKey', apiKey: { key: 'api_key', value: '123', addTo: 'query' } }
      })
      expect(buildExecuteRequest(reqWithoutHash, new Map(), [], [], { hideAuth: true }).url).toBe(
        'https://api.example.com/items'
      )

      const reqEncodedKey = createMockRequest({
        url: 'https://api.example.com/items?%20api_key=123&ok=1',
        auth: { type: 'apiKey', apiKey: { key: '{{auth_param}}', value: '123', addTo: 'query' } }
      })
      const vars = new Map([['auth_param', 'api_key']])
      expect(buildExecuteRequest(reqEncodedKey, vars, [], [], { hideAuth: true }).url).toBe(
        'https://api.example.com/items?ok=1'
      )
    })

    it('resolves inherited auth from folder and collection (including auth_envs) and hides corresponding auth artifacts', () => {
      const req = createMockRequest({
        url: 'https://api.example.com/data?col_key=secret&page=1',
        auth: { type: 'inherit' },
        headers: [{ key: 'X-Req', value: 'ok', enabled: true }]
      })
      const pathNodes: TreeNode[] = [
        {
          id: 'f1',
          name: 'Folder',
          type: 'folder',
          path: '/f1',
          auth: { type: 'inherit' },
          created_at: ''
        }
      ]
      const collection = {
        id: 'c1',
        name: 'Coll',
        auth: { type: 'bearer' as const, bearer: { token: 'global-tok' } },
        auth_envs: {
          'env-prod': {
            type: 'apiKey' as const,
            apiKey: { key: 'col_key', value: 'secret', addTo: 'query' as const }
          }
        }
      }

      const execQuery = buildExecuteRequest(req, new Map(), [], pathNodes, {
        activeEnvId: 'env-prod',
        collection,
        hideAuth: true
      })
      expect(execQuery.url).toBe('https://api.example.com/data?page=1')
      expect(execQuery.headers).toEqual([{ key: 'X-Req', value: 'ok', enabled: true }])

      const folderApiKeyNodes: TreeNode[] = [
        {
          id: 'f1',
          name: 'Folder',
          type: 'folder',
          path: '/f1',
          auth: { type: 'apiKey', apiKey: { key: 'X-Folder-Auth', value: 'sec', addTo: 'header' } },
          created_at: ''
        }
      ]
      const execFolder = buildExecuteRequest(
        createMockRequest({
          auth: { type: 'inherit' },
          headers: [
            { key: 'x-folder-auth', value: 'sec', enabled: true },
            { key: 'X-Keep', value: 'yes', enabled: true }
          ]
        }),
        new Map(),
        [],
        folderApiKeyNodes,
        { hideAuth: true }
      )
      expect(execFolder.headers).toEqual([{ key: 'X-Keep', value: 'yes', enabled: true }])
    })

    it('strips manual and inherited Authorization and Proxy-Authorization headers regardless of casing even when auth.type is none', () => {
      const req = createMockRequest({
        auth: { type: 'none' },
        headers: [
          { key: 'authorization', value: 'Bearer manual-token', enabled: true },
          { key: 'PROXY-AUTHORIZATION', value: 'Basic manual-proxy', enabled: true },
          { key: 'X-Safe', value: 'kept', enabled: true }
        ]
      })
      const inherited = [
        { key: 'Authorization', value: 'Bearer folder-token', enabled: true },
        { key: 'Proxy-Authorization', value: 'Basic folder-proxy', enabled: true },
        { key: 'X-Inherited', value: 'kept', enabled: true }
      ]

      const exec = buildExecuteRequest(req, new Map(), inherited, [], { hideAuth: true })
      expect(exec.headers).toEqual([
        { key: 'X-Inherited', value: 'kept', enabled: true },
        { key: 'X-Safe', value: 'kept', enabled: true }
      ])
    })

    it('removes duplicate and valueless API Key query params and {{var}}/whitespace param keys in req.params', () => {
      const dupUrlReq = createMockRequest({
        url: 'https://api.example.com/items?api_key=1&page=2&api_key=2',
        auth: { type: 'apiKey', apiKey: { key: 'api_key', value: '1', addTo: 'query' } }
      })
      expect(buildExecuteRequest(dupUrlReq, new Map(), [], [], { hideAuth: true }).url).toBe(
        'https://api.example.com/items?page=2'
      )

      const valuelessReq = createMockRequest({
        url: 'https://api.example.com/items?api_key&page=2',
        auth: { type: 'apiKey', apiKey: { key: 'api_key', value: '', addTo: 'query' } }
      })
      expect(buildExecuteRequest(valuelessReq, new Map(), [], [], { hideAuth: true }).url).toBe(
        'https://api.example.com/items?page=2'
      )

      const varParamsReq = createMockRequest({
        url: 'https://api.example.com/items',
        auth: { type: 'apiKey', apiKey: { key: 'api_key', value: 'secret', addTo: 'query' } },
        params: [
          { key: ' {{auth_param}} ', value: '123', enabled: true },
          { key: ' api_key ', value: '456', enabled: true },
          { key: 'keep', value: 'yes', enabled: true }
        ]
      })
      const vars = new Map([['auth_param', 'api_key']])
      expect(buildExecuteRequest(varParamsReq, vars, [], [], { hideAuth: true }).url).toBe(
        'https://api.example.com/items?keep=yes'
      )
    })

    it('preserves formdata and urlencoded bodies and auto headers when hideAuth is true', () => {
      const formReq = createMockRequest({
        method: 'POST',
        url: 'https://api.example.com/upload',
        auth: { type: 'bearer', bearer: { token: 'secret-token' } },
        headers: [{ key: 'X-Trace', value: 'f-1', enabled: true }],
        body: {
          type: 'formdata',
          content: '',
          form_data: [{ key: 'file_name', value: 'report.pdf', enabled: true }]
        }
      })
      const formExec = buildExecuteRequest(formReq, new Map(), [], [], { hideAuth: true })
      expect(formExec.body_type).toBe('formdata')
      expect(formExec.form_data).toEqual([{ key: 'file_name', value: 'report.pdf', enabled: true }])
      expect(formExec.headers).toEqual([{ key: 'X-Trace', value: 'f-1', enabled: true }])

      const urlencodedReq = createMockRequest({
        method: 'POST',
        url: 'https://api.example.com/token',
        auth: { type: 'apiKey', apiKey: { key: 'X-API-Key', value: 'secret-key', addTo: 'header' } },
        headers: [{ key: 'X-Client', value: 'cli', enabled: true }],
        body: {
          type: 'urlencoded',
          content: '',
          urlencoded: [{ key: 'grant_type', value: 'client_credentials', enabled: true }]
        }
      })
      const urlencodedExec = buildExecuteRequest(urlencodedReq, new Map(), [], [], { hideAuth: true })
      expect(urlencodedExec.body).toBe('grant_type=client_credentials')
      expect(urlencodedExec.headers).toEqual([
        { key: 'Content-Type', value: 'application/x-www-form-urlencoded', enabled: true },
        { key: 'X-Client', value: 'cli', enabled: true }
      ])
    })
  })
})


