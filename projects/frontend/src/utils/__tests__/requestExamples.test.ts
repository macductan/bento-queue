import { describe, it, expect } from 'vitest'
import type { Request } from '@/stores/requestStore'
import {
  EXAMPLE_SYNC_FLAG_KEYS,
  createDefaultSyncFlags,
  normalizeSyncFlags,
  splitBaseUrlAndQuery,
  mergeBaseUrlPreservingExampleQuery,
  cloneRequestToExample,
  duplicateExample,
  resolveEffectiveRequest,
  applyProjectionEditsToExample,
  syncExampleFromDefault,
  syncAllExamplesFromDefault,
  detachExampleToRequestPayload,
  findExampleBySelector,
  resolveRequestForStepExecution
} from '../requestExamples'

function makeSampleRequest(overrides?: Partial<Request>): Request {
  return {
    id: 'req-1',
    name: 'Create Order',
    method: 'POST',
    url: '{{base_url}}/v1/:tenant/orders?dry_run=false',
    headers: [
      { key: 'X-Tenant', value: 'default', enabled: true },
      { key: 'Content-Type', value: 'application/json', enabled: true, _isAuto: true }
    ],
    params: [{ key: 'dry_run', value: 'false', enabled: true }],
    path_params: [{ key: 'tenant', value: 'acme', enabled: true }],
    variables: [{ key: 'currency', value: 'USD', enabled: true }],
    body: { type: 'json', content: '{"item":"book","qty":1}' },
    auth: { type: 'bearer', bearer: { token: '{{token}}' } },
    scripts: { pre_request: 'console.log("pre")', post_response: 'ha.test("ok", () => {})' },
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

describe('requestExamples utilities', () => {
  it('provides expected default sync_flags and normalizes partial flags', () => {
    const defaults = createDefaultSyncFlags()
    expect(EXAMPLE_SYNC_FLAG_KEYS).toHaveLength(9)
    expect(defaults).toEqual({
      url: true,
      method: true,
      auth: true,
      scripts: true,
      body: false,
      params: false,
      path_params: false,
      headers: false,
      variables: false
    })

    const partial = normalizeSyncFlags({ body: true, url: false })
    expect(partial.body).toBe(true)
    expect(partial.url).toBe(false)
    expect(partial.method).toBe(true)
    expect(partial.headers).toBe(false)
  })

  it('splits Base URL and query preserving {{variables}} and merges Example query', () => {
    const split = splitBaseUrlAndQuery('{{host}}/users?role={{role}}&active=true#top')
    expect(split).toEqual({
      baseUrl: '{{host}}/users',
      rawQuery: 'role={{role}}&active=true',
      hash: '#top'
    })

    const merged = mergeBaseUrlPreservingExampleQuery(
      'https://v2.api.dev/orders?default=ignored',
      'https://v1.api.dev/orders?mode=sandbox',
      [{ key: 'mode', value: 'live', enabled: true }]
    )
    expect(merged).toBe('https://v2.api.dev/orders?mode=live')

    // Explicit empty params array [] must clear query instead of resurrecting exRawQuery
    const cleared = mergeBaseUrlPreservingExampleQuery(
      'https://v2.api.dev/orders?default=ignored',
      'https://v1.api.dev/orders?stale=1',
      []
    )
    expect(cleared).toBe('https://v2.api.dev/orders')
  })

  it('clones and duplicates examples with stripped _isAuto headers and unique IDs', () => {
    const req = makeSampleRequest()
    const ex1 = cloneRequestToExample(req, { name: 'Empty Cart', id: 'ex-1' })
    expect(ex1.id).toBe('ex-1')
    expect(ex1.name).toBe('Empty Cart')
    expect(ex1.sync_flags).toEqual(createDefaultSyncFlags())
    expect(ex1.headers.some(h => h._isAuto)).toBe(false)

    const dup = duplicateExample(ex1, [ex1])
    expect(dup.id).not.toBe(ex1.id)
    expect(dup.name).toBe('Empty Cart (Copy)')
  })

  it('resolves effective request preserving Example query params and path_param values when Base URL is linked', () => {
    const req = makeSampleRequest({
      url: 'https://v2.example.com/tenants/:tenant/orders/:order_id?ignore=yes',
      path_params: [
        { key: 'tenant', value: 'default-tenant', enabled: true },
        { key: 'order_id', value: '999', enabled: true }
      ]
    })
    const ex = cloneRequestToExample(makeSampleRequest(), { id: 'ex-1', name: 'Bulk' })
    ex.params = [{ key: 'bulk', value: 'true', enabled: true }]
    ex.path_params = [{ key: 'tenant', value: 'vip-tenant', enabled: true, type: 'select', options: ['vip-tenant', 'std'] }]
    ex.body = { type: 'json', content: '{"bulk":true}' }

    const effective = resolveEffectiveRequest(req, ex)
    expect(effective.url).toBe('https://v2.example.com/tenants/:tenant/orders/:order_id?bulk=true')
    expect(effective.params).toEqual([{ key: 'bulk', value: 'true', enabled: true }])
    expect(effective.path_params).toEqual([
      { key: 'tenant', value: 'vip-tenant', enabled: true, type: 'select', options: ['vip-tenant', 'std'] },
      { key: 'order_id', value: '', enabled: true }
    ])
    expect(effective.body.content).toBe('{"bulk":true}')
  })

  it('applyProjectionEditsToExample only updates unlinked groups', () => {
    const defaultReq = makeSampleRequest()
    const ex = cloneRequestToExample(defaultReq, { id: 'ex-1', name: 'Case 1' })
    // Default has url/method/auth/scripts linked, others unlinked
    const effective = resolveEffectiveRequest(defaultReq, ex)
    effective.method = 'DELETE' // linked -> should be ignored
    effective.url = 'https://evil.example.com?custom=1' // url linked -> ignored, custom=1 via params
    effective.params = [{ key: 'custom', value: '1', enabled: true }]
    effective.body = { type: 'json', content: '{"changed":true}' }

    const updated = applyProjectionEditsToExample(ex, effective, { now: '2026-02-01T00:00:00.000Z' })
    expect(updated.method).toBe('POST')
    expect(updated.params).toEqual([{ key: 'custom', value: '1', enabled: true }])
    expect(updated.body.content).toBe('{"changed":true}')
    expect(updated.updated_at).toBe('2026-02-01T00:00:00.000Z')
  })

  it('syncAllExamplesFromDefault updates linked fields without overwriting Example Body/Params/Headers', () => {
    const req = makeSampleRequest()
    const ex = cloneRequestToExample(req, { id: 'ex-1', name: 'VIP' })
    ex.params = [{ key: 'vip', value: '1', enabled: true }]
    ex.headers = [{ key: 'X-Custom', value: 'vip-only', enabled: true }]
    ex.body = { type: 'json', content: '{"vip":true}' }
    req.examples = [ex]

    // Mutate Default
    req.method = 'PUT'
    req.url = 'https://new-host.example.com/v2/:tenant/orders?default_only=1'
    req.body = { type: 'json', content: '{"default":true}' }
    req.headers = [{ key: 'X-Tenant', value: 'updated-default', enabled: true }]

    const synced = syncAllExamplesFromDefault(req)
    expect(synced).toHaveLength(1)
    expect(synced[0].method).toBe('PUT')
    expect(synced[0].url).toBe('https://new-host.example.com/v2/:tenant/orders?vip=1')
    expect(synced[0].params).toEqual([{ key: 'vip', value: '1', enabled: true }])
    expect(synced[0].headers).toEqual([{ key: 'X-Custom', value: 'vip-only', enabled: true }])
    expect(synced[0].body.content).toBe('{"vip":true}')

    const forceBodySynced = syncExampleFromDefault(req, synced[0], ['body'])
    expect(forceBodySynced.body.content).toBe('{"default":true}')
    expect(forceBodySynced.params).toEqual([{ key: 'vip', value: '1', enabled: true }])
  })

  it('detachExampleToRequestPayload promotes effective config and deletes source example', () => {
    const req = makeSampleRequest()
    const ex = cloneRequestToExample(req, { id: 'ex-1', name: 'Admin Flow' })
    ex.body = { type: 'json', content: '{"admin":true}' }
    req.method = 'PATCH'
    req.examples = [ex]

    const detached = detachExampleToRequestPayload(req, 'ex-1')
    expect(detached).not.toBeNull()
    expect(detached!.detachedFields.name).toBe('Create Order - Admin Flow')
    expect(detached!.detachedFields.method).toBe('PATCH')
    expect(detached!.detachedFields.body.content).toBe('{"admin":true}')
    expect(detached!.remainingExamples).toEqual([])
  })

  it('findExampleBySelector and resolveRequestForStepExecution fail strictly without Default fallback', () => {
    const req = makeSampleRequest()
    const ex1 = cloneRequestToExample(req, { id: 'ex-1', name: 'Success' })
    const ex2 = cloneRequestToExample(req, { id: 'ex-2', name: 'Success' })
    req.examples = [ex1, ex2]

    // Empty selector => Default
    const defaultRes = resolveRequestForStepExecution(req, '')
    expect(defaultRes.request?.id).toBe('req-1')
    expect(defaultRes.example).toBeNull()

    // Exact ID => ok
    const byId = resolveRequestForStepExecution(req, 'ex-1')
    expect(byId.example?.id).toBe('ex-1')

    // Ambiguous name => VALIDATION error
    const amb = findExampleBySelector(req.examples, 'success', req.name)
    expect(amb.example).toBeNull()
    expect(amb.code).toBe('VALIDATION')

    // Missing selector => NOT_FOUND error, request is null (never Default)
    const missing = resolveRequestForStepExecution(req, 'deleted-ex-id')
    expect(missing.request).toBeNull()
    expect(missing.code).toBe('NOT_FOUND')
  })
})
