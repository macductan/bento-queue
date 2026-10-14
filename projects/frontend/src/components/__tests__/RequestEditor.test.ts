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

  it('provides effectiveVariables computed via 4-tier hierarchy to child components', async () => {
    const { useCollectionStore } = await import('@/stores/collectionStore')
    const { useEnvironmentStore } = await import('@/stores/environmentStore')
    const collectionStore = useCollectionStore()
    const envStore = useEnvironmentStore()
    const requestStore = useRequestStore()

    // 1. Collection Env
    collectionStore.collections = [
      {
        id: 'c1',
        name: 'Test Coll',
        variables: [{ key: 'apiUrl', value: 'https://base.api', enabled: true }]
      } as any
    ]
    collectionStore.activeCollectionId = 'c1'

    // 2. Global Env
    envStore.environments = [
      {
        id: 'env-dev',
        name: 'Dev',
        variables: [{ key: 'apiUrl', value: 'https://dev.api', enabled: true }]
      } as any
    ]
    envStore.activeEnvId = 'env-dev'

    // 3. Tree with Folder-Env
    collectionStore.tree = [
      {
        id: 'f1',
        name: 'Auth',
        type: 'folder',
        path: '/coll/f1',
        created_at: '',
        folder_envs: {
          'env-dev': [{ key: 'apiUrl', value: 'https://custom.dev.api', enabled: true }]
        },
        children: [
          {
            id: 'req-1',
            name: 'Get Users',
            type: 'request',
            path: '/coll/f1/users.json',
            created_at: ''
          }
        ]
      }
    ]

    requestStore.current = createMockRequest({ id: 'req-1' })
    const wrapper = mountEditor()
    const provided = (wrapper.vm as any).effectiveVariables
    expect(provided.get('apiUrl')).toBe('https://custom.dev.api')
  })

  it('toggleDefaultHeader toggles enabled on _isAuto header instead of removing it', () => {
    const store = useRequestStore()
    store.current = createMockRequest({
      body: { type: 'json', content: '{"a":1}' },
      headers: [
        { key: 'Content-Type', value: 'application/json', enabled: true, _isAuto: true }
      ]
    })

    const wrapper = mountEditor()
    const vm = wrapper.vm as any

    // Disable auto Content-Type header
    vm.toggleDefaultHeader({
      key: 'Content-Type',
      value: 'application/json',
      enabled: true,
      overridden: false,
      isAuto: true
    })
    expect(store.current.headers.length).toBe(1)
    expect(store.current.headers[0]).toEqual({
      key: 'Content-Type',
      value: 'application/json',
      enabled: false,
      _isAuto: true
    })

    // Re-enable auto Content-Type header
    vm.toggleDefaultHeader({
      key: 'Content-Type',
      value: 'application/json',
      enabled: false,
      overridden: false,
      isAuto: true
    })
    expect(store.current.headers.length).toBe(1)
    expect(store.current.headers[0]).toEqual({
      key: 'Content-Type',
      value: 'application/json',
      enabled: true,
      _isAuto: true
    })
  })
})

