import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
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

  it('renders Pre-request and Post-response script inputs and empty console log area', () => {
    const reqStore = useRequestStore()
    reqStore.current = createMockRequest()

    const wrapper = mount(ScriptEditor)

    expect(wrapper.find('[data-test="script-editor"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="pre-request-script-input"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="post-response-script-input"]').exists()).toBe(true)
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

    // Insert post-response snippets
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
})
