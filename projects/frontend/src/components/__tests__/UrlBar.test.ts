import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import UrlBar from '../UrlBar.vue'
import { useRequestStore } from '@/stores/requestStore'
import { useResponseStore } from '@/stores/responseStore'
import { useUiStore } from '@/stores/uiStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { model } from '../../../wailsjs/go/models'

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

  it('renders Copy as cURL button alongside Send button', () => {
    const requestStore = useRequestStore()
    requestStore.current = {
      id: 'req-1',
      name: 'Test Req',
      method: 'GET',
      url: 'https://api.example.com/test',
      headers: [],
      params: [],
      body: { type: 'none', content: '' },
      created_at: '2026-10-13',
      updated_at: '2026-10-13'
    }

    const wrapper = mount(UrlBar)
    const curlBtn = wrapper.find('#copy-curl-btn')
    expect(curlBtn.exists()).toBe(true)
    expect(curlBtn.attributes('title')).toBe('Copy as cURL')
    expect(curlBtn.text()).toContain('cURL')

    const sendBtn = wrapper.findAll('button').find(b => b.text().includes('Gửi'))
    expect(sendBtn?.exists()).toBe(true)
  })

  it('shows warning toast and sets urlInvalid when copying cURL with empty URL', async () => {
    const requestStore = useRequestStore()
    const responseStore = useResponseStore()
    const uiStore = useUiStore()
    const toastSpy = vi.spyOn(uiStore, 'showToast')

    requestStore.current = {
      id: 'req-1',
      name: 'Empty URL Req',
      method: 'GET',
      url: '',
      headers: [],
      params: [],
      body: { type: 'none', content: '' },
      created_at: '2026-10-13',
      updated_at: '2026-10-13'
    }

    const wrapper = mount(UrlBar)
    const curlBtn = wrapper.find('#copy-curl-btn')
    await curlBtn.trigger('click')

    expect(toastSpy).toHaveBeenCalledWith('Vui lòng nhập URL')
    expect(responseStore.urlInvalid).toBe(true)
    expect(writeTextMock).not.toHaveBeenCalled()
  })

  it('copies cURL command to clipboard and shows success toast when valid', async () => {
    const requestStore = useRequestStore()
    const uiStore = useUiStore()
    const toastSpy = vi.spyOn(uiStore, 'showToast')

    requestStore.current = {
      id: 'req-1',
      name: 'Get Users',
      method: 'POST',
      url: 'https://api.example.com/users',
      headers: [{ key: 'X-Custom', value: 'value', enabled: true }],
      params: [{ key: 'page', value: '1', enabled: true }],
      body: { type: 'json', content: '{"name":"Alice"}' },
      created_at: '2026-10-13',
      updated_at: '2026-10-13'
    }

    const wrapper = mount(UrlBar)
    const curlBtn = wrapper.find('#copy-curl-btn')
    await curlBtn.trigger('click')

    expect(writeTextMock).toHaveBeenCalledTimes(1)
    const copiedCommand = writeTextMock.mock.calls[0][0]
    expect(copiedCommand).toContain("curl -X POST 'https://api.example.com/users?page=1'")
    expect(copiedCommand).toContain("-H 'Content-Type: application/json'")
    expect(copiedCommand).toContain("-H 'X-Custom: value'")
    expect(copiedCommand).toContain("--data-raw '{\"name\":\"Alice\"}'")

    expect(toastSpy).toHaveBeenCalledWith('Đã sao chép cURL vào clipboard')
  })

  it('resolves active environment variables from envStore during copyAsCurl', async () => {
    const requestStore = useRequestStore()
    const envStore = useEnvironmentStore()
    envStore.environments = [
      new model.Environment({
        id: 'env-prod',
        name: 'Production',
        variables: [
          { key: 'baseUrl', value: 'https://prod.api.com', enabled: true },
          { key: 'token', value: 'secret123', enabled: true }
        ]
      })
    ]
    envStore.activeEnvId = 'env-prod'

    requestStore.current = {
      id: 'req-1',
      name: 'Env Request',
      method: 'GET',
      url: '{{baseUrl}}/users',
      headers: [{ key: 'X-Token', value: '{{token}}', enabled: true }],
      params: [],
      body: { type: 'none', content: '' },
      created_at: '2026-10-13',
      updated_at: '2026-10-13'
    }

    const wrapper = mount(UrlBar)
    const curlBtn = wrapper.find('#copy-curl-btn')
    await curlBtn.trigger('click')

    expect(writeTextMock).toHaveBeenCalledTimes(1)
    const copiedCommand = writeTextMock.mock.calls[0][0]
    expect(copiedCommand).toBe("curl -X GET 'https://prod.api.com/users' -H 'X-Token: secret123'")
  })

  it('successfully falls back to execCommand when writeText rejects', async () => {
    writeTextMock.mockRejectedValue(new Error('Permission denied'))
    const execCommandMock = vi.fn().mockReturnValue(true)
    document.execCommand = execCommandMock

    const requestStore = useRequestStore()
    const uiStore = useUiStore()
    const toastSpy = vi.spyOn(uiStore, 'showToast')

    requestStore.current = {
      id: 'req-1',
      name: 'Fallback Request',
      method: 'GET',
      url: 'https://api.example.com/fallback',
      headers: [],
      params: [],
      body: { type: 'none', content: '' },
      created_at: '2026-10-13',
      updated_at: '2026-10-13'
    }

    const wrapper = mount(UrlBar)
    const curlBtn = wrapper.find('#copy-curl-btn')
    await curlBtn.trigger('click')

    expect(execCommandMock).toHaveBeenCalledWith('copy')
    expect(toastSpy).toHaveBeenCalledWith('Đã sao chép cURL vào clipboard')
  })

  it('shows error toast if clipboard writeText throws and execCommand fallback returns false', async () => {
    writeTextMock.mockRejectedValue(new Error('Permission denied'))
    const execCommandMock = vi.fn().mockReturnValue(false)
    document.execCommand = execCommandMock

    const requestStore = useRequestStore()
    const uiStore = useUiStore()
    const toastSpy = vi.spyOn(uiStore, 'showToast')

    requestStore.current = {
      id: 'req-1',
      name: 'Failed Fallback',
      method: 'GET',
      url: 'https://api.example.com/items',
      headers: [],
      params: [],
      body: { type: 'none', content: '' },
      created_at: '2026-10-13',
      updated_at: '2026-10-13'
    }

    const wrapper = mount(UrlBar)
    const curlBtn = wrapper.find('#copy-curl-btn')
    await curlBtn.trigger('click')

    expect(toastSpy).toHaveBeenCalledWith('Không thể sao chép vào clipboard')
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

  it('resolves 4-tier variable hierarchy (Collection Env and Folder-Env) during copyAsCurl', async () => {
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
      url: '{{base_url}}/{{api_ver}}/login',
      headers: [],
      params: [],
      body: { type: 'none', content: '' },
      created_at: '2026-10-13',
      updated_at: '2026-10-13'
    }

    const wrapper = mount(UrlBar)
    const curlBtn = wrapper.find('#copy-curl-btn')
    await curlBtn.trigger('click')

    expect(writeTextMock).toHaveBeenCalledTimes(1)
    const copiedCommand = writeTextMock.mock.calls[0][0]
    expect(copiedCommand).toContain("'http://localhost:9001/v1/login'")
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


