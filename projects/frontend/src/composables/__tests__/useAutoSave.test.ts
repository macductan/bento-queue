import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ref, nextTick, defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { useAutoSave } from '../useAutoSave'
import { useRequestStore, type Request } from '../../stores/requestStore'
import { SaveRequest, GetCollectionTree } from '../../../wailsjs/go/main/App'

vi.mock('../../../wailsjs/go/main/App', () => ({
  GetRequest: vi.fn(),
  SaveRequest: vi.fn(),
  GetCollectionTree: vi.fn().mockResolvedValue({ success: true, data: [] })
}))

describe('useAutoSave composable', () => {
  const createMockRequest = (overrides: Partial<Request> = {}): Request => ({
    id: 'req-1',
    name: 'Test Request',
    method: 'GET',
    url: 'https://api.example.com/items',
    headers: [],
    params: [],
    body: { type: 'none', content: '' },
    auth: { type: 'inherit' },
    created_at: '',
    updated_at: '',
    ...overrides
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(GetCollectionTree).mockResolvedValue({ success: true, data: [] } as any)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('schedules auto-save when URL changes and dirty', async () => {
    vi.useFakeTimers()
    const store = useRequestStore()
    store.original = createMockRequest({ url: 'https://api.example.com/items' })
    store.current = createMockRequest({ url: 'https://api.example.com/items' })

    const scheduleSpy = vi.spyOn(store, 'scheduleAutoSave')
    useAutoSave()

    store.current.url = 'https://api.example.com/items?q=shoes'
    await nextTick()

    expect(scheduleSpy).toHaveBeenCalledWith(800)
    expect(store.saveStatus).toBe('unsaved')
  })

  it('schedules auto-save when params, headers, body, or auth change', async () => {
    vi.useFakeTimers()
    const store = useRequestStore()
    store.original = createMockRequest()
    store.current = createMockRequest()

    const scheduleSpy = vi.spyOn(store, 'scheduleAutoSave')
    useAutoSave()

    // Params change
    store.current.params.push({ key: 'page', value: '1', enabled: true })
    await nextTick()
    expect(scheduleSpy).toHaveBeenCalledTimes(1)

    // Headers change
    store.current.headers.push({ key: 'X-Custom', value: 'test', enabled: true })
    await nextTick()
    expect(scheduleSpy).toHaveBeenCalledTimes(2)

    // Body change
    store.current.body = { type: 'json', content: '{"foo": "bar"}' }
    await nextTick()
    expect(scheduleSpy).toHaveBeenCalledTimes(3)

    // Auth change
    store.current.auth = { type: 'bearer', bearer: { token: 'secret' } }
    await nextTick()
    expect(scheduleSpy).toHaveBeenCalledTimes(4)
  })

  it('cancels auto-save and resets saveStatus to saved when changes are reverted', async () => {
    vi.useFakeTimers()
    const store = useRequestStore()
    store.original = createMockRequest({ url: 'https://api.example.com/items' })
    store.current = createMockRequest({ url: 'https://api.example.com/items' })

    const cancelSpy = vi.spyOn(store, 'cancelAutoSave')
    useAutoSave()

    // Modify
    store.current.url = 'https://api.example.com/items?changed=1'
    await nextTick()
    expect(store.isDirty).toBe(true)

    // Revert back to original
    store.current.url = 'https://api.example.com/items'
    await nextTick()
    expect(store.isDirty).toBe(false)
    expect(cancelSpy).toHaveBeenCalled()
    expect(store.saveStatus).toBe('saved')
  })

  it('flushes pending changes on component unmount', async () => {
    const store = useRequestStore()
    store.original = createMockRequest({ url: 'https://api.example.com/1' })
    store.current = createMockRequest({ url: 'https://api.example.com/2' })
    expect(store.isDirty).toBe(true)

    const flushSpy = vi.spyOn(store, 'flush').mockResolvedValue(true)

    const TestComponent = defineComponent({
      setup() {
        useAutoSave()
        return {}
      },
      template: '<div>test</div>'
    })

    const wrapper = mount(TestComponent)
    wrapper.unmount()

    expect(flushSpy).toHaveBeenCalledTimes(1)
  })

  it('cancels auto-save on component unmount when not dirty', async () => {
    const store = useRequestStore()
    store.original = createMockRequest({ url: 'https://api.example.com/1' })
    store.current = createMockRequest({ url: 'https://api.example.com/1' })
    expect(store.isDirty).toBe(false)

    const cancelSpy = vi.spyOn(store, 'cancelAutoSave')
    const flushSpy = vi.spyOn(store, 'flush')

    const TestComponent = defineComponent({
      setup() {
        useAutoSave()
        return {}
      },
      template: '<div>test</div>'
    })

    const wrapper = mount(TestComponent)
    wrapper.unmount()

    expect(cancelSpy).toHaveBeenCalled()
    expect(flushSpy).not.toHaveBeenCalled()
  })

  it('triggers silent saveCurrent after debounce delay', async () => {
    vi.useFakeTimers()
    const store = useRequestStore()
    store.original = createMockRequest({ url: 'https://api.example.com/1' })
    store.current = createMockRequest({ url: 'https://api.example.com/1' })

    vi.mocked(SaveRequest).mockResolvedValueOnce({ success: true } as any)
    const saveCurrentSpy = vi.spyOn(store, 'saveCurrent')

    useAutoSave()

    store.current.url = 'https://api.example.com/modified'
    await nextTick()

    expect(saveCurrentSpy).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(800)

    expect(saveCurrentSpy).toHaveBeenCalledWith({ silent: true })
  })

  it('does not schedule debounced save when uiStore.autoSaveEnabled is false', async () => {
    vi.useFakeTimers()
    const { useUiStore } = await import('../../stores/uiStore')
    const uiStore = useUiStore()
    uiStore.setAutoSaveEnabled(false)

    const store = useRequestStore()
    store.original = createMockRequest({ url: 'https://api.example.com/1' })
    store.current = createMockRequest({ url: 'https://api.example.com/1' })

    const scheduleSpy = vi.spyOn(store, 'scheduleAutoSave')
    const saveCurrentSpy = vi.spyOn(store, 'saveCurrent')

    useAutoSave()

    store.current.url = 'https://api.example.com/modified'
    await nextTick()

    expect(scheduleSpy).not.toHaveBeenCalled()
    expect(store.saveStatus).toBe('unsaved')

    await vi.advanceTimersByTimeAsync(1000)
    expect(saveCurrentSpy).not.toHaveBeenCalled()
  })
})
