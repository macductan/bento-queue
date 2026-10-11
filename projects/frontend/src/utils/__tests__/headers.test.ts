import { describe, it, expect } from 'vitest'
import { getInheritedHeaders, mergeHeaders, getDefaultHeaders } from '../headers'
import type { TreeNode } from '../../stores/collectionStore'
import type { KVPair } from '../../stores/requestStore'

describe('getInheritedHeaders', () => {
  it('returns empty array when pathNodes is empty or null', () => {
    expect(getInheritedHeaders([])).toEqual([])
    expect(getInheritedHeaders(null as any)).toEqual([])
  })

  it('ignores request nodes in pathNodes', () => {
    const nodes: TreeNode[] = [
      {
        id: 'req1',
        name: 'Request',
        type: 'request',
        path: '/coll/req.json',
        created_at: ''
      }
    ]
    expect(getInheritedHeaders(nodes)).toEqual([])
  })

  it('inherits enabled headers from a single folder', () => {
    const nodes: TreeNode[] = [
      {
        id: 'f1',
        name: 'Folder 1',
        type: 'folder',
        path: '/coll/f1',
        created_at: '',
        headers: [
          { key: 'X-Custom', value: 'Alpha', enabled: true },
          { key: 'X-Disabled', value: 'Beta', enabled: false },
          { key: '  ', value: 'EmptyKey', enabled: true }
        ]
      }
    ]
    expect(getInheritedHeaders(nodes)).toEqual([
      { key: 'X-Custom', value: 'Alpha', enabled: true, folderLevel: 1, folderName: 'Folder 1' }
    ])
  })

  it('inherits and overrides across multi-level folders (case-insensitive)', () => {
    const nodes: TreeNode[] = [
      {
        id: 'f1',
        name: 'Folder A',
        type: 'folder',
        path: '/coll/f1',
        created_at: '',
        headers: [
          { key: 'X-Env', value: 'prod', enabled: true },
          { key: 'X-App', value: 'hecto', enabled: true }
        ]
      },
      {
        id: 'f2',
        name: 'Folder B',
        type: 'folder',
        path: '/coll/f1/f2',
        created_at: '',
        headers: [
          { key: 'x-env', value: 'staging', enabled: true },
          { key: 'X-Region', value: 'ap-southeast', enabled: true }
        ]
      },
      {
        id: 'req1',
        name: 'Req',
        type: 'request',
        path: '/coll/f1/f2/req.json',
        created_at: ''
      }
    ]

    const result = getInheritedHeaders(nodes)
    expect(result).toHaveLength(3)
    // x-env should be staging (overridden case-insensitively)
    const envHeader = result.find(h => h.key.toLowerCase() === 'x-env')
    expect(envHeader).toEqual({ key: 'x-env', value: 'staging', enabled: true, folderLevel: 2, folderName: 'Folder B' })

    const appHeader = result.find(h => h.key.toLowerCase() === 'x-app')
    expect(appHeader).toEqual({ key: 'X-App', value: 'hecto', enabled: true, folderLevel: 1, folderName: 'Folder A' })

    const regHeader = result.find(h => h.key.toLowerCase() === 'x-region')
    expect(regHeader).toEqual({ key: 'X-Region', value: 'ap-southeast', enabled: true, folderLevel: 2, folderName: 'Folder B' })
  })

  it('subfolder with disabled header suppresses parent folder header', () => {
    const nodes: TreeNode[] = [
      {
        id: 'f1',
        name: 'Folder 1',
        type: 'folder',
        path: '/coll/f1',
        created_at: '',
        headers: [{ key: 'X-Token', value: 'parent-token', enabled: true }]
      },
      {
        id: 'f2',
        name: 'Folder 2',
        type: 'folder',
        path: '/coll/f1/f2',
        created_at: '',
        headers: [{ key: 'x-token', value: '', enabled: false }]
      }
    ]

    expect(getInheritedHeaders(nodes)).toEqual([])
  })
})

