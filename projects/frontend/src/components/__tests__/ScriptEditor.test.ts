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

  it('defaults to post-response tab when only post-response script exists, and displays checkmark badges', async () => {
    const reqStore = useRequestStore()
    reqStore.current = createMockRequest({
      scripts: {
        pre_request: '',
        post_response: 'console.log("post script only");'
      }
    })

    const wrapper = mount(ScriptEditor)

    // Should default to post_response because only post_response has code
    expect(wrapper.find('[data-test="post-script-panel"]').attributes('style') || '').not.toContain('display: none')
    expect(wrapper.find('[data-test="pre-script-panel"]').attributes('style') || '').toContain('display: none')

    // Post tab has badge, pre tab does not
    expect(wrapper.find('[data-test="post-script-badge"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="pre-script-badge"]').exists()).toBe(false)

    // Clicking pre-request tab switches to pre-request
    await wrapper.find('[data-test="script-tab-pre-request"]').trigger('click')
    expect(wrapper.find('[data-test="pre-script-panel"]').attributes('style') || '').not.toContain('display: none')
    expect(wrapper.find('[data-test="post-script-panel"]').attributes('style') || '').toContain('display: none')
  })

  it('inserts snippets into Pre-request and Post-response scripts on button click', async () => {
    const reqStore = useRequestStore()
    reqStore.current = createMockRequest()

    const wrapper = mount(ScriptEditor)

    // Insert pre-request snippet
    const preSnippetBtn = wrapper.find('[data-test="snippet-pre-set-env"]')
    expect(preSnippetBtn.exists()).toBe(true)
    await preSnippetBtn.trigger('click')

    expect(reqStore.current.scripts?.pre_request).toContain("ha.env().set({ token: 'value' });")

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

  it('inserts Folder Auth and Request Auth snippets and displays auth autocomplete suggestions', async () => {
    const reqStore = useRequestStore()
    reqStore.current = createMockRequest()

    const wrapper = mount(ScriptEditor)

    const folderAuthBtn = wrapper.find('[data-test="snippet-pre-folder-auth"]')
    expect(folderAuthBtn.exists()).toBe(true)
    await folderAuthBtn.trigger('click')
    expect(reqStore.current.scripts?.pre_request).toContain("ha.folder('FolderName').auth.set")

    const reqAuthBtn = wrapper.find('[data-test="snippet-pre-request-auth"]')
    expect(reqAuthBtn.exists()).toBe(true)
    await reqAuthBtn.trigger('click')
    expect(reqStore.current.scripts?.pre_request).toContain("ha.request.auth.set")

    // Test autocomplete trigger
    const textarea = wrapper.find('[data-test="pre-request-script-input"]')
    const el = textarea.element as HTMLTextAreaElement
    el.value = 'ha.folder'
    el.selectionStart = el.selectionEnd = el.value.length
    await textarea.trigger('input')
    await textarea.trigger('keydown', { key: ' ', ctrlKey: true })
    await nextTick()

    const list = wrapper.find('[data-test="script-autocomplete-list"]')
    expect(list.exists()).toBe(true)
    expect(list.text()).toContain('ha.folder')
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

  it('supports response commands insertion without arbitrary variable assignments without throwing syntax error', async () => {
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

    // Verify code execution does not collide with syntax error
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

  it('IME Composition (Ubuntu Vietnamese): toggles is-ime-composing, hides syntax overlay, and updates script on compositionend', async () => {
    const store = useRequestStore()
    store.current = {
      id: 'req-ime',
      name: 'IME Test',
      scripts: {
        pre_request: 'const a = 1;',
        post_response: ''
      }
    } as any

    const wrapper = mount(ScriptEditor)
    await nextTick()

    const panel = wrapper.find('[data-test="pre-script-panel"]')
    const overlay = wrapper.find('[data-test="pre-script-syntax-overlay"]')
    const textarea = wrapper.find('[data-test="pre-request-script-input"]')

    expect(panel.classes()).not.toContain('is-ime-composing')
    expect(overlay.classes()).not.toContain('opacity-0')

    // Simulate compositionstart
    await textarea.trigger('compositionstart')
    await nextTick()

    expect(panel.classes()).toContain('is-ime-composing')
    expect(overlay.classes()).toContain('opacity-0')

    // Simulate compositionupdate
    await textarea.trigger('compositionupdate', { data: 'ư' })
    await nextTick()

    expect(panel.classes()).toContain('is-ime-composing')

    // Simulate compositionend
    const el = textarea.element as HTMLTextAreaElement
    el.value = 'const a = 1; // test tiếng việt'
    await textarea.trigger('compositionend')
    await nextTick()

    expect(panel.classes()).not.toContain('is-ime-composing')
    expect(overlay.classes()).not.toContain('opacity-0')
    expect(store.current?.scripts?.pre_request).toBe('const a = 1; // test tiếng việt')
  })

  it('renders line numbers gutter synchronized with script line count', async () => {
    const reqStore = useRequestStore()
    reqStore.current = createMockRequest({
      scripts: {
        pre_request: 'line1\nline2\nline3\nline4\nline5',
        post_response: ''
      }
    })

    const wrapper = mount(ScriptEditor)
    await nextTick()

    const gutter = wrapper.find('[data-test="pre-script-gutter"]')
    expect(gutter.exists()).toBe(true)
    expect(gutter.text()).toContain('1')
    expect(gutter.text()).toContain('5')
  })

  it('only suggests inner object payload properties when typing inside an object literal', async () => {
    const reqStore = useRequestStore()
    reqStore.current = createMockRequest()

    const wrapper = mount(ScriptEditor)
    const textarea = wrapper.find('[data-test="pre-request-script-input"]')
    const el = textarea.element as HTMLTextAreaElement

    // User types inside .auth.set({ type
    el.value = "ha.folder('Backoffice').auth.set({ type"
    el.selectionStart = el.selectionEnd = el.value.length
    await textarea.trigger('input')
    await textarea.trigger('keydown', { key: ' ', ctrlKey: true })
    await nextTick()

    const list = wrapper.find('[data-test="script-autocomplete-list"]')
    expect(list.exists()).toBe(true)
    // Should suggest object property type: 'bearer', NOT full ha.folder(...) line
    expect(list.text()).toContain("type: 'bearer'")
    expect(list.text()).not.toContain("ha.folder(")
  })

  it('handles Ctrl+X to cut selected text in the script editor', async () => {
    const reqStore = useRequestStore()
    reqStore.current = createMockRequest({
      scripts: {
        pre_request: 'console.log("hello world");',
        post_response: ''
      }
    })

    const wrapper = mount(ScriptEditor)
    const textarea = wrapper.find('[data-test="pre-request-script-input"]')
    const el = textarea.element as HTMLTextAreaElement

    // Select "hello world"
    el.selectionStart = 13
    el.selectionEnd = 24
    await textarea.trigger('keydown', { key: 'x', ctrlKey: true })
    await nextTick()

    expect(reqStore.current.scripts?.pre_request).toBe('console.log("");')
  })

  it('formats code when clicking Format button and via Ctrl+Shift+F shortcut', async () => {
    const reqStore = useRequestStore()
    reqStore.current = createMockRequest({
      scripts: {
        pre_request: 'const a=1+2;\nif(a){\nha.env().set({x:a});\n}',
        post_response: ''
      }
    })

    const wrapper = mount(ScriptEditor)
    const formatBtn = wrapper.find('[data-test="format-script-btn"]')
    expect(formatBtn.exists()).toBe(true)

    await formatBtn.trigger('click')
    await nextTick()

    const expected = 'const a = 1 + 2;\nif (a) {\n  ha.env().set({ x: a });\n}'
    expect(reqStore.current.scripts?.pre_request).toBe(expected)

    // Test shortcut on post_response
    await wrapper.find('[data-test="script-tab-post-response"]').trigger('click')
    reqStore.current.scripts!.post_response = 'const b=10;'
    const postTextarea = wrapper.find('[data-test="post-response-script-input"]')
    await postTextarea.trigger('keydown', { key: 'F', ctrlKey: true, shiftKey: true })
    await nextTick()

    expect(reqStore.current.scripts?.post_response).toBe('const b = 10;')
  })

  it('synchronizes line number gutter with textarea scroll via translateY transform and supports wheel scrolling', async () => {
    const reqStore = useRequestStore()
    reqStore.current = createMockRequest({
      scripts: {
        pre_request: Array.from({ length: 30 }, (_, i) => `console.log("line ${i + 1}");`).join('\n'),
        post_response: ''
      }
    })

    const wrapper = mount(ScriptEditor)
    await nextTick()

    const textarea = wrapper.find('[data-test="pre-request-script-input"]')
    const el = textarea.element as HTMLTextAreaElement
    Object.defineProperty(el, 'scrollTop', { value: 120, writable: true })

    await textarea.trigger('scroll')
    await nextTick()

    const gutter = wrapper.find('[data-test="pre-script-gutter"]')
    const gutterContent = gutter.find('div')
    expect(gutterContent.attributes('style')).toContain('translateY(-120px)')

    // Test wheel on gutter forwards scroll to textarea
    const wheelEvent = new WheelEvent('wheel', { deltaY: 40 })
    await gutter.trigger('wheel', wheelEvent)
    await nextTick()

    expect(gutterContent.attributes('style')).toContain('translateY(-160px)')
  })

  it('inserts clean, versatile ha.response commands for Section 4 buttons without arbitrary variable assignment', async () => {
    const reqStore = useRequestStore()
    reqStore.current = createMockRequest({
      scripts: { pre_request: '', post_response: '' }
    })

    const wrapper = mount(ScriptEditor)
    await wrapper.find('[data-test="script-tab-post-response"]').trigger('click')

    // Test .data
    const dataBtn = wrapper.find('[data-test="snippet-post-folder-auth"]')
    expect(dataBtn.exists()).toBe(true)
    await dataBtn.trigger('click')
    expect(reqStore.current.scripts?.post_response).toContain('ha.response.data')

    // Test .text()
    const textBtn = wrapper.find('[data-test="snippet-post-text"]')
    expect(textBtn.exists()).toBe(true)
    await textBtn.trigger('click')
    expect(reqStore.current.scripts?.post_response).toContain('ha.response.text()')

    // Test .responseTime
    const rtBtn = wrapper.find('[data-test="snippet-post-response-time"]')
    expect(rtBtn.exists()).toBe(true)
    await rtBtn.trigger('click')
    expect(reqStore.current.scripts?.post_response).toContain('ha.response.responseTime')

    // Test .headers.get(...)
    const headersBtn = wrapper.find('[data-test="snippet-post-headers-get"]')
    expect(headersBtn.exists()).toBe(true)
    await headersBtn.trigger('click')
    expect(reqStore.current.scripts?.post_response).toContain("ha.response.headers.get('content-type')")
  })
})
