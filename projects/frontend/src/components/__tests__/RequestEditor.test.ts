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

  it('resolves 4-tier variables in inherited folder headers for defaultHeaders while preserving rawValue on toggleDefaultHeader', async () => {
    const { useCollectionStore } = await import('@/stores/collectionStore')
    const { useEnvironmentStore } = await import('@/stores/environmentStore')
    const collectionStore = useCollectionStore()
    const envStore = useEnvironmentStore()
    const requestStore = useRequestStore()

    collectionStore.collections = [
      {
        id: 'Test-Collection',
        name: 'Test-Collection',
        variables: [{ key: 'apiUrl', value: 'https://coll.api', enabled: true }]
      } as any
    ]
    collectionStore.activeCollectionId = 'Test-Collection'

    envStore.environments = [
      {
        id: 'env-dev',
        name: 'Dev',
        variables: [{ key: 'apiUrl', value: 'https://dev.api', enabled: true }]
      } as any
    ]
    envStore.activeEnvId = 'env-dev'

    collectionStore.tree = [
      {
        id: 'f1',
        name: 'Auth',
        type: 'folder',
        path: '/coll/f1',
        created_at: '',
        headers: [{ key: 'X-Upstream', value: '{{apiUrl}}/v1', enabled: true }],
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

    requestStore.current = createMockRequest({ id: 'req-1', headers: [] })
    const wrapper = mountEditor()
    const vm = wrapper.vm as any

    const upstreamHeader = vm.defaultHeaders.find((h: any) => h.key === 'X-Upstream')
    expect(upstreamHeader).toBeDefined()
    expect(upstreamHeader.value).toBe('https://custom.dev.api/v1')
    expect(upstreamHeader.rawValue).toBe('{{apiUrl}}/v1')

    vm.toggleDefaultHeader(upstreamHeader)
    expect(requestStore.current.headers).toEqual([
      {
        key: 'X-Upstream',
        value: '{{apiUrl}}/v1',
        enabled: false
      }
    ])
  })

  it('renders inline Body type dropdown in RequestTabs and switches to Body tab without radio buttons in BodyEditor', async () => {
    const RequestTabs = (await import('../RequestTabs.vue')).default
    const BodyEditor = (await import('../BodyEditor.vue')).default
    const { useUiStore } = await import('@/stores/uiStore')

    const requestStore = useRequestStore()
    const uiStore = useUiStore()
    requestStore.current = createMockRequest({
      body: { type: 'none', content: '' },
      headers: []
    })
    uiStore.activeRequestTab = 'params'

    const tabsWrapper = mount(RequestTabs)
    const select = tabsWrapper.find('[data-test="body-type-select"]')
    expect(select.exists()).toBe(true)
    expect((select.element as HTMLSelectElement).value).toBe('none')

    // Change body type to 'json' from RequestTabs while on 'params' tab
    await select.setValue('json')
    expect(requestStore.current.body.type).toBe('json')
    expect(uiStore.activeRequestTab).toBe('body')
    expect(
      requestStore.current.headers.some(
        h => h.key.toLowerCase() === 'content-type' && h.value === 'application/json'
      )
    ).toBe(true)

    // Verify BodyEditor has no radiogroup and supports Tab + Ctrl+Z undo
    const bodyWrapper = mount(BodyEditor)
    expect(bodyWrapper.find('[role="radiogroup"]').exists()).toBe(false)
    const textarea = bodyWrapper.find('textarea')
    expect(textarea.exists()).toBe(true)

    await textarea.setValue('{\n}')
    const el = textarea.element as HTMLTextAreaElement
    el.setSelectionRange(2, 2)
    await textarea.trigger('keydown.tab')
    expect(requestStore.current.body.content).toBe('{\n  }')
  })

  it('displays resolved multiline cURL command in the cURL tab with 4-tier variables resolved', async () => {
    const RequestTabs = (await import('../RequestTabs.vue')).default
    const { useCollectionStore } = await import('@/stores/collectionStore')
    const { useEnvironmentStore } = await import('@/stores/environmentStore')
    const { useUiStore } = await import('@/stores/uiStore')

    const collectionStore = useCollectionStore()
    const envStore = useEnvironmentStore()
    const requestStore = useRequestStore()
    const uiStore = useUiStore()

    collectionStore.collections = [
      {
        id: 'Test-Collection',
        name: 'Test-Collection',
        variables: [{ key: 'host', value: 'col.example.com', enabled: true }]
      } as any
    ]
    collectionStore.activeCollectionId = 'Test-Collection'

    envStore.environments = [
      {
        id: 'env-1',
        name: 'Staging',
        variables: [{ key: 'host', value: 'staging.example.com', enabled: true }]
      } as any
    ]
    envStore.activeEnvId = 'env-1'

    requestStore.current = createMockRequest({
      id: 'req-curl-tab',
      method: 'POST',
      url: 'https://{{host}}/v1/orders',
      headers: [{ key: 'X-Api-Version', value: '2026', enabled: true }],
      body: { type: 'json', content: '{"item":"{{host}}"}' }
    })

    const tabsWrapper = mount(RequestTabs)
    const curlTabBtn = tabsWrapper.find('#tab-curl')
    expect(curlTabBtn.exists()).toBe(true)
    await curlTabBtn.trigger('click')
    expect(uiStore.activeRequestTab).toBe('curl')

    const editorWrapper = mountEditor()
    const previewPanel = editorWrapper.find('[data-test="curl-preview-panel"]')
    expect(previewPanel.exists()).toBe(true)
    const codeText = editorWrapper.find('[data-test="curl-preview-code"]').text()
    expect(codeText).toContain('curl -X POST \\')
    expect(codeText).toContain("'https://staging.example.com/v1/orders'")
    expect(codeText).toContain("-H 'X-Api-Version: 2026'")
    expect(codeText).toContain('--data-raw \'{"item":"staging.example.com"}\'')
  })

  it('highlights JSON syntax tokens alongside {{variable}} pills, prettifies JSON, and reports syntax errors in BodyEditor', async () => {
    const BodyEditor = (await import('../BodyEditor.vue')).default
    const requestStore = useRequestStore()

    requestStore.current = createMockRequest({
      body: {
        type: 'json',
        content: '{"name":"{{user_name}}","count":10,"active":true}'
      }
    })

    const wrapper = mount(BodyEditor)

    // Verify JSON syntax tokens and variable pills coexist
    expect(wrapper.findAll('[data-json-token="key"]').length).toBeGreaterThanOrEqual(3)
    expect(wrapper.findAll('[data-json-token="number"]').length).toBe(1)
    expect(wrapper.findAll('[data-json-token="boolean"]').length).toBe(1)
    expect(wrapper.text()).toContain('{{user_name}}')
    expect(wrapper.find('[data-test="json-valid-badge"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="json-error-banner"]').exists()).toBe(false)

    // Prettify JSON
    const prettifyBtn = wrapper.find('[data-test="prettify-json-btn"]')
    expect(prettifyBtn.exists()).toBe(true)
    await prettifyBtn.trigger('click')
    expect(requestStore.current.body.content).toBe(
      '{\n  "name": "{{user_name}}",\n  "count": 10,\n  "active": true\n}'
    )

    // Introduce syntax error
    const textarea = wrapper.find('textarea')
    await textarea.setValue('{\n  "name": "Alice",\n  "broken": \n}')
    const errorBanner = wrapper.find('[data-test="json-error-banner"]')
    expect(errorBanner.exists()).toBe(true)
    expect(errorBanner.text()).toContain('dòng')
  })

  it('supports switching body types between xml, urlencoded, and formdata with auto Content-Type and KvpEditor rendering', async () => {
    const RequestTabs = (await import('../RequestTabs.vue')).default
    const BodyEditor = (await import('../BodyEditor.vue')).default
    const requestStore = useRequestStore()

    requestStore.current = createMockRequest({
      body: { type: 'none', content: '' },
      headers: []
    })

    const tabsWrapper = mount(RequestTabs)
    const bodyWrapper = mount(BodyEditor)
    const select = tabsWrapper.find('[data-test="body-type-select"]')

    // Switch to xml
    await select.setValue('xml')
    expect(requestStore.current.body.type).toBe('xml')
    expect(
      requestStore.current.headers.some(
        h => h.key.toLowerCase() === 'content-type' && h.value === 'application/xml'
      )
    ).toBe(true)
    expect(bodyWrapper.find('textarea').exists()).toBe(true)

    // Switch to urlencoded
    await select.setValue('urlencoded')
    expect(requestStore.current.body.type).toBe('urlencoded')
    expect(
      requestStore.current.headers.some(
        h => h.key.toLowerCase() === 'content-type' && h.value === 'application/x-www-form-urlencoded'
      )
    ).toBe(true)
    expect(bodyWrapper.find('[data-test="body-urlencoded-editor"]').exists()).toBe(true)

    // Switch to formdata
    await select.setValue('formdata')
    expect(requestStore.current.body.type).toBe('formdata')
    expect(
      requestStore.current.headers.some(
        h => h.key.toLowerCase() === 'content-type' && h.value === 'multipart/form-data'
      )
    ).toBe(true)
    expect(bodyWrapper.find('[data-test="body-formdata-editor"]').exists()).toBe(true)
  })

  it('switches to Scripts tab and edits pre-request and post-response scripts with execution log output', async () => {
    const RequestTabs = (await import('../RequestTabs.vue')).default
    const ScriptEditor = (await import('../ScriptEditor.vue')).default
    const { useUiStore } = await import('@/stores/uiStore')
    const { useResponseStore } = await import('@/stores/responseStore')
    const requestStore = useRequestStore()
    const uiStore = useUiStore()
    const responseStore = useResponseStore()

    requestStore.current = createMockRequest({
      scripts: { pre_request: '', post_response: '' }
    })

    const tabsWrapper = mount(RequestTabs)
    const scriptsTabBtn = tabsWrapper.find('#tab-scripts')
    expect(scriptsTabBtn.exists()).toBe(true)
    await scriptsTabBtn.trigger('click')
    expect(uiStore.activeRequestTab).toBe('scripts')

    const scriptWrapper = mount(ScriptEditor)
    const preInput = scriptWrapper.find('[data-test="pre-request-script-input"]')
    const postInput = scriptWrapper.find('[data-test="post-response-script-input"]')
    expect(preInput.exists()).toBe(true)
    expect(postInput.exists()).toBe(true)

    await preInput.setValue("ha.environment.set('NONCE', '123');")
    await postInput.setValue("const d = ha.response.json();")

    expect(requestStore.current.scripts?.pre_request).toBe("ha.environment.set('NONCE', '123');")
    expect(requestStore.current.scripts?.post_response).toBe("const d = ha.response.json();")

    responseStore.scriptLogs = ['[Pre-request] hello script']
    responseStore.scriptError = 'Post-response script error: unexpected token'
    await scriptWrapper.vm.$nextTick()

    const outputBox = scriptWrapper.find('[data-test="script-execution-output"]')
    expect(outputBox.exists()).toBe(true)
    expect(outputBox.text()).toContain('[Pre-request] hello script')
    expect(outputBox.text()).toContain('Post-response script error: unexpected token')
  })

  it('normalizes smart quotes/fullwidth brackets on input, displays inline amber error indicator, and supports JSONC badge + format + strip on send (Bugs 6, 7 & Enh 8)', async () => {
    const BodyEditor = (await import('../BodyEditor.vue')).default
    const { buildExecuteRequest } = await import('@/utils/buildExecuteRequest')
    const requestStore = useRequestStore()

    requestStore.current = createMockRequest({
      method: 'POST',
      url: 'https://api.example.com/items',
      body: { type: 'json', content: '' }
    })

    const wrapper = mount(BodyEditor)
    const textarea = wrapper.find('textarea')
    expect(textarea.exists()).toBe(true)
    expect(textarea.attributes('autocorrect')).toBe('off')
    expect(textarea.attributes('autocapitalize')).toBe('off')

    // Simulate OS smart quotes / fullwidth braces input
    const el = textarea.element as HTMLTextAreaElement
    el.value = '｛\u201Cname\u201D: \u201CHecto\u201D｝'
    el.setSelectionRange(el.value.length, el.value.length)
    await textarea.trigger('input')
    expect(el.value).toBe('{"name": "Hecto"}')
    expect(requestStore.current.body.content).toBe('{"name": "Hecto"}')

    // Verify JSONC badge and formatting preserves comments & trailing commas
    await textarea.setValue('{\n// user comment\n"name": "Hecto",\n}')
    const badge = wrapper.find('[data-test="json-valid-badge"]')
    expect(badge.text()).toContain('✓ JSONC')

    await wrapper.find('[data-test="prettify-json-btn"]').trigger('click')
    expect(requestStore.current.body.content).toContain('// user comment')
    expect(requestStore.current.body.content).toContain('"name": "Hecto",')

    // Verify buildExecuteRequest strips JSONC comments and trailing commas before sending
    const payload = buildExecuteRequest(requestStore.current, new Map<string, string>())
    expect(JSON.parse(payload.body)).toEqual({ name: 'Hecto' })
    expect(payload.body).not.toContain('// user comment')

    // Verify invalid JSON shows inline amber error span (not red box) and amber border
    await textarea.setValue('{"broken": }')
    const errSpan = wrapper.find('[data-test="json-error-banner"]')
    expect(errSpan.exists()).toBe(true)
    expect(errSpan.element.tagName.toLowerCase()).toBe('span')
    expect(errSpan.classes()).toContain('text-amber-400/70')
    expect(wrapper.html()).toContain('border-amber-500/40')
  })

  it('applies compact vertical spacing classes to maximize Body Editor area', () => {
    const store = useRequestStore()
    store.current = createMockRequest()

    const wrapper = mountEditor()
    const root = wrapper.find('.h-full.flex.flex-col')
    expect(root.classes()).toContain('px-3')
    expect(root.classes()).toContain('pb-0')
    expect(root.classes()).not.toContain('p-4')

    const reqCol = wrapper.find('.flex-1.flex.flex-col.min-h-0')
    expect(reqCol.classes()).toContain('space-y-2')
    expect(reqCol.classes()).not.toContain('space-y-6')
  })
})