describe('mergeHeaders', () => {
  it('returns inherited headers when request has no headers', () => {
    const inherited: KVPair[] = [{ key: 'X-Custom', value: 'Alpha', enabled: true }]
    expect(mergeHeaders([], inherited)).toEqual([
      { key: 'X-Custom', value: 'Alpha', enabled: true }
    ])
  })

  it('request header overrides inherited header case-insensitively', () => {
    const inherited: KVPair[] = [{ key: 'X-Api-Key', value: 'parent', enabled: true }]
    const requestHeaders: KVPair[] = [{ key: 'x-api-key', value: 'child', enabled: true }]

    const result = mergeHeaders(requestHeaders, inherited)
    expect(result).toEqual([
      { key: 'x-api-key', value: 'child', enabled: true }
    ])
  })

  it('disabled child header suppresses parent inherited header', () => {
    const inherited: KVPair[] = [{ key: 'X-Secret', value: '123', enabled: true }]
    const requestHeaders: KVPair[] = [{ key: 'x-secret', value: '', enabled: false }]

    const result = mergeHeaders(requestHeaders, inherited)
    expect(result).toEqual([])
  })

  it('combines unrelated inherited and request headers', () => {
    const inherited: KVPair[] = [{ key: 'X-Parent', value: 'P1', enabled: true }]
    const requestHeaders: KVPair[] = [{ key: 'X-Child', value: 'C1', enabled: true }]

    const result = mergeHeaders(requestHeaders, inherited)
    expect(result).toEqual([
      { key: 'X-Parent', value: 'P1', enabled: true },
      { key: 'X-Child', value: 'C1', enabled: true }
    ])
  })

  it('ignores empty keys in both inherited and request headers', () => {
    const inherited: KVPair[] = [{ key: '  ', value: 'val', enabled: true }]
    const requestHeaders: KVPair[] = [{ key: '', value: 'val2', enabled: true }]

    expect(mergeHeaders(requestHeaders, inherited)).toEqual([])
  })

  it('preserves multiple enabled request headers with the same key (e.g. Accept)', () => {
    const inherited: KVPair[] = [{ key: 'Accept', value: '*/*', enabled: true }]
    const requestHeaders: KVPair[] = [
      { key: 'Accept', value: 'application/json', enabled: true },
      { key: 'Accept', value: 'text/plain', enabled: true }
    ]

    const result = mergeHeaders(requestHeaders, inherited)
    expect(result).toEqual([
      { key: 'Accept', value: 'application/json', enabled: true },
      { key: 'Accept', value: 'text/plain', enabled: true }
    ])
  })

  it('preserves enabled request header when followed by a disabled header of same key', () => {
    const inherited: KVPair[] = [{ key: 'Authorization', value: 'Bearer parent', enabled: true }]
    const requestHeaders: KVPair[] = [
      { key: 'Authorization', value: 'Bearer active', enabled: true },
      { key: 'authorization', value: 'Bearer old-disabled', enabled: false }
    ]

    const result = mergeHeaders(requestHeaders, inherited)
    expect(result).toEqual([
      { key: 'Authorization', value: 'Bearer active', enabled: true }
    ])
  })

  it('handles null or undefined keys gracefully without throwing TypeError', () => {
    const inherited: any[] = [{ key: null, value: 'val', enabled: true }]
    const requestHeaders: any[] = [{ key: undefined, value: 'val2', enabled: true }]

    expect(() => mergeHeaders(requestHeaders, inherited)).not.toThrow()
    expect(mergeHeaders(requestHeaders, inherited)).toEqual([])
  })
})

