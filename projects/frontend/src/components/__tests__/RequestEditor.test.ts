import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import RequestEditor from '../RequestEditor.vue'
import { useRequestStore, type Request } from '@/stores/requestStore'
import { useCollectionStore } from '@/stores/collectionStore'
import { useUiStore } from '@/stores/uiStore'

vi.mock('../../../wailsjs/go/main/App', () => ({
  GetRequest: vi.fn(),
  SaveRequest: vi.fn(),
  RenameRequest: vi.fn(),
  RenameFolder: vi.fn(),
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
    useUiStore().setLocale('vi')
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

  it('clicking folder in breadcrumb calls collectionStore.selectFolder', async () => {
    const colStore = useCollectionStore()
    colStore.collections = [{ id: 'col-1', name: 'My API Collection', is_default: true } as any]
    colStore.activeCollectionId = 'col-1'
    colStore.tree = [
      {
        id: 'f-auth',
        name: 'Auth Folder',
        type: 'folder',
        path: 'auth',
        created_at: '',
        children: [
          {
            id: 'req-login',
            name: 'Login User',
            type: 'request',
            method: 'POST',
            path: 'auth/login',
            url: 'https://api.example.com/v1/auth/tokens',
            body: { type: 'none', content: '' },
            created_at: ''
          }
        ]
      }
    ]

    const reqStore = useRequestStore()
    reqStore.current = createMockRequest({ id: 'req-login', name: 'Login User' })
    const selectFolderSpy = vi.spyOn(colStore, 'selectFolder').mockResolvedValue()

    const wrapper = mountEditor()
    const folderBtn = wrapper.find('[data-test="breadcrumb-folder"]')
    expect(folderBtn.exists()).toBe(true)
    expect(folderBtn.text()).toBe('Auth Folder')
    expect(folderBtn.attributes('data-folder-id')).toBe('f-auth')

    await folderBtn.trigger('click')
    expect(selectFolderSpy).toHaveBeenCalledWith('f-auth')
  })

  it('clicking request in breadcrumb calls collectionStore.revealNodeInTree', async () => {
    const colStore = useCollectionStore()
    colStore.collections = [{ id: 'col-1', name: 'My API Collection', is_default: true } as any]
    colStore.activeCollectionId = 'col-1'
    colStore.tree = [
      {
        id: 'req-1',
        name: 'Get Products API',
        type: 'request',
        method: 'GET',
        path: 'products',
        url: 'https://api.example.com/products',
        body: { type: 'none', content: '' },
        created_at: ''
      }
    ]

    const reqStore = useRequestStore()
    reqStore.current = createMockRequest({ id: 'req-1', name: 'Get Products API' })
    const revealSpy = vi.spyOn(colStore, 'revealNodeInTree').mockResolvedValue()

    const wrapper = mountEditor()
    const reqBtn = wrapper.find('[data-test="breadcrumb-request"]')
    expect(reqBtn.exists()).toBe(true)
    expect(reqBtn.text()).toBe('Get Products API')

    await reqBtn.trigger('click')
    expect(revealSpy).toHaveBeenCalledWith('req-1')
  })

  it('supports inline rename on Breadcrumb via rename button or double-click and manual Save via request-save-btn', async () => {
    const colStore = useCollectionStore()
    const reqStore = useRequestStore()
    reqStore.current = createMockRequest({ id: 'req-1', name: 'Get Products API' })
    reqStore.original = createMockRequest({ id: 'req-1', name: 'Get Products API' })

    const renameNodeSpy = vi.spyOn(colStore, 'renameNode').mockResolvedValue(true)
    const saveCurrentSpy = vi.spyOn(reqStore, 'saveCurrent').mockResolvedValue(true)

    const wrapper = mountEditor()

    // Click rename pencil button
    const renameBtn = wrapper.find('[data-test="breadcrumb-rename-btn"]')
    expect(renameBtn.exists()).toBe(true)
    await renameBtn.trigger('click')

    const nameInput = wrapper.find('[data-test="breadcrumb-name-input"]')
    expect(nameInput.exists()).toBe(true)
    expect((nameInput.element as HTMLInputElement).value).toBe('Get Products API')

    // Escape cancels rename
    await nameInput.setValue('Temporary Name')
    await nameInput.trigger('keydown.esc')
    expect(wrapper.find('[data-test="breadcrumb-name-input"]').exists()).toBe(false)
    expect(renameNodeSpy).not.toHaveBeenCalled()

    // Double-click breadcrumb request name opens input and Enter commits rename
    await wrapper.find('[data-test="breadcrumb-request"]').trigger('dblclick')
    const nameInput2 = wrapper.find('[data-test="breadcrumb-name-input"]')
    expect(nameInput2.exists()).toBe(true)
    await nameInput2.setValue('  Updated Products API  ')
    await nameInput2.trigger('keydown.enter')

    expect(renameNodeSpy).toHaveBeenCalledWith('req-1', 'Updated Products API', 'request')
    expect(reqStore.current.name).toBe('Updated Products API')

    // Unchanged or blank name on blur is a no-op
    renameNodeSpy.mockClear()
    await wrapper.find('[data-test="breadcrumb-rename-btn"]').trigger('click')
    const nameInput3 = wrapper.find('[data-test="breadcrumb-name-input"]')
    await nameInput3.setValue('   ')
    await nameInput3.trigger('blur')
    expect(renameNodeSpy).not.toHaveBeenCalled()
    expect(reqStore.current.name).toBe('Updated Products API')

    // Blur commits valid new name
    await wrapper.find('[data-test="breadcrumb-rename-btn"]').trigger('click')
    const nameInput4 = wrapper.find('[data-test="breadcrumb-name-input"]')
    await nameInput4.setValue('Blurred Products API')
    await nameInput4.trigger('blur')
    expect(renameNodeSpy).toHaveBeenCalledWith('req-1', 'Blurred Products API', 'request')
    expect(reqStore.current.name).toBe('Blurred Products API')

    // When renameNode returns false, reqStore.current.name is NOT overwritten
    renameNodeSpy.mockResolvedValueOnce(false)
    await wrapper.find('[data-test="breadcrumb-rename-btn"]').trigger('click')
    const nameInput5 = wrapper.find('[data-test="breadcrumb-name-input"]')
    await nameInput5.setValue('Failed Rename')
    await nameInput5.trigger('keydown.enter')
    expect(reqStore.current.name).toBe('Blurred Products API')

    // Manual save button triggers saveNow() -> requestStore.saveCurrent()
    const saveBtn = wrapper.find('[data-test="request-save-btn"]')
    expect(saveBtn.exists()).toBe(true)
    expect(saveBtn.text()).toContain('Lưu')
    expect(saveBtn.text()).toContain('Ctrl+S')
    await saveBtn.trigger('click')
    expect(saveCurrentSpy).toHaveBeenCalledTimes(1)
  })

  it('collectionStore.renameNode delegates to RenameRequest and RenameFolder and guards against blank input', async () => {
    const { RenameRequest, RenameFolder } = await import('../../../wailsjs/go/main/App')
    const colStore = useCollectionStore()
    const reqStore = useRequestStore()

    reqStore.current = createMockRequest({ id: 'req-direct', name: 'Old Req' })
    reqStore.original = createMockRequest({ id: 'req-direct', name: 'Old Req' })

    // Blank guard
    expect(await colStore.renameNode('req-direct', '   ', 'request')).toBe(false)
    expect(RenameRequest).not.toHaveBeenCalled()

    // Request rename success
    vi.mocked(RenameRequest).mockResolvedValueOnce({
      success: true,
      data: { id: 'req-direct', name: 'New Req' }
    } as any)
    expect(await colStore.renameNode('req-direct', '  New Req  ', 'request')).toBe(true)
    expect(RenameRequest).toHaveBeenCalledWith('req-direct', 'New Req')
    expect(reqStore.current.name).toBe('New Req')
    expect(reqStore.original.name).toBe('New Req')

    // Folder rename success
    vi.mocked(RenameFolder).mockResolvedValueOnce({
      success: true,
      data: { id: 'f-direct', name: 'New Folder' }
    } as any)
    expect(await colStore.renameNode('f-direct', '  New Folder ', 'folder')).toBe(true)
    expect(RenameFolder).toHaveBeenCalledWith('f-direct', 'New Folder')
  })

  it('renders WarningBanner with switch-body-none-btn and dismiss-warning-btn, and re-arms on body/method/request change', async () => {
    const WarningBanner = (await import('../WarningBanner.vue')).default
    const reqStore = useRequestStore()
    reqStore.current = createMockRequest({
      id: 'req-warn',
      method: 'GET',
      body: { type: 'json', content: '{"a":1}' }
    })

    const wrapper = mount(WarningBanner)
    expect(wrapper.find('[data-test="get-body-warning-banner"]').exists()).toBe(true)

    // Dismiss hides banner
    await wrapper.find('[data-test="dismiss-warning-btn"]').trigger('click')
    expect(wrapper.find('[data-test="get-body-warning-banner"]').exists()).toBe(false)

    // Switching method to POST then back to GET re-arms warning on same request
    reqStore.current.method = 'POST'
    await wrapper.vm.$nextTick()
    reqStore.current.method = 'GET'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-test="get-body-warning-banner"]').exists()).toBe(true)

    // Dismiss again, then switch request ID -> re-arms
    await wrapper.find('[data-test="dismiss-warning-btn"]').trigger('click')
    expect(wrapper.find('[data-test="get-body-warning-banner"]').exists()).toBe(false)
    reqStore.current = createMockRequest({
      id: 'req-warn-2',
      method: 'GET',
      body: { type: 'text', content: 'hello' }
    })
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-test="get-body-warning-banner"]').exists()).toBe(true)

    const switchBtn = wrapper.find('[data-test="switch-body-none-btn"]')
    expect(switchBtn.exists()).toBe(true)
    expect(switchBtn.text()).toContain('Chuyển Body sang None')

    await switchBtn.trigger('click')
    expect(reqStore.current.body.type).toBe('none')
    expect(wrapper.find('[data-test="get-body-warning-banner"]').exists()).toBe(false)
  })

  it('displays dynamic badges on RequestTabs (tab-params-badge, tab-auth-badge with auth_envs, tab-headers-badge excluding disabled, tab-body-badge, tab-scripts-badge)', async () => {
    const RequestTabs = (await import('../RequestTabs.vue')).default
    const { useEnvironmentStore } = await import('@/stores/environmentStore')
    const colStore = useCollectionStore()
    const reqStore = useRequestStore()
    const envStore = useEnvironmentStore()

    colStore.tree = [
      {
        id: 'f1',
        name: 'API Folder',
        type: 'folder',
        path: 'api',
        created_at: '',
        headers: [{ key: 'X-Inherited-Folder', value: 'v1', enabled: true }],
        children: [
          {
            id: 'req-badges',
            name: 'Badge Req',
            type: 'request',
            path: 'api/badge',
            created_at: ''
          }
        ]
      }
    ]

    reqStore.current = createMockRequest({
      id: 'req-badges',
      method: 'POST',
      params: [
        { key: 'page', value: '1', enabled: true },
        { key: 'disabled_param', value: '0', enabled: false }
      ],
      path_params: [
        { key: 'id', value: '42', enabled: true },
        { key: 'disabled_path', value: '99', enabled: false }
      ],
      auth: { type: 'bearer', bearer: { token: 'tok' } },
      headers: [
        { key: 'X-Custom', value: 'abc', enabled: true },
        { key: 'X-Disabled-Custom', value: 'nope', enabled: false }
      ],
      body: { type: 'json', content: '{}' },
      scripts: { pre_request: 'console.log(1);', post_response: '' }
    })

    const wrapper = mount(RequestTabs)
    expect(wrapper.find('[data-test="tab-params-badge"]').text()).toBe('2')
    expect(wrapper.find('[data-test="tab-auth-badge"]').text()).toBe('bearer')
    // 1 enabled custom header (X-Custom) + 1 inherited folder header (X-Inherited-Folder) + 1 auth header (Authorization) + 1 auto header (Content-Type) = 4
    expect(wrapper.find('[data-test="tab-headers-badge"]').text()).toBe('4')
    expect(wrapper.find('[data-test="tab-body-badge"]').text()).toBe('json')
    expect(wrapper.find('[data-test="tab-scripts-badge"]').exists()).toBe(true)

    // Test auth_envs override when auth.type is 'inherit'
    envStore.activeEnvId = 'env-prod'
    reqStore.current.auth = { type: 'inherit' }
    reqStore.current.auth_envs = {
      'env-prod': { type: 'apiKey', apiKey: { key: 'X-Key', value: '123', addTo: 'header' } }
    }
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-test="tab-auth-badge"]').text()).toBe('apiKey')
  })

  it('toggles Hide Auth on cURL tab to hide/restore auth in preview and clipboard copy, and updates localized label', async () => {
    const { useCollectionStore } = await import('@/stores/collectionStore')
    const { useUiStore } = await import('@/stores/uiStore')

    const colStore = useCollectionStore()
    const requestStore = useRequestStore()
    const uiStore = useUiStore()

    colStore.collections = [
      {
        id: 'col-1',
        name: 'Auth Coll',
        auth: { type: 'bearer', bearer: { token: 'coll-secret' } }
      } as any
    ]
    colStore.activeCollectionId = 'col-1'
    colStore.tree = [
      {
        id: 'f-auth',
        name: 'Auth Folder',
        type: 'folder',
        path: 'auth',
        created_at: '',
        headers: [{ key: 'Proxy-Authorization', value: 'Basic proxy123', enabled: true }],
        children: [
          {
            id: 'req-curl-auth',
            name: 'Get Protected',
            type: 'request',
            path: 'auth/protected',
            created_at: ''
          }
        ]
      }
    ]

    requestStore.current = createMockRequest({
      id: 'req-curl-auth',
      method: 'POST',
      url: 'https://api.example.com/v1/protected?api_key=q-secret&page=2#sec',
      auth: { type: 'apiKey', apiKey: { key: 'api_key', value: 'q-secret', addTo: 'query' } },
      params: [
        { key: 'api_key', value: 'q-secret', enabled: true },
        { key: 'page', value: '2', enabled: true }
      ],
      headers: [
        { key: 'Authorization', value: 'Bearer manual-token', enabled: true },
        { key: 'X-Trace', value: 'trace-42', enabled: true }
      ],
      body: { type: 'json', content: '{"hello":"world"}' }
    })

    uiStore.activeRequestTab = 'curl'
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true
    })

    const editorWrapper = mountEditor()
    const toggle = editorWrapper.find('[data-test="curl-hide-auth-toggle"]')
    const label = editorWrapper.find('[data-test="curl-hide-auth-label"]')
    const codeEl = editorWrapper.find('[data-test="curl-preview-code"]')
    const copyBtn = editorWrapper.find('[data-test="copy-preview-curl-btn"]')

    expect(toggle.exists()).toBe(true)
    expect((toggle.element as HTMLInputElement).checked).toBe(false)
    expect(label.text()).toBe('Ẩn xác thực')

    // Default state shows full auth
    expect(codeEl.text()).toContain("'https://api.example.com/v1/protected?api_key=q-secret&page=2#sec'")
    expect(codeEl.text()).toContain("-H 'Proxy-Authorization: Basic proxy123'")
    expect(codeEl.text()).toContain("-H 'Authorization: Bearer manual-token'")
    expect(codeEl.text()).toContain("-H 'X-Trace: trace-42'")

    // Enable Hide Auth
    await toggle.setValue(true)
    expect((toggle.element as HTMLInputElement).checked).toBe(true)
    expect(codeEl.text()).toContain("'https://api.example.com/v1/protected?page=2#sec'")
    expect(codeEl.text()).not.toContain('api_key')
    expect(codeEl.text()).not.toContain('q-secret')
    expect(codeEl.text()).not.toContain('Authorization')
    expect(codeEl.text()).not.toContain('Proxy-Authorization')
    expect(codeEl.text()).toContain("-H 'Content-Type: application/json'")
    expect(codeEl.text()).toContain("-H 'X-Trace: trace-42'")
    expect(codeEl.text()).toContain('--data-raw \'{"hello":"world"}\'')

    // Copy cURL copies the auth-hidden command
    await copyBtn.trigger('click')
    expect(writeTextMock).toHaveBeenCalledTimes(1)
    const copiedText = writeTextMock.mock.calls[0][0] as string
    expect(copiedText).not.toContain('Authorization')
    expect(copiedText).not.toContain('Proxy-Authorization')
    expect(copiedText).not.toContain('api_key')
    expect(copiedText).toContain("'https://api.example.com/v1/protected?page=2#sec'")

    // Disable Hide Auth restores auth without mutating stored request auth/headers/params
    await toggle.setValue(false)
    expect(codeEl.text()).toContain("'https://api.example.com/v1/protected?api_key=q-secret&page=2#sec'")
    expect(codeEl.text()).toContain("-H 'Authorization: Bearer manual-token'")
    expect(codeEl.text()).toContain("-H 'Proxy-Authorization: Basic proxy123'")
    expect(requestStore.current.auth).toEqual({
      type: 'apiKey',
      apiKey: { key: 'api_key', value: 'q-secret', addTo: 'query' }
    })
    expect(requestStore.current.headers.some(h => h.key === 'Authorization')).toBe(true)
    expect(requestStore.current.params.some(p => p.key === 'api_key')).toBe(true)

    // Switch locale to 'en' and back to 'vi'
    await uiStore.setLocale('en', { skipCollectionSave: true })
    await editorWrapper.vm.$nextTick()
    expect(label.text()).toBe('Hide Auth')

    await uiStore.setLocale('vi', { skipCollectionSave: true })
    await editorWrapper.vm.$nextTick()
    expect(label.text()).toBe('Ẩn xác thực')

    // Inherited collection auth is also hidden when toggled on and restored when toggled off
    requestStore.current = createMockRequest({
      id: 'req-curl-auth',
      method: 'GET',
      url: 'https://api.example.com/v1/protected',
      auth: { type: 'inherit' },
      headers: [{ key: 'X-Trace', value: 'trace-99', enabled: true }]
    })
    await editorWrapper.vm.$nextTick()
    expect(codeEl.text()).toContain("-H 'Authorization: Bearer coll-secret'")
    expect(codeEl.text()).toContain("-H 'Proxy-Authorization: Basic proxy123'")

    await toggle.setValue(true)
    expect(codeEl.text()).not.toContain('Authorization')
    expect(codeEl.text()).not.toContain('Proxy-Authorization')
    expect(codeEl.text()).not.toContain('coll-secret')
    expect(codeEl.text()).toContain("-H 'X-Trace: trace-99'")
  })

  it('renders ExampleSwitcher, locks Base URL when url is linked, allows Params edit, and preserves Example Body on Sync All', async () => {
    const requestStore = useRequestStore()
    const baseReq = createMockRequest({
      id: 'req-ex-ui',
      name: 'Search API',
      method: 'POST',
      url: 'https://api.example.com/v1/search?q=default',
      params: [{ key: 'q', value: 'default', enabled: true }],
      headers: [],
      body: { type: 'json', content: '{"q":"default"}' },
      examples: [
        {
          id: 'ex-1',
          name: 'Empty Query',
          method: 'POST',
          url: 'https://api.example.com/v1/search?q=empty',
          params: [{ key: 'q', value: 'empty', enabled: true }],
          path_params: [],
          headers: [],
          variables: [],
          body: { type: 'json', content: '{"q":"empty"}' },
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
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z'
        }
      ]
    })
    requestStore.original = JSON.parse(JSON.stringify(baseReq))
    requestStore.draft = JSON.parse(JSON.stringify(baseReq))
    requestStore.current = requestStore.draft
    requestStore.activeExampleId = null

    const wrapper = mount(RequestEditor)
    expect(wrapper.find('[data-test="example-switcher"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="example-sync-all-btn"]').exists()).toBe(true)

    // Switch to ex-1
    await wrapper.find('[data-test="example-tab"][data-example-id="ex-1"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(requestStore.activeExampleId).toBe('ex-1')
    expect(wrapper.find('[data-test="url-linked-badge"]').exists()).toBe(true)
    expect((wrapper.find('#url-input').element as HTMLTextAreaElement).readOnly).toBe(true)
    expect((wrapper.find('[data-test="method-selector"]').element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.find('[data-test="body-linked-banner"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="auth-linked-banner"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="scripts-linked-banner"]').exists()).toBe(true)

    // Verify resolvedCurlPreview uses effective Example config (linked Base URL + Example query & body)
    const exCurl = wrapper.find('[data-test="curl-preview-code"]').text()
    expect(exCurl).toContain('https://api.example.com/v1/search?q=empty')
    expect(exCurl).toContain('"q":"empty"')

    // Unlink URL directly from badge -> unlocks #url-input for independent editing
    await wrapper.find('[data-test="url-unlink-btn"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-test="url-linked-badge"]').exists()).toBe(false)
    expect((wrapper.find('#url-input').element as HTMLTextAreaElement).readOnly).toBe(false)
    // Re-link URL for Sync All test below
    requestStore.setExampleSyncFlag('ex-1', 'url', true)
    await wrapper.vm.$nextTick()

    // Switch back to Default, change Base URL & Body, click Sync All -> Example keeps its Body & Query!
    await wrapper.find('[data-test="example-tab-default"]').trigger('click')
    await wrapper.vm.$nextTick()
    requestStore.current!.url = 'https://api.example.com/v2/search?q=default'
    requestStore.current!.body.content = '{"q":"updated-default"}'
    await wrapper.find('[data-test="example-sync-all-btn"]').trigger('click')
    await wrapper.vm.$nextTick()

    const updatedEx = requestStore.examples[0]
    expect(updatedEx.url).toBe('https://api.example.com/v2/search?q=empty')
    expect(updatedEx.body.content).toBe('{"q":"empty"}')
  })

  it('supports ExampleSwitcher create/rename/duplicate/sync-flag-popover, tab-linked-dots, and request rename keeping draft.name synced', async () => {
    const { RenameRequest } = await import('../../../wailsjs/go/main/App')
    vi.mocked(RenameRequest).mockResolvedValue({ success: true, data: {} } as any)
    const requestStore = useRequestStore()
    const baseReq = createMockRequest({
      id: 'req-ex-crud',
      name: 'Users API',
      method: 'GET',
      url: 'https://api.example.com/users',
      headers: [],
      params: [],
      body: { type: 'none', content: '' }
    })
    requestStore.original = JSON.parse(JSON.stringify(baseReq))
    requestStore.draft = JSON.parse(JSON.stringify(baseReq))
    requestStore.current = requestStore.draft
    requestStore.activeExampleId = null

    const wrapper = mount(RequestEditor)
    // Create new example via ExampleSwitcher
    await wrapper.find('[data-test="example-add-btn"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(requestStore.examples).toHaveLength(1)
    expect(requestStore.activeExampleId).toBe(requestStore.examples[0].id)

    // Linked tab dots appear on auth & scripts tabs by default
    expect(wrapper.find('[data-test="tab-linked-dot-auth"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="tab-linked-dot-scripts"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="tab-linked-dot-body"]').exists()).toBe(false)

    // Open sync popover and toggle body sync flag on -> body tab shows linked dot
    await wrapper.find('[data-test="example-sync-config-btn"]').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-test="sync-flag-body"]').setValue(true)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-test="tab-linked-dot-body"]').exists()).toBe(true)

    // Rename Request while Example is active -> draft.name and original.name both stay synchronized
    await wrapper.find('[data-test="breadcrumb-rename-btn"]').trigger('click')
    await wrapper.vm.$nextTick()
    const renameInput = wrapper.find('[data-test="breadcrumb-name-input"]')
    await renameInput.setValue('Users V2')
    await renameInput.trigger('keydown.enter')
    await new Promise(r => setTimeout(r, 10))
    expect(requestStore.current?.name).toBe('Users V2')
    expect(requestStore.draft?.name).toBe('Users V2')
    expect(requestStore.original?.name).toBe('Users V2')

    // Duplicate & delete via ExampleSwitcher action menu
    await wrapper.find('[data-test="example-menu-trigger"]').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-test="example-action-duplicate"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(requestStore.examples).toHaveLength(2)

    await wrapper.findAll('[data-test="example-menu-trigger"]')[1].trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-test="example-action-delete"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(requestStore.examples).toHaveLength(1)
  })
})


