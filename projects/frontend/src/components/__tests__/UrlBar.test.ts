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
})