describe('getDefaultHeaders', () => {
  it('returns empty array when no inherited headers and body is not json', () => {
    expect(getDefaultHeaders({ headers: [], body: { type: 'none' } }, [])).toEqual([])
    expect(getDefaultHeaders(null, [])).toEqual([])
  })

  it('includes inherited folder headers with source folder and overridden false', () => {
    const inherited: KVPair[] = [{ key: 'X-App', value: 'Hecto', enabled: true }]
    const req = { headers: [], body: { type: 'none' } }

    const result = getDefaultHeaders(req, inherited)
    expect(result).toEqual([
      { key: 'X-App', value: 'Hecto', source: 'folder', folderLevel: 1, overridden: false, disabled: false }
    ])
  })

  it('includes auto Content-Type when body.type is json', () => {
    const req = { headers: [], body: { type: 'json' } }

    const result = getDefaultHeaders(req, [])
    expect(result).toEqual([
      { key: 'Content-Type', value: 'application/json', source: 'auto', overridden: false, disabled: false }
    ])
  })

  it('marks inherited header as overridden when request defines it enabled', () => {
    const inherited: KVPair[] = [{ key: 'X-Custom', value: 'parent', enabled: true }]
    const req = {
      headers: [{ key: 'x-custom', value: 'child', enabled: true }],
      body: { type: 'none' }
    }

    const result = getDefaultHeaders(req, inherited)
    expect(result).toEqual([
      { key: 'X-Custom', value: 'parent', source: 'folder', folderLevel: 1, overridden: true, disabled: false }
    ])
  })

  it('marks auto Content-Type as overridden when request defines content-type', () => {
    const req = {
      headers: [{ key: 'content-type', value: 'application/xml', enabled: true }],
      body: { type: 'json' }
    }

    const result = getDefaultHeaders(req, [])
    expect(result).toEqual([
      { key: 'Content-Type', value: 'application/json', source: 'auto', overridden: true, disabled: false }
    ])
  })

  it('does not duplicate Content-Type if folder already defines it', () => {
    const inherited: KVPair[] = [{ key: 'Content-Type', value: 'application/vnd.api+json', enabled: true }]
    const req = { headers: [], body: { type: 'json' } }

    const result = getDefaultHeaders(req, inherited)
    expect(result).toEqual([
      { key: 'Content-Type', value: 'application/vnd.api+json', source: 'folder', folderLevel: 1, overridden: false, disabled: false }
    ])
  })

  it('marks inherited header as disabled when request defines it disabled (suppressed)', () => {
    const inherited: KVPair[] = [{ key: 'X-App', value: 'Hecto', enabled: true }]
    const req = {
      headers: [{ key: 'x-app', value: '', enabled: false }],
      body: { type: 'none' }
    }

    const result = getDefaultHeaders(req, inherited)
    expect(result).toEqual([
      { key: 'X-App', value: 'Hecto', source: 'folder', folderLevel: 1, overridden: false, disabled: true }
    ])
  })

  it('marks auto Content-Type as disabled when request defines content-type disabled', () => {
    const req = {
      headers: [{ key: 'content-type', value: '', enabled: false }],
      body: { type: 'json' }
    }

    const result = getDefaultHeaders(req, [])
    expect(result).toEqual([
      { key: 'Content-Type', value: 'application/json', source: 'auto', overridden: false, disabled: true }
    ])
  })

  it('includes auth headers with source auth and tracks overridden status', () => {
    const authHeaders: KVPair[] = [
      { key: 'Authorization', value: 'Bearer secret', enabled: true }
    ]
    const req = {
      headers: [{ key: 'authorization', value: 'custom', enabled: true }],
      body: { type: 'none' }
    }

    const result = getDefaultHeaders(req, [], authHeaders)
    expect(result).toEqual([
      { key: 'Authorization', value: 'Bearer secret', source: 'auth', overridden: true, disabled: false }
    ])
  })

  it('includes auth headers as not overridden when request does not define it', () => {
    const authHeaders: KVPair[] = [
      { key: 'Authorization', value: 'Bearer secret', enabled: true }
    ]
    const req = {
      headers: [],
      body: { type: 'none' }
    }

    const result = getDefaultHeaders(req, [], authHeaders)
    expect(result).toEqual([
      { key: 'Authorization', value: 'Bearer secret', source: 'auth', overridden: false, disabled: false }
    ])
  })

  it('marks inherited folder header as overridden when auth defines matching key', () => {
    const inherited: KVPair[] = [
      { key: 'Authorization', value: 'FolderSecret', enabled: true }
    ]
    const authHeaders: KVPair[] = [
      { key: 'Authorization', value: 'Bearer token', enabled: true }
    ]
    const req = { headers: [], body: { type: 'none' } }

    const result = getDefaultHeaders(req, inherited, authHeaders)
    expect(result).toEqual([
      { key: 'Authorization', value: 'FolderSecret', source: 'folder', folderLevel: 1, overridden: true, disabled: false },
      { key: 'Authorization', value: 'Bearer token', source: 'auth', overridden: false, disabled: false }
    ])
  })
})
