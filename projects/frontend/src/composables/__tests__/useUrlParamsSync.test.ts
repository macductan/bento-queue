import { describe, it, expect } from 'vitest'
import { ref, nextTick } from 'vue'
import { useUrlParamsSync } from '../useUrlParamsSync'
import type { Request } from '../../stores/requestStore'

describe('useUrlParamsSync', () => {
  const createMockRequest = (overrides: Partial<Request> = {}): Request => ({
    id: 'req-1',
    name: 'Test Request',
    method: 'GET',
    url: 'https://api.example.com/items',
    headers: [],
    params: [],
    body: { type: 'none', content: '' },
    created_at: '',
    updated_at: '',
    ...overrides
  })

  it('should sync changes from params to url', async () => {
    const req = ref<Request | null>(createMockRequest())
    useUrlParamsSync(req)

    req.value!.params.push({ key: 'search', value: 'shoes', enabled: true })
    await nextTick()

    expect(req.value!.url).toBe('https://api.example.com/items?search=shoes')

    req.value!.params.push({ key: 'limit', value: '10', enabled: true })
    await nextTick()

    expect(req.value!.url).toBe('https://api.example.com/items?search=shoes&limit=10')
  })

  it('should exclude disabled params from url when toggled', async () => {
    const req = ref<Request | null>(createMockRequest({
      params: [
        { key: 'a', value: '1', enabled: true },
        { key: 'b', value: '2', enabled: true }
      ]
    }))
    useUrlParamsSync(req)

    req.value!.params[1].enabled = false
    await nextTick()

    expect(req.value!.url).toBe('https://api.example.com/items?a=1')

    req.value!.params[1].enabled = true
    await nextTick()

    expect(req.value!.url).toBe('https://api.example.com/items?a=1&b=2')
  })

  it('should sync changes from url to params', async () => {
    const req = ref<Request | null>(createMockRequest())
    useUrlParamsSync(req)

    req.value!.url = 'https://api.example.com/items?page=2&sort=desc'
    await nextTick()

    expect(req.value!.params).toEqual([
      { key: 'page', value: '2', enabled: true },
      { key: 'sort', value: 'desc', enabled: true }
    ])
  })

  it('should preserve disabled params when editing url', async () => {
    const req = ref<Request | null>(createMockRequest({
      url: 'https://api.example.com/items?a=1',
      params: [
        { key: 'a', value: '1', enabled: true },
        { key: 'debug', value: 'true', enabled: false }
      ]
    }))
    useUrlParamsSync(req)

    req.value!.url = 'https://api.example.com/items?a=10&b=20'
    await nextTick()

    expect(req.value!.params).toEqual([
      { key: 'a', value: '10', enabled: true },
      { key: 'debug', value: 'true', enabled: false },
      { key: 'b', value: '20', enabled: true }
    ])
  })

  it('should preserve {{...}} variable syntax in both directions', async () => {
    const req = ref<Request | null>(createMockRequest())
    useUrlParamsSync(req)

    req.value!.params.push({ key: '{{token_key}}', value: '{{token_val}}', enabled: true })
    await nextTick()

    expect(req.value!.url).toBe('https://api.example.com/items?{{token_key}}={{token_val}}')

    req.value!.url = 'https://api.example.com/items?query={{custom_search}}'
    await nextTick()

    expect(req.value!.params).toEqual([
      { key: 'query', value: '{{custom_search}}', enabled: true }
    ])
  })

  it('should preserve port and hash fragment in url during params sync', async () => {
    const req = ref<Request | null>(createMockRequest({
      url: 'http://localhost:8080/v1/search#target',
      params: []
    }))
    useUrlParamsSync(req)

    req.value!.params.push({ key: 'filter', value: 'active', enabled: true })
    await nextTick()

    expect(req.value!.url).toBe('http://localhost:8080/v1/search?filter=active#target')

    req.value!.params[0].enabled = false
    await nextTick()

    expect(req.value!.url).toBe('http://localhost:8080/v1/search#target')
  })

  it('should handle flag params without value correctly', async () => {
    const req = ref<Request | null>(createMockRequest())
    useUrlParamsSync(req)

    req.value!.url = 'https://api.example.com/test?flag&key=val'
    await nextTick()

    expect(req.value!.params).toEqual([
      { key: 'flag', value: '', enabled: true },
      { key: 'key', value: 'val', enabled: true }
    ])

    // Modifying key should format flag without '='
    req.value!.params.push({ key: 'verbose', value: '', enabled: true })
    await nextTick()

    expect(req.value!.url).toBe('https://api.example.com/test?flag&key=val&verbose')
  })

  it('should guard against re-entrancy / infinite loops', async () => {
    const req = ref<Request | null>(createMockRequest())
    useUrlParamsSync(req)

    // Mutate URL
    req.value!.url = 'https://api.example.com/items?count=5'
    await nextTick()

    // Url should stay intact and params should be updated
    expect(req.value!.url).toBe('https://api.example.com/items?count=5')
    expect(req.value!.params).toEqual([
      { key: 'count', value: '5', enabled: true }
    ])

    // Mutate params
    req.value!.params[0].value = '10'
    await nextTick()

    expect(req.value!.url).toBe('https://api.example.com/items?count=10')
  })

  it('should reset sync state cleanly on request id switch', async () => {
    const req = ref<Request | null>(createMockRequest({ id: 'req-1', url: 'https://api.com/1?a=1' }))
    useUrlParamsSync(req)

    req.value = createMockRequest({ id: 'req-2', url: 'https://api.com/2?b=2', params: [{ key: 'b', value: '2', enabled: true }] })
    await nextTick()

    expect(req.value.url).toBe('https://api.com/2?b=2')
    expect(req.value.params).toEqual([{ key: 'b', value: '2', enabled: true }])
  })

  it('should reconcile URL into params on initial mount when params is empty', async () => {
    const req = ref<Request | null>(createMockRequest({
      id: 'req-init',
      url: 'https://api.example.com/items?page=1&limit=20',
      params: []
    }))
    useUrlParamsSync(req)
    await nextTick()

    expect(req.value!.params).toEqual([
      { key: 'page', value: '1', enabled: true },
      { key: 'limit', value: '20', enabled: true }
    ])

    // Adding a param preserves pre-existing query params
    req.value!.params.push({ key: 'sort', value: 'asc', enabled: true })
    await nextTick()

    expect(req.value!.url).toBe('https://api.example.com/items?page=1&limit=20&sort=asc')
  })

  it('should reconcile URL into params on request id switch when switching to request with empty params', async () => {
    const req = ref<Request | null>(createMockRequest({
      id: 'req-1',
      url: 'https://api.com/1?a=1',
      params: [{ key: 'a', value: '1', enabled: true }]
    }))
    useUrlParamsSync(req)
    await nextTick()

    req.value = createMockRequest({
      id: 'req-2',
      url: 'https://api.com/2?filter=active',
      params: []
    })
    await nextTick()

    expect(req.value.params).toEqual([
      { key: 'filter', value: 'active', enabled: true }
    ])
  })
})
