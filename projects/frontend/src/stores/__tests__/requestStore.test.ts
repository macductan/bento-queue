import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useRequestStore } from '../requestStore'
import { useUiStore } from '../uiStore'
import { GetRequest, SaveRequest, GetCollectionTree } from '../../../wailsjs/go/main/App'
import { createMockRequest } from './utils'

// Mock wails calls
vi.mock('../../../wailsjs/go/main/App', () => ({
  GetRequest: vi.fn(),
  SaveRequest: vi.fn(),
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
  })
})
