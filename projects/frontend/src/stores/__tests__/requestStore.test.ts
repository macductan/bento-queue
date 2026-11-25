import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useRequestStore } from '../requestStore'
import { useUiStore } from '../uiStore'
import { GetRequest, SaveRequest, CreateRequest, GetCollectionTree } from '../../../wailsjs/go/main/App'
import { createMockRequest } from './utils'

// Mock wails calls
vi.mock('../../../wailsjs/go/main/App', () => ({
  GetRequest: vi.fn(),
  SaveRequest: vi.fn(),
  CreateRequest: vi.fn(),
  GetCollectionTree: vi.fn().mockResolvedValue({ success: true, data: [] })
}))

describe('requestStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(GetCollectionTree).mockResolvedValue({ success: true, data: [] } as any)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should auto-add Content-Type header when changing to JSON', () => {
    const store = useRequestStore()
    store.current = createMockRequest()

    store.setBodyType('json')
    expect(store.contentTypeAuto).toBe(true)
    expect(store.current.headers).toHaveLength(1)
    expect(store.current.headers[0]).toEqual({
      key: 'Content-Type',
      value: 'application/json',
      enabled: true,
      _isAuto: true
    })
    expect(store.current.body.type).toBe('json')
  })

  it('should remove auto-added Content-Type header when changing to none/text', () => {
    const store = useRequestStore()
    store.current = createMockRequest({
      headers: [
        { key: 'Content-Type', value: 'application/json', enabled: true, _isAuto: true },
        { key: 'Authorization', value: 'Bearer token', enabled: true }
      ],
      body: { type: 'json', content: '{}' }
    })
    store.contentTypeAuto = true

    store.setBodyType('none')
    expect(store.contentTypeAuto).toBe(false)
    expect(store.current.headers).toHaveLength(1)
    expect(store.current.headers[0].key).toBe('Authorization')
    expect(store.current.body.type).toBe('none')
  })

  it('should not add Content-Type if one already exists when changing to JSON', () => {
    const store = useRequestStore()
    store.current = createMockRequest({
      headers: [
        { key: 'Content-Type', value: 'application/x-www-form-urlencoded', enabled: true }
      ]
    })
    
    store.setBodyType('json')
    expect(store.contentTypeAuto).toBe(false)
    expect(store.current.headers).toHaveLength(1)
    expect(store.current.headers[0].value).toBe('application/x-www-form-urlencoded')
  })

  describe('auto-save scheduling & debounce', () => {
    it('sets saveStatus to unsaved and schedules debounce timer when dirty', () => {
      vi.useFakeTimers()
      const store = useRequestStore()
      store.original = createMockRequest({ url: 'https://example.com/1' })
      store.current = createMockRequest({ url: 'https://example.com/2' })
      expect(store.isDirty).toBe(true)

      store.scheduleAutoSave(800)
      expect(store.saveStatus).toBe('unsaved')
      expect(store.autoSaveTimer).not.toBeNull()
    })

    it('triggers silent saveCurrent after debounce delay elapses', async () => {
      vi.useFakeTimers()
      const store = useRequestStore()
      const uiStore = useUiStore()
      store.original = createMockRequest({ url: 'https://example.com/1' })
      store.current = createMockRequest({ url: 'https://example.com/2' })

      vi.mocked(SaveRequest).mockResolvedValueOnce({ success: true } as any)

      store.scheduleAutoSave(800)
      expect(SaveRequest).not.toHaveBeenCalled()

      // Advance by 800ms
      await vi.advanceTimersByTimeAsync(800)

      expect(SaveRequest).toHaveBeenCalledTimes(1)
      expect(store.saveStatus).toBe('saved')
      expect(uiStore.toast).toBeNull() // Silent save produces no toast
    })

    it('resets debounce timer if another change occurs before delay', async () => {
      vi.useFakeTimers()
      const store = useRequestStore()
      store.original = createMockRequest({ url: 'https://example.com/1' })
      store.current = createMockRequest({ url: 'https://example.com/2' })

      vi.mocked(SaveRequest).mockResolvedValue({ success: true } as any)

      store.scheduleAutoSave(800)
      await vi.advanceTimersByTimeAsync(500)
      expect(SaveRequest).not.toHaveBeenCalled()

      // Another change arrives at 500ms
      store.current.url = 'https://example.com/3'
      store.scheduleAutoSave(800)

      // Advance another 500ms (total 1000ms from start, but 500ms from 2nd change)
      await vi.advanceTimersByTimeAsync(500)
      expect(SaveRequest).not.toHaveBeenCalled()

      // Advance remaining 300ms
      await vi.advanceTimersByTimeAsync(300)
      expect(SaveRequest).toHaveBeenCalledTimes(1)
      expect(store.saveStatus).toBe('saved')
    })

    it('cancels auto-save timer when cancelAutoSave is called', async () => {
      vi.useFakeTimers()
      const store = useRequestStore()
      store.original = createMockRequest({ url: 'https://example.com/1' })
      store.current = createMockRequest({ url: 'https://example.com/2' })

      store.scheduleAutoSave(800)
      store.cancelAutoSave()
      expect(store.autoSaveTimer).toBeNull()

      await vi.advanceTimersByTimeAsync(1000)
      expect(SaveRequest).not.toHaveBeenCalled()
    })
  })

  describe('flush()', () => {
    it('flushes pending changes immediately and cancels debounce timer', async () => {
      vi.useFakeTimers()
      const store = useRequestStore()
      store.original = createMockRequest({ url: 'https://example.com/1' })
      store.current = createMockRequest({ url: 'https://example.com/2' })

      vi.mocked(SaveRequest).mockResolvedValueOnce({ success: true } as any)

      store.scheduleAutoSave(800)
      expect(store.autoSaveTimer).not.toBeNull()

      const flushPromise = store.flush()
      expect(store.autoSaveTimer).toBeNull() // timer cancelled immediately

      const result = await flushPromise
      expect(result).toBe(true)
      expect(SaveRequest).toHaveBeenCalledTimes(1)
      expect(store.isDirty).toBe(false)
      expect(store.saveStatus).toBe('saved')
    })

    it('returns true without calling SaveRequest if not dirty', async () => {
      const store = useRequestStore()
      store.original = createMockRequest({ url: 'https://example.com/1' })
      store.current = createMockRequest({ url: 'https://example.com/1' })

      const result = await store.flush()
      expect(result).toBe(true)
      expect(SaveRequest).not.toHaveBeenCalled()
    })

    it('returns false and sets error status if flush fails', async () => {
      const store = useRequestStore()
      const uiStore = useUiStore()
      store.original = createMockRequest({ url: 'https://example.com/1' })
      store.current = createMockRequest({ url: 'https://example.com/2' })

      vi.mocked(SaveRequest).mockResolvedValueOnce({
        success: false,
        error: { message: 'Write permission denied', code: 'EACCES' }
      } as any)

      const result = await store.flush()
      expect(result).toBe(false)
      expect(store.saveStatus).toBe('error')
      expect(uiStore.toast?.text).toBe('Write permission denied')
    })
  })

  describe('saveCurrent() options & race conditions', () => {
    it('shows toast "Đã lưu" on manual save (silent: false)', async () => {
      const store = useRequestStore()
      const uiStore = useUiStore()
      store.original = createMockRequest({ url: 'https://example.com/1' })
      store.current = createMockRequest({ url: 'https://example.com/2' })

      vi.mocked(SaveRequest).mockResolvedValueOnce({ success: true } as any)

      const result = await store.saveCurrent()
      expect(result).toBe(true)
      expect(store.saveStatus).toBe('saved')
      expect(uiStore.toast?.text).toBe('Đã lưu')
    })

    it('shows toast "Đã lưu" and skips disk write when Ctrl+S is pressed on non-dirty request', async () => {
      const store = useRequestStore()
      const uiStore = useUiStore()
      store.original = createMockRequest({ url: 'https://example.com/1' })
      store.current = createMockRequest({ url: 'https://example.com/1' })
      expect(store.isDirty).toBe(false)

      const result = await store.saveCurrent()
      expect(result).toBe(true)
      expect(SaveRequest).not.toHaveBeenCalled()
      expect(uiStore.toast?.text).toBe('Đã lưu')
    })

    it('serializes concurrent save calls without race condition via activeSavePromise', async () => {
      const store = useRequestStore()
      store.original = createMockRequest({ url: 'https://example.com/1' })
      store.current = createMockRequest({ url: 'https://example.com/2' })

      let resolveSave: (val: any) => void
      const slowSavePromise = new Promise(resolve => {
        resolveSave = resolve
      })

      vi.mocked(SaveRequest).mockImplementationOnce(() => slowSavePromise as any)

      // Start first save
      const call1 = store.saveCurrent({ silent: true })
      expect(store.saving).toBe(true)
      expect(store.activeSavePromise).not.toBeNull()

      // Start second save (e.g. flush or manual save while first is in flight)
      const call2 = store.flush()

      // Resolve the backend save call
      resolveSave!({ success: true })

      const [res1, res2] = await Promise.all([call1, call2])
      expect(res1).toBe(true)
      expect(res2).toBe(true)
      expect(SaveRequest).toHaveBeenCalledTimes(1)
      expect(store.activeSavePromise).toBeNull()
      expect(store.saveStatus).toBe('saved')
    })

    it('sets saveStatus to error and notifies user when SaveRequest throws exception', async () => {
      const store = useRequestStore()
      const uiStore = useUiStore()
      store.original = createMockRequest({ url: 'https://example.com/1' })
      store.current = createMockRequest({ url: 'https://example.com/2' })

      vi.mocked(SaveRequest).mockRejectedValueOnce(new Error('Network disconnected'))

      const result = await store.saveCurrent({ silent: true })
      expect(result).toBe(false)
      expect(store.saveStatus).toBe('error')
      expect(uiStore.toast?.text).toContain('Network disconnected')
    })

    it('correctly reconciles original state and sets saveStatus to saved when request has auto-added Content-Type header', async () => {
      const store = useRequestStore()
      store.original = createMockRequest({
        body: { type: 'none', content: '' },
        headers: []
      })
      store.current = createMockRequest({
        body: { type: 'json', content: '{"hello":"world"}' },
        headers: [
          { key: 'Content-Type', value: 'application/json', enabled: true, _isAuto: true }
        ]
      })
      store.contentTypeAuto = true
      expect(store.isDirty).toBe(true)

      vi.mocked(SaveRequest).mockResolvedValueOnce({ success: true } as any)

      const result = await store.saveCurrent({ silent: true })
      expect(result).toBe(true)
      expect(store.isDirty).toBe(false)
      expect(store.saveStatus).toBe('saved')

      // Ensure SaveRequest received headers without _isAuto
      expect(SaveRequest).toHaveBeenCalledWith(expect.objectContaining({
        headers: []
      }))
    })

    it('detects isDirty and persists disabled _isAuto Content-Type header when user unchecks it', async () => {
      const store = useRequestStore()
      store.original = createMockRequest({
        body: { type: 'json', content: '{"hello":"world"}' },
        headers: [
          { key: 'Content-Type', value: 'application/json', enabled: true, _isAuto: true }
        ]
      })
      store.current = createMockRequest({
        body: { type: 'json', content: '{"hello":"world"}' },
        headers: [
          { key: 'Content-Type', value: 'application/json', enabled: false, _isAuto: true }
        ]
      })
      store.contentTypeAuto = true
      expect(store.isDirty).toBe(true)

      vi.mocked(SaveRequest).mockResolvedValueOnce({ success: true } as any)

      const result = await store.saveCurrent({ silent: true })
      expect(result).toBe(true)
      expect(store.isDirty).toBe(false)
      expect(SaveRequest).toHaveBeenCalledWith(expect.objectContaining({
        headers: [
          { key: 'Content-Type', value: 'application/json', enabled: false }
        ]
      }))
    })

    it('does not show false unsaved dot on tab when loading and switching between unmodified requests with active useUrlParamsSync (Bug 1)', async () => {
      const { toRef, nextTick } = await import('vue')
      const { GetRequest } = await import('../../../wailsjs/go/main/App')
      const { useTabStore } = await import('../tabStore')
      const { useUrlParamsSync } = await import('../../composables/useUrlParamsSync')
      const store = useRequestStore()
      const tabStore = useTabStore()

      // Attach live URL/params bi-directional sync composable as RequestEditor.vue does
      useUrlParamsSync(toRef(store, 'current'))

      tabStore.openTab({
        type: 'request',
        entityId: 'req-a',
        name: 'Request A',
        method: 'POST'
      })
      tabStore.openTab({
        type: 'request',
        entityId: 'req-b',
        name: 'Request B',
        method: 'GET'
      })

      // Request A has JSON body without explicit Content-Type header and URL with query string (triggers normalization)
      vi.mocked(GetRequest).mockResolvedValueOnce({
        success: true,
        data: createMockRequest({
          id: 'req-a',
          name: 'Request A',
          method: 'POST',
          url: 'https://api.example.com/items?page=1',
          params: [],
          headers: [],
          body: { type: 'json', content: '{"a":1}' }
        })
      } as any)

      await store.loadRequest('req-a')
      await nextTick()
      expect(store.current?.params).toEqual([{ key: 'page', value: '1', enabled: true }])
      expect(store.isDirty).toBe(false)
      expect(store.saveStatus).toBe('saved')
      expect(tabStore.tabs.find(t => t.entityId === 'req-a')?.isDirty).toBe(false)

      // Now switch to Request B without modifying Request A
      vi.mocked(GetRequest).mockResolvedValueOnce({
        success: true,
        data: createMockRequest({
          id: 'req-b',
          name: 'Request B',
          method: 'GET',
          url: 'https://api.example.com/users',
          params: [{ key: 'limit', value: '10', enabled: true }],
          headers: [],
          body: { type: 'none', content: '' }
        })
      } as any)

      await store.loadRequest('req-b')
      await nextTick()
      expect(store.current?.url).toBe('https://api.example.com/users?limit=10')
      expect(store.isDirty).toBe(false)
      expect(store.saveStatus).toBe('saved')
      expect(tabStore.tabs.find(t => t.entityId === 'req-a')?.isDirty).toBe(false)
      expect(tabStore.tabs.find(t => t.entityId === 'req-b')?.isDirty).toBe(false)
    })

    it('marks requestStore.isDirty as true when only KVPair type or options are modified', () => {
      const store = useRequestStore()
      const base = createMockRequest({
        params: [{ key: 'env', value: 'dev', enabled: true }],
        headers: [{ key: 'X-Mode', value: 'fast', enabled: true, type: 'select', options: ['fast', 'slow'] }]
      })
      store.original = JSON.parse(JSON.stringify(base))
      store.current = JSON.parse(JSON.stringify(base))
      expect(store.isDirty).toBe(false)

      // Modify only type on param
      store.current!.params[0].type = 'select'
      expect(store.isDirty).toBe(true)

      // Reset and modify only options on header
      store.current = JSON.parse(JSON.stringify(base))
      expect(store.isDirty).toBe(false)
      store.current!.headers[0].options = ['fast', 'slow', 'turbo']
      expect(store.isDirty).toBe(true)
    })

    it('manages Example Request lifecycle, local activeExampleId persistence, response cache isolation, and detach', async () => {
      const { useTabStore } = await import('../tabStore')
      const { useResponseStore } = await import('../responseStore')
      const store = useRequestStore()
      const tabStore = useTabStore()
      const resStore = useResponseStore()

      const base = createMockRequest({
        id: 'req-ex-store',
        name: 'Items',
        method: 'GET',
        url: 'https://api.example.com/items?page=1',
        params: [{ key: 'page', value: '1', enabled: true }],
        body: { type: 'none', content: '' }
      })
      vi.mocked(GetRequest).mockResolvedValueOnce({ success: true, data: base } as any)
      vi.mocked(SaveRequest).mockResolvedValue({ success: true, data: {} } as any)

      await store.loadRequest('req-ex-store')
      expect(store.activeExampleId).toBeNull()

      // Seed response for Default
      resStore.response = {
        status_code: 200,
        status_text: '200 OK',
        headers: {},
        body: '{"from":"default"}',
        time_ms: 10,
        size_bytes: 18,
        timestamp: '',
        truncated: false,
        is_binary: false
      }

      // Create Example 1 -> switches activeExampleId and isolates response cache
      const ex1 = store.createExample({ name: 'Page 2' })
      expect(ex1).not.toBeNull()
      expect(store.activeExampleId).toBe(ex1!.id)
      expect(resStore.response).toBeNull()

      // Edit unlinked params & seed Example 1 response
      store.current!.params = [{ key: 'page', value: '2', enabled: true }]
      resStore.response = {
        status_code: 201,
        status_text: '201 Created',
        headers: {},
        body: '{"from":"example1"}',
        time_ms: 12,
        size_bytes: 19,
        timestamp: '',
        truncated: false,
        is_binary: false
      }

      // Switch back to Default -> Default response restored & Default params intact
      store.selectExample(null)
      expect(store.activeExampleId).toBeNull()
      expect(resStore.response?.body).toBe('{"from":"default"}')
      expect(store.current!.params).toEqual([{ key: 'page', value: '1', enabled: true }])

      // Switch back to Example 1 -> Example 1 response and edited params restored; active_example_id NOT written to disk
      store.selectExample(ex1!.id)
      expect(resStore.response?.body).toBe('{"from":"example1"}')
      expect(store.current!.params).toEqual([{ key: 'page', value: '2', enabled: true }])

      await store.saveCurrent({ silent: true })
      const savedPayload = vi.mocked(SaveRequest).mock.calls.at(-1)?.[0] as any
      expect(savedPayload.active_example_id).toBeUndefined()
      expect(savedPayload.examples).toHaveLength(1)
      expect(savedPayload.examples[0].params).toEqual([{ key: 'page', value: '2', enabled: true }])
      expect(tabStore.responseCache['req-ex-store']).toBeDefined()
      expect(tabStore.responseCache[`req-ex-store::${ex1!.id}`]).toBeDefined()

      // Reload from disk restores activeExampleId from localStorage
      vi.mocked(GetRequest).mockResolvedValueOnce({ success: true, data: savedPayload } as any)
      await store.loadRequest('req-ex-store')
      expect(store.activeExampleId).toBe(ex1!.id)

      // Detach Example -> creates new Request & deletes example from source
      vi.mocked(CreateRequest).mockResolvedValueOnce({
        success: true,
        data: { id: 'req-detached-new', created_at: '2026-01-02T00:00:00Z' }
      } as any)
      const detachedId = await store.detachExample(ex1!.id, { newName: 'Detached Page 2' })
      expect(detachedId).toBe('req-detached-new')
      expect(store.examples).toHaveLength(0)
      expect(store.activeExampleId).toBeNull()
    })

    it('respects autoSaveEnabled=false, preserves unsaved Default URL on unlink, and syncs linked fields when saving from active Example', async () => {
      const store = useRequestStore()
      const uiStore = useUiStore()
      const base = createMockRequest({
        id: 'req-sync-edge',
        name: 'Sync Edge',
        method: 'GET',
        url: 'https://v1.example.com/items?role=base',
        params: [{ key: 'role', value: 'base', enabled: true }],
        examples: [
          {
            id: 'ex-a',
            name: 'A',
            method: 'GET',
            url: 'https://v1.example.com/items?role=ex',
            params: [{ key: 'role', value: 'ex', enabled: true }],
            path_params: [],
            headers: [],
            variables: [],
            body: { type: 'none', content: '' },
            auth: { type: 'inherit' },
            sync_flags: {
              url: true,
              method: true,
              auth: true,
              scripts: true,
              body: false,
              params: false,
              path_params: false,
              headers: false,
              variables: false
            },
            created_at: '',
            updated_at: ''
          }
        ]
      })
      vi.mocked(GetRequest).mockResolvedValueOnce({ success: true, data: base } as any)
      vi.mocked(SaveRequest).mockResolvedValue({ success: true, data: {} } as any)

      await store.loadRequest('req-sync-edge')
      uiStore.autoSaveEnabled = false

      // Edit Default URL without saving
      store.current!.url = 'https://v2.example.com/items?role=base'
      store.selectExample('ex-a')
      expect(store.current!.url).toBe('https://v2.example.com/items?role=ex')

      // Save while Example A is active -> draft.examples[0].url must sync to v2
      await store.saveCurrent({ silent: true })
      const saved = vi.mocked(SaveRequest).mock.calls.at(-1)?.[0] as any
      expect(saved.examples[0].url).toBe('https://v2.example.com/items?role=ex')

      // Edit Default URL again without saving, switch to Example, then unlink URL -> keeps v3 (does not snap back to v2)
      store.selectExample(null)
      store.current!.url = 'https://v3.example.com/items?role=base'
      store.selectExample('ex-a')
      store.setExampleSyncFlag('ex-a', 'url', false)
      expect(store.current!.url).toBe('https://v3.example.com/items?role=ex')
      expect(store.autoSaveTimer).toBeNull()
      expect(store.saveStatus).toBe('unsaved')

      // Rename, duplicate, and delete operations respect autoSaveEnabled=false
      expect(store.renameExample('ex-a', 'A Renamed')).toBe(true)
      const dup = store.duplicateExample('ex-a')
      expect(dup).not.toBeNull()
      expect(store.autoSaveTimer).toBeNull()
      expect(store.deleteExample(dup!.id)).toBe(true)
      expect(store.examples).toHaveLength(1)
    })
  })
})


