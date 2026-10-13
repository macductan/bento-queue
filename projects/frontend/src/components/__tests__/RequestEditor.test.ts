import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import RequestEditor from '../RequestEditor.vue'
import { useRequestStore, type Request } from '@/stores/requestStore'

vi.mock('../../../wailsjs/go/main/App', () => ({
  GetRequest: vi.fn(),
  SaveRequest: vi.fn(),
  GetCollectionTree: vi.fn().mockResolvedValue({ success: true, data: [] }),
  ListEnvironments: vi.fn().mockResolvedValue({ success: true, data: [] })
}))

describe('RequestEditor.vue - Save State Indicator', () => {
  const createMockRequest = (overrides: Partial<Request> = {}): Request => ({
    id: 'req-1',
    name: 'Get Products API',
    method: 'GET',
    url: 'https://api.example.com/products',
    headers: [],
    params: [],
    body: { type: 'none', content: '' },
    auth: { type: 'inherit' },
    created_at: '2026-10-13',
    updated_at: '2026-10-13',
    ...overrides
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  const mountEditor = () => {
    return mount(RequestEditor, {
      global: {
        stubs: {
          UrlBar: true,
          RequestTabs: true,
          KvpEditor: true,
          BodyEditor: true,
          WarningBanner: true,
          DefaultHeadersTable: true,
          AuthEditor: true
        }
      }
    })
  }

  it('renders "Đã lưu" state with checkmark icon when data is clean/saved', () => {
    const store = useRequestStore()
    store.current = createMockRequest()
    store.original = createMockRequest()
    store.saveStatus = 'saved'

    const wrapper = mountEditor()
    const indicator = wrapper.find('[data-test="save-state-indicator"]')
    expect(indicator.exists()).toBe(true)
    expect(indicator.attributes('data-status')).toBe('saved')
    expect(indicator.text()).toContain('Đã lưu')
    expect(indicator.find('svg').exists()).toBe(true)
  })

  it('renders "Chưa lưu" state with warning dot when request is unsaved/dirty', () => {
    const store = useRequestStore()
    store.original = createMockRequest()
    store.current = createMockRequest({ url: 'https://api.example.com/products?category=books' })
    store.saveStatus = 'unsaved'

    const wrapper = mountEditor()
    const indicator = wrapper.find('[data-test="save-state-indicator"]')
    expect(indicator.exists()).toBe(true)
    expect(indicator.attributes('data-status')).toBe('unsaved')
    expect(indicator.text()).toContain('Chưa lưu')
    expect(indicator.find('.bg-unsaved-dot').exists()).toBe(true)
  })

  it('renders "Đang lưu..." state with spinner icon while save is in progress', () => {
    const store = useRequestStore()
    store.original = createMockRequest()
    store.current = createMockRequest({ url: 'https://api.example.com/products?category=books' })
    store.saveStatus = 'saving'

    const wrapper = mountEditor()
    const indicator = wrapper.find('[data-test="save-state-indicator"]')
    expect(indicator.exists()).toBe(true)
    expect(indicator.attributes('data-status')).toBe('saving')
    expect(indicator.text()).toContain('Đang lưu...')
    expect(indicator.find('svg.animate-spin').exists()).toBe(true)
  })

  it('renders "Lỗi khi lưu" state with red dot when save fails', () => {
    const store = useRequestStore()
    store.original = createMockRequest()
    store.current = createMockRequest({ url: 'https://api.example.com/products?category=books' })
    store.saveStatus = 'error'

    const wrapper = mountEditor()
    const indicator = wrapper.find('[data-test="save-state-indicator"]')
    expect(indicator.exists()).toBe(true)
    expect(indicator.attributes('data-status')).toBe('error')
    expect(indicator.text()).toContain('Lỗi khi lưu')
    expect(indicator.find('.bg-red-500').exists()).toBe(true)
  })
})
