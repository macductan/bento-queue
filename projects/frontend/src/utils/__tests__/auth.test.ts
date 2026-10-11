import { describe, it, expect } from 'vitest'
import { resolveEffectiveAuth, getAuthArtifacts, toBase64 } from '../auth'
import type { TreeNode, AuthConfig } from '../../stores/collectionStore'

describe('auth.ts', () => {
  describe('toBase64', () => {
    it('encodes ASCII string properly', () => {
      expect(toBase64('admin:secret')).toBe('YWRtaW46c2VjcmV0')
    })

    it('encodes UTF-8 string properly without error', () => {
      expect(toBase64('người dùng:mật khẩu')).toBe(btoa(unescape(encodeURIComponent('người dùng:mật khẩu'))))
    })
  })

  describe('resolveEffectiveAuth', () => {
    it('returns request auth directly if not inherit', () => {
      const reqAuth: AuthConfig = {
        type: 'bearer',
        bearer: { token: 'my-token' }
      }
      const parentNodes: TreeNode[] = [
        {
          id: 'f1',
          name: 'Parent Folder',
          type: 'folder',
          path: '/f1',
          auth: { type: 'basic', basic: { username: 'u', password: 'p' } },
          created_at: ''
        }
      ]

      const result = resolveEffectiveAuth(reqAuth, parentNodes)
      expect(result.auth.type).toBe('bearer')
      expect(result.auth.bearer?.token).toBe('my-token')
      expect(result.sourceNode).toBeUndefined()
    })

    it('returns none if request explicitly chooses none', () => {
      const reqAuth: AuthConfig = { type: 'none' }
      const parentNodes: TreeNode[] = [
        {
          id: 'f1',
          name: 'Parent Folder',
          type: 'folder',
          path: '/f1',
          auth: { type: 'bearer', bearer: { token: 'token' } },
          created_at: ''
        }
      ]

      const result = resolveEffectiveAuth(reqAuth, parentNodes)
      expect(result.auth.type).toBe('none')
      expect(result.sourceNode).toBeUndefined()
    })

    it('inherits auth from immediate parent when request is inherit', () => {
      const reqAuth: AuthConfig = { type: 'inherit' }
      const parentNodes: TreeNode[] = [
        {
          id: 'f1',
          name: 'Parent Folder',
          type: 'folder',
          path: '/f1',
          auth: { type: 'bearer', bearer: { token: 'folder-token' } },
          created_at: ''
        }
      ]

      const result = resolveEffectiveAuth(reqAuth, parentNodes)
      expect(result.auth.type).toBe('bearer')
      expect(result.auth.bearer?.token).toBe('folder-token')
      expect(result.sourceNode?.name).toBe('Parent Folder')
    })

    it('inherits auth from nearest ancestor in multi-level hierarchy', () => {
      const reqAuth: AuthConfig = { type: 'inherit' }
      const parentNodes: TreeNode[] = [
        {
          id: 'f1',
          name: 'Root Folder',
          type: 'folder',
          path: '/f1',
          auth: { type: 'bearer', bearer: { token: 'root-token' } },
          created_at: ''
        },
        {
          id: 'f2',
          name: 'Child Folder',
          type: 'folder',
          path: '/f1/f2',
          auth: { type: 'inherit' },
          created_at: ''
        }
      ]

      const result = resolveEffectiveAuth(reqAuth, parentNodes)
      expect(result.auth.type).toBe('bearer')
      expect(result.auth.bearer?.token).toBe('root-token')
      expect(result.sourceNode?.name).toBe('Root Folder')
    })

    it('prefers closer ancestor over higher ancestor', () => {
      const reqAuth: AuthConfig = { type: 'inherit' }
      const parentNodes: TreeNode[] = [
        {
          id: 'f1',
          name: 'Root Folder',
          type: 'folder',
          path: '/f1',
          auth: { type: 'bearer', bearer: { token: 'root-token' } },
          created_at: ''
        },
        {
          id: 'f2',
          name: 'Child Folder',
          type: 'folder',
          path: '/f1/f2',
          auth: { type: 'basic', basic: { username: 'child-user', password: 'pwd' } },
          created_at: ''
        }
      ]

      const result = resolveEffectiveAuth(reqAuth, parentNodes)
      expect(result.auth.type).toBe('basic')
      expect(result.auth.basic?.username).toBe('child-user')
      expect(result.sourceNode?.name).toBe('Child Folder')
    })

    it('resolves to none if no ancestor has auth or all inherit', () => {
      const result = resolveEffectiveAuth({ type: 'inherit' }, [])
      expect(result.auth.type).toBe('none')
      expect(result.sourceNode).toBeUndefined()
    })

    it('resolves to none if auth is undefined and pathNodes empty', () => {
      const result = resolveEffectiveAuth(undefined, [])
      expect(result.auth.type).toBe('none')
    })

    it('resolves to none when an intermediate folder explicitly sets auth type to none', () => {
      const reqAuth: AuthConfig = { type: 'inherit' }
      const parentNodes: TreeNode[] = [
        {
          id: 'f1',
          name: 'Root Folder',
          type: 'folder',
          path: '/f1',
          auth: { type: 'bearer', bearer: { token: 'root-token' } },
          created_at: ''
        },
        {
          id: 'f2',
          name: 'Child Folder (No Auth)',
          type: 'folder',
          path: '/f1/f2',
          auth: { type: 'none' },
          created_at: ''
        }
      ]

      const result = resolveEffectiveAuth(reqAuth, parentNodes)
      expect(result.auth.type).toBe('none')
      expect(result.sourceNode?.name).toBe('Child Folder (No Auth)')
    })
  })

  describe('getAuthArtifacts', () => {
    it('returns empty headers and params for none or inherit', () => {
      expect(getAuthArtifacts({ type: 'none' })).toEqual({ headers: [], params: [] })
      expect(getAuthArtifacts({ type: 'inherit' })).toEqual({ headers: [], params: [] })
    })

    it('generates Authorization header for bearer auth', () => {
      const res = getAuthArtifacts({
        type: 'bearer',
        bearer: { token: 'secret-token-123' }
      })
      expect(res.headers).toEqual([
        { key: 'Authorization', value: 'Bearer secret-token-123', enabled: true }
      ])
      expect(res.params).toEqual([])
    })

    it('resolves variables in bearer token', () => {
      const vars = new Map([['tokenVar', 'resolved-xyz']])
      const res = getAuthArtifacts(
        {
          type: 'bearer',
          bearer: { token: '{{tokenVar}}' }
        },
        vars
      )
      expect(res.headers[0].value).toBe('Bearer resolved-xyz')
    })

    it('generates base64 Authorization header for basic auth', () => {
      const res = getAuthArtifacts({
        type: 'basic',
        basic: { username: 'admin', password: 'password123' }
      })
      expect(res.headers).toEqual([
        { key: 'Authorization', value: 'Basic YWRtaW46cGFzc3dvcmQxMjM=', enabled: true }
      ])
      expect(res.params).toEqual([])
    })

    it('resolves variables in basic auth username and password', () => {
      const vars = new Map([
        ['u', 'john'],
        ['p', 'doe']
      ])
      const res = getAuthArtifacts(
        {
          type: 'basic',
          basic: { username: '{{u}}', password: '{{p}}' }
        },
        vars
      )
      expect(res.headers[0].value).toBe('Basic ' + btoa('john:doe'))
    })

    it('generates header for apiKey auth with addTo: "header"', () => {
      const res = getAuthArtifacts({
        type: 'apiKey',
        apiKey: { key: 'X-API-KEY', value: 'val-999', addTo: 'header' }
      })
      expect(res.headers).toEqual([
        { key: 'X-API-KEY', value: 'val-999', enabled: true }
      ])
      expect(res.params).toEqual([])
    })

    it('generates param for apiKey auth with addTo: "query"', () => {
      const res = getAuthArtifacts({
        type: 'apiKey',
        apiKey: { key: 'api_key', value: 'param-999', addTo: 'query' }
      })
      expect(res.headers).toEqual([])
      expect(res.params).toEqual([
        { key: 'api_key', value: 'param-999', enabled: true }
      ])
    })

    it('resolves variables for apiKey auth', () => {
      const vars = new Map([['myKey', 'X-Token'], ['myVal', 'secret']])
      const res = getAuthArtifacts(
        {
          type: 'apiKey',
          apiKey: { key: '{{myKey}}', value: '{{myVal}}', addTo: 'header' }
        },
        vars
      )
      expect(res.headers).toEqual([
        { key: 'X-Token', value: 'secret', enabled: true }
      ])
    })

    it('does not generate header when bearer token is empty or only whitespace', () => {
      expect(getAuthArtifacts({ type: 'bearer', bearer: { token: '' } }).headers).toEqual([])
      expect(getAuthArtifacts({ type: 'bearer', bearer: { token: '   ' } }).headers).toEqual([])
    })

    it('does not generate header when basic username and password are both empty', () => {
      expect(getAuthArtifacts({ type: 'basic', basic: { username: '', password: '' } }).headers).toEqual([])
    })

    it('does not generate header or param when apiKey key is empty', () => {
      const res = getAuthArtifacts({ type: 'apiKey', apiKey: { key: '   ', value: '123', addTo: 'header' } })
      expect(res.headers).toEqual([])
      expect(res.params).toEqual([])
    })

    it('trims whitespace and newlines from apiKey value', () => {
      const res = getAuthArtifacts({
        type: 'apiKey',
        apiKey: { key: 'X-Key', value: '  secret\r\n', addTo: 'header' }
      })
      expect(res.headers).toEqual([{ key: 'X-Key', value: 'secret', enabled: true }])
    })

    it('skips request node in pathNodes when resolving effective auth', () => {
      const parentNodes: TreeNode[] = [
        { id: 'f1', name: 'Root Folder', type: 'folder', path: '/f1', auth: { type: 'bearer', bearer: { token: 'root-token' } }, created_at: '' },
        { id: 'req1', name: 'My Request', type: 'request', path: '/f1/req.json', auth: { type: 'bearer', bearer: { token: 'stale-req-token' } }, created_at: '' }
      ]
      const result = resolveEffectiveAuth({ type: 'inherit' }, parentNodes)
      expect(result.auth.type).toBe('bearer')
      expect(result.auth.bearer?.token).toBe('root-token')
      expect(result.sourceNode?.name).toBe('Root Folder')
    })
  })
})
