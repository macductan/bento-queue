import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import UrlBar from '../UrlBar.vue'
import { useRequestStore } from '@/stores/requestStore'
import { useUiStore } from '@/stores/uiStore'
import { useEnvironmentStore } from '@/stores/environmentStore'

vi.mock('../../../wailsjs/go/main/App', () => ({
  SendRequest: vi.fn().mockResolvedValue({ success: true, data: {} }),
  AbortRequest: vi.fn().mockResolvedValue({ success: true }),
  GetRequest: vi.fn().mockResolvedValue({ success: true, data: null }),
  SaveRequest: vi.fn().mockResolvedValue({ success: true, data: {} }),
  ListEnvironments: vi.fn().mockResolvedValue({ success: true, data: [] })
}))

describe('UrlBar.vue', () => {
  let writeTextMock: ReturnType<typeof vi.fn>
  const originalClipboard = navigator.clipboard

  beforeEach(() => {
    setActivePinia(createPinia())
    writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: writeTextMock
      },
      writable: true,
      configurable: true
    })
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      writable: true,
      configurable: true
    })
  })

  it('does not render Copy as cURL button and renders Send button with Gửi label and ^Enter shortcut, plus method-badge classes on #http-method-select and Abort button with spinner', async () => {
    const { useResponseStore } = await import('@/stores/responseStore')
    const requestStore = useRequestStore()
    const responseStore = useResponseStore()
    requestStore.current = {
      id: 'req-1',
      name: 'Test Req',
      method: 'POST',
      url: 'https://api.example.com/test',
      headers: [],
      params: [],
      body: { type: 'none', content: '' },
      created_at: '2026-10-13',
      updated_at: '2026-10-13'
    }

    const wrapper = mount(UrlBar)
    const curlBtn = wrapper.find('#copy-curl-btn')
    expect(curlBtn.exists()).toBe(false)

    const methodBtn = wrapper.find('#http-method-select')
    expect(methodBtn.exists()).toBe(true)
    expect(methodBtn.attributes('data-test')).toBe('method-selector')
    expect(methodBtn.classes()).toContain('method-badge-post')
    expect(methodBtn.classes()).toContain('text-method-post')

    const postOption = wrapper.find('[role="option"][data-method="POST"]')
    expect(postOption.exists()).toBe(true)
    expect(postOption.classes()).toContain('text-method-post')
    expect(postOption.classes()).not.toContain('method-badge-post')

    const sendBtn = wrapper.find('[data-test="send-request-btn"]')
    expect(sendBtn.exists()).toBe(true)
    expect(sendBtn.attributes('aria-label')).toBe('Gửi')
    expect(sendBtn.find('svg').exists()).toBe(true)
    expect(sendBtn.text()).toContain('Gửi')
    expect(sendBtn.find('kbd').text()).toBe('^Enter')

    responseStore.loading = true
    await wrapper.vm.$nextTick()
    const abortBtn = wrapper.find('[data-test="abort-request-btn"]')
    expect(abortBtn.exists()).toBe(true)
    expect(abortBtn.find('svg.animate-spin').exists()).toBe(true)
    expect(abortBtn.text()).toContain('Hủy')
  })

  it('extracts :param path variables from URL into path_params and highlights them in VariableHighlighter', async () => {
    const requestStore = useRequestStore()
    requestStore.current = {
      id: 'req-path-vars',
      name: 'Path Var Req',
      method: 'GET',
      url: 'https://api.example.com/v1/:api_key/items/:item_id',
      headers: [],
      params: [],
      path_params: [{ key: 'api_key', value: 'my-secret-key', enabled: true }],
      body: { type: 'none', content: '' },
      created_at: '2026-10-16',
      updated_at: '2026-10-16'
    }

    const wrapper = mount(UrlBar)
    const highlighter = wrapper.findComponent({ name: 'VariableHighlighter' })
    expect(highlighter.exists()).toBe(true)

    const tokens = wrapper.findAll('[data-var-name]')
    const varNames = tokens.map(t => t.attributes('data-var-name'))
    expect(varNames).toContain('api_key')
    expect(varNames).toContain('item_id')
    const apiKeySpan = tokens.find(t => t.attributes('data-var-name') === 'api_key')
    expect(apiKeySpan?.attributes('data-var-kind')).toBe('path')
    expect(apiKeySpan?.classes()).toContain('text-variable-valid')
    const itemIdSpan = tokens.find(t => t.attributes('data-var-name') === 'item_id')
    expect(itemIdSpan?.attributes('data-var-kind')).toBe('path')
    expect(itemIdSpan?.classes()).toContain('text-variable-missing')
  })

  it('applies text-sm typography to url input and highlighter overlay', () => {
    const requestStore = useRequestStore()
    requestStore.current = {
      id: 'req-1',
      name: 'Typography Req',
      method: 'GET',
      url: 'https://api.example.com/test',
      headers: [],
      params: [],
      body: { type: 'none', content: '' },
      created_at: '2026-10-13',
      updated_at: '2026-10-13'
    }

    const wrapper = mount(UrlBar)
    const textarea = wrapper.find('#url-input')
    expect(textarea.exists()).toBe(true)
    expect(textarea.classes()).toContain('text-sm')
    expect(textarea.classes()).not.toContain('text-base')

    const highlighter = wrapper.findComponent({ name: 'VariableHighlighter' })
    expect(highlighter.exists()).toBe(true)
    expect(highlighter.props('overlayClass')).toContain('text-sm')
    expect(highlighter.props('overlayClass')).not.toContain('text-base')
  })

  it('resolves 4-tier variable hierarchy (Collection Env, Folder-Env, and :param path_params) in UrlBar highlighter', async () => {
    const { useCollectionStore } = await import('@/stores/collectionStore')
    const collectionStore = useCollectionStore()
    const envStore = useEnvironmentStore()
    const requestStore = useRequestStore()

    collectionStore.collections = [
      {
        id: 'col-1',
        name: 'My Collection',
        variables: [
          { key: 'base_url', value: 'https://col.example.com', enabled: true },
          { key: 'api_ver', value: 'v1', enabled: true }
        ]
      } as any
    ]
    collectionStore.activeCollectionId = 'col-1'
    collectionStore.activeRequestId = 'req-4tier'

    envStore.environments = [
      {
        id: 'env-local',
        name: 'Local',
        variables: [
          { key: 'base_url', value: 'http://localhost:8000', enabled: true }
        ]
      } as any
    ]
    envStore.activeEnvId = 'env-local'

    collectionStore.tree = [
      {
        id: 'f-auth',
        name: 'Auth Folder',
        type: 'folder',
        path: '/col-1/f-auth',
        created_at: '',
        variables: [
          { key: 'base_url', value: 'https://folder-global.example.com', enabled: true }
        ],
        folder_envs: {
          'env-local': [
            { key: 'base_url', value: 'http://localhost:9001', enabled: true }
          ]
        },
        children: [
          {
            id: 'req-4tier',
            name: 'Login',
            type: 'request',
            path: '/col-1/f-auth/login.json',
            created_at: ''
          }
        ]
      }
    ]

    requestStore.current = {
      id: 'req-4tier',
      name: 'Login',
      method: 'POST',
      url: '{{base_url}}/{{api_ver}}/login/:api_key',
      headers: [],
      params: [],
      path_params: [{ key: 'api_key', value: 'key-999', enabled: true }],
      body: { type: 'none', content: '' },
      created_at: '2026-10-13',
      updated_at: '2026-10-13'
    }

    const wrapper = mount(UrlBar)
    const spans = wrapper.findAll('[data-var-name]')
    expect(spans.length).toBe(3)
    for (const s of spans) {
      expect(s.classes()).toContain('text-variable-valid')
    }
  })

  it('supports selecting HEAD and OPTIONS or entering a Custom HTTP Method (e.g., PURGE, PROPFIND)', async () => {
    const requestStore = useRequestStore()
    requestStore.current = {
      id: 'req-custom-method',
      name: 'Cache Purge',
      method: 'GET',
      url: 'https://api.example.com/cache',
      headers: [],
      params: [],
      body: { type: 'none', content: '' },
      created_at: '2026-10-14',
      updated_at: '2026-10-14'
    }

    const wrapper = mount(UrlBar)

    // Open dropdown
    const methodBtn = wrapper.find('button[aria-haspopup="listbox"]')
    await methodBtn.trigger('click')

    const options = wrapper.findAll('[role="option"]').map(o => o.text())
    expect(options).toContain('HEAD')
    expect(options).toContain('OPTIONS')

    // Select HEAD
    const headOpt = wrapper.find('[data-method="HEAD"]')
    await headOpt.trigger('click')
    expect(requestStore.current.method).toBe('HEAD')
    expect(methodBtn.text()).toContain('HEAD')

    // Re-open dropdown and type custom method 'purge'
    await methodBtn.trigger('click')
    const customInput = wrapper.find('[data-test="custom-method-input"]')
    expect(customInput.exists()).toBe(true)
    await customInput.setValue('  purge ')
    await customInput.trigger('keydown.enter')

    expect(requestStore.current.method).toBe('PURGE')
    expect(methodBtn.text()).toContain('PURGE')

    // Empty / invalid custom method does not overwrite existing method
    await methodBtn.trigger('click')
    await customInput.setValue('   $$$  ')
    const applyBtn = wrapper.find('[data-test="custom-method-apply"]')
    await applyBtn.trigger('click')
    expect(requestStore.current.method).toBe('PURGE')
  })

  it('automatically parses a pasted cURL command in #url-input into method, url, params, headers, auth, and body', async () => {
    const requestStore = useRequestStore()
    const uiStore = useUiStore()
    requestStore.current = {
      id: 'req-curl-paste',
      name: 'Paste cURL',
      method: 'GET',
      url: '',
      headers: [],
      params: [],
      body: { type: 'none', content: '' },
      created_at: '2026-10-14',
      updated_at: '2026-10-14'
    }

    const wrapper = mount(UrlBar)
    const textarea = wrapper.find('#url-input')

    const curlText = `curl -X POST 'https://api.example.com/v1/items?env=prod' -u 'admin:pw123' -H 'X-Custom: abc' --data-raw '{"title":"Book"}'`
    const preventDefaultSpy = vi.fn()

    await textarea.trigger('paste', {
      clipboardData: {
        getData: (type: string) => (type === 'text/plain' ? curlText : '')
      },
      preventDefault: preventDefaultSpy
    })

    expect(preventDefaultSpy).toHaveBeenCalled()
    expect(requestStore.current.method).toBe('POST')
    expect(requestStore.current.url).toBe('https://api.example.com/v1/items?env=prod')
    expect(requestStore.current.params).toEqual([
      { key: 'env', value: 'prod', enabled: true }
    ])
    expect(requestStore.current.headers).toEqual([
      { key: 'Content-Type', value: 'application/json', enabled: true, _isAuto: true },
      { key: 'X-Custom', value: 'abc', enabled: true }
    ])
    expect(requestStore.current.body).toEqual({
      type: 'json',
      content: '{"title":"Book"}'
    })
    expect(requestStore.current.auth).toEqual({
      type: 'basic',
      basic: { username: 'admin', password: 'pw123' }
    })
    expect(uiStore.toast?.text).toBe('Đã phân tích lệnh cURL')
  })
})


