import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import ScriptEditor from '../ScriptEditor.vue'
import { useRequestStore, type Request } from '@/stores/requestStore'
import { useResponseStore } from '@/stores/responseStore'
import { useEnvironmentStore } from '@/stores/environmentStore'

vi.mock('../../../wailsjs/go/main/App', () => ({
  GetCollectionTree: vi.fn().mockResolvedValue({ success: true, data: [] }),
  ListEnvironments: vi.fn().mockResolvedValue({ success: true, data: [] }),
  SaveEnvironment: vi.fn().mockResolvedValue({ success: true }),
}))

describe('ScriptEditor.vue', () => {
  const createMockRequest = (overrides: Partial<Request> = {}): Request => ({
    id: 'req-1',
    name: 'Test Request',
    method: 'GET',
    url: 'https://api.example.com/test',
    headers: [],
    params: [],
    body: { type: 'none', content: '' },
    auth: { type: 'inherit' },
    scripts: {
      pre_request: '',
      post_response: '',
    },
    created_at: '2026-10-15',
    updated_at: '2026-10-15',
    ...overrides,
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders phase select switcher showing Pre-request by default and switches to Post-response on select', async () => {
    const reqStore = useRequestStore()
    reqStore.current = createMockRequest()

    const wrapper = mount(ScriptEditor)

    expect(wrapper.find('[data-test="script-editor"]').exists()).toBe(true)
    const select = wrapper.find('[data-test="script-phase-select"]')
    expect(select.exists()).toBe(true)
    expect((select.element as HTMLSelectElement).value).toBe('pre_request')

    expect(wrapper.find('[data-test="pre-request-script-input"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="pre-script-syntax-overlay"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="pre-script-panel"]').attributes('style') || '').not.toContain('display: none')
    expect(wrapper.find('[data-test="post-script-panel"]').attributes('style') || '').toContain('display: none')

    await select.setValue('post_response')
    expect(wrapper.find('[data-test="pre-script-panel"]').attributes('style') || '').toContain('display: none')
    expect(wrapper.find('[data-test="post-script-panel"]').attributes('style') || '').not.toContain('display: none')
    expect(wrapper.find('[data-test="post-script-syntax-overlay"]').exists()).toBe(true)

    expect(wrapper.find('[data-test="script-execution-output"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Chưa có log thực thi')
  })

  it('inserts snippets into Pre-request and Post-response scripts on button click', async () => {
    const reqStore = useRequestStore()
    reqStore.current = createMockRequest()

    const wrapper = mount(ScriptEditor)

    // Insert pre-request snippet
    const preSnippetBtn = wrapper.find('[data-test="snippet-pre-set-env"]')
    expect(preSnippetBtn.exists()).toBe(true)
    await preSnippetBtn.trigger('click')

    expect(reqStore.current.scripts?.pre_request).toContain("ha.environment.set('token', 'value');")

    // Switch to post-response and insert snippets
    await wrapper.find('[data-test="script-phase-select"]').setValue('post_response')

    const postJsonBtn = wrapper.find('[data-test="snippet-post-json"]')
    expect(postJsonBtn.exists()).toBe(true)
    await postJsonBtn.trigger('click')

    expect(reqStore.current.scripts?.post_response).toContain('ha.response.json()')

    const postEnvBtn = wrapper.find('[data-test="snippet-post-set-env"]')
    expect(postEnvBtn.exists()).toBe(true)
    await postEnvBtn.trigger('click')

    expect(reqStore.current.scripts?.post_response).toContain('ha.response.code')
  })

  it('executes pre-request script preview, updates logs, and applies env variables', async () => {
    const reqStore = useRequestStore()
    const resStore = useResponseStore()
    const envStore = useEnvironmentStore()

    envStore.environments = [
      { id: 'env-1', name: 'Dev', variables: [], is_active: true } as any
    ]
    envStore.activeEnvId = 'env-1'

    reqStore.current = createMockRequest({
      scripts: {
        pre_request: "console.log('Generating auth token'); ha.environment.set('my_token', 'abc-123');",
        post_response: '',
      },
    })

    const wrapper = mount(ScriptEditor)

    const runBtn = wrapper.find('[data-test="run-pre-script-btn"]')
    expect(runBtn.exists()).toBe(true)
    await runBtn.trigger('click')

    expect(resStore.scriptLogs).toContain('[Pre-request] Generating auth token')
    expect(envStore.variablesMap.get('my_token')).toBe('abc-123')
    expect(wrapper.text()).toContain('[Pre-request] Generating auth token')
  })

  it('displays error banner on script execution error and allows clearing logs', async () => {
    const reqStore = useRequestStore()
    const resStore = useResponseStore()

    reqStore.current = createMockRequest({
      scripts: {
        pre_request: 'invalid.syntax.code()!!;',
        post_response: '',
      },
    })

    const wrapper = mount(ScriptEditor)

    await wrapper.find('[data-test="run-pre-script-btn"]').trigger('click')

    expect(resStore.scriptError).toBeTruthy()
    const banner = wrapper.find('[data-test="script-error-banner"]')
    expect(banner.exists()).toBe(true)

    // Clear logs button should appear and work
    const clearBtn = wrapper.find('[data-test="clear-script-logs-btn"]')
    expect(clearBtn.exists()).toBe(true)
    await clearBtn.trigger('click')

    expect(resStore.scriptLogs.length).toBe(0)
    expect(resStore.scriptError).toBeNull()
    expect(wrapper.find('[data-test="script-error-banner"]').exists()).toBe(false)
  })

  it('supports duplicate snippet insertion with block scoping without throwing syntax error', async () => {
    const reqStore = useRequestStore()
    reqStore.current = createMockRequest()

    const wrapper = mount(ScriptEditor)
    await wrapper.find('[data-test="script-phase-select"]').setValue('post_response')
    const postJsonBtn = wrapper.find('[data-test="snippet-post-json"]')

    // Click snippet twice
    await postJsonBtn.trigger('click')
    await postJsonBtn.trigger('click')

    const code = reqStore.current.scripts?.post_response || ''
    expect(code).toContain('ha.response.json()')

    // Verify code execution does not collide with duplicate identifier error
    const { executeScript } = await import('@/utils/scriptRunner')
    const result = executeScript(code, {
      variables: new Map(),
      response: {
        status_code: 200,
        status_text: 'OK',
        time_ms: 10,
        size_bytes: 100,
        headers: {},
        body: JSON.stringify({ token: 'test-token' }),
        timestamp: '2026-10-15T10:00:00.000Z',
        truncated: false,
        is_binary: false,
      }
    })

    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
    expect(result.envUpdates['auth_token']).toBe('test-token')
  })

  it('supports setting environment variables across all scopes (Global, Collection, Folder, Folder-Env) and mutating request params/query/pathParams', async () => {
    const { executeScript } = await import('@/utils/scriptRunner')
    const result = executeScript(
      `
      ha.environment.set('active_var', 'v1');
      ha.environment.set('prod_var', 'v2', 'Production');
      ha.collectionVariables.set('col_var', 'v3');
      ha.folderVariables.set('folder_var', 'v4');
      ha.folderEnv.set('folder_env_var', 'v5', 'Production');
      ha.request.query.set('page', '2');
      ha.request.pathParams.set('api_key', 'k-999');
      ha.request.headers.set('X-Trace', 'trace-1');
      console.info('Params & scopes updated');
      `,
      {
        variables: new Map(),
        request: createMockRequest({
          url: 'https://api.example.com/:api_key/list',
          params: [{ key: 'page', value: '1', enabled: true }],
          path_params: [{ key: 'api_key', value: 'old', enabled: true }],
          headers: [],
        }),
        environments: [{ id: 'env-prod', name: 'Production', variables: [] }],
        activeEnvId: 'env-dev',
      }
    )

    expect(result.success).toBe(true)
    expect(result.envUpdates['active_var']).toBe('v1')
    expect(result.scopedEnvUpdates).toEqual({
      collection: { col_var: 'v3' },
      globalEnvs: { Production: { prod_var: 'v2' } },
      folderGlobals: { __nearest__: { folder_var: 'v4' } },
      folderEnvs: [{ folder: '__nearest__', env: 'Production', key: 'folder_env_var', value: 'v5' }],
    })
    expect(result.requestMutations.params).toEqual([{ key: 'page', value: '2', enabled: true }])
    expect(result.requestMutations.path_params).toEqual([{ key: 'api_key', value: 'k-999', enabled: true }])
    expect(result.requestMutations.headers).toEqual([{ key: 'X-Trace', value: 'trace-1', enabled: true }])
    expect(result.logEntries[0]?.level).toBe('info')
  })

  it('tokenizes JavaScript syntax for highlight overlay and provides code completion suggestions', async () => {
    const { tokenizeJavaScript, getScriptSuggestions } = await import('@/utils/jsHighlight')
    const tokens = tokenizeJavaScript("const data = ha.response.json(); // comment\nha.environment.set('k', 123);")
    const types = tokens.map(t => t.type)
    expect(types).toContain('keyword')
    expect(types).toContain('builtin')
    expect(types).toContain('method')
    expect(types).toContain('comment')
    expect(types).toContain('string')
    expect(types).toContain('number')

    const suggestions = getScriptSuggestions('ha.request.', 'pre_request')
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions.some(s => s.label.includes('ha.request.query.set'))).toBe(true)
  })

  it('supports Enter auto-indent and Ctrl+/ comment toggle in script editor textarea', async () => {
    const store = useRequestStore()
    store.current = {
      id: 'req-1',
      name: 'Req Script Test',
      scripts: {
        pre_request: 'function test() {\n  const x = 1;\n}',
        post_response: ''
      }
    } as any

    const wrapper = mount(ScriptEditor)
    await nextTick()

    const textarea = wrapper.find('[data-test="pre-request-script-input"]')
    const el = textarea.element as HTMLTextAreaElement

    // Select "const x = 1;"
    el.selectionStart = 20
    el.selectionEnd = 32
    await textarea.trigger('keydown', { key: '/', ctrlKey: true })
    await nextTick()

    expect(store.current?.scripts?.pre_request).toContain('// const x = 1;')

    // Enter auto-indent
    const scriptLen = store.current?.scripts?.pre_request?.length || 0
    el.selectionStart = el.selectionEnd = scriptLen - 2
    await textarea.trigger('keydown', { key: 'Enter' })
    await nextTick()

    expect(store.current?.scripts?.pre_request).toContain('\n')
  })
})
