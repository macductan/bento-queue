import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import MockServerModal from '../MockServerModal.vue'
import { useUiStore } from '@/stores/uiStore'
import { useMockServerStore } from '@/stores/mockServerStore'

vi.mock('../../../wailsjs/go/main/App', () => ({
  GetMockServerStatus: vi.fn(),
  SaveMockServerConfig: vi.fn(),
  StartMockServer: vi.fn(),
  StopMockServer: vi.fn(),
}))

import * as AppBinding from '../../../wailsjs/go/main/App'

describe('MockServerModal.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('loads mock server status, adds/edits routes, saves config, and toggles server start/stop', async () => {
    const uiStore = useUiStore()
    const mockStore = useMockServerStore()

    vi.mocked(AppBinding.GetMockServerStatus).mockResolvedValue({
      success: true,
      data: {
        running: false,
        port: 4010,
        base_url: 'http://127.0.0.1:4010',
        routes: [
          {
            id: 'route-1',
            method: 'GET',
            path: '/api/users/:id',
            status_code: 200,
            headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
            body: '{"id":1}',
            delay_ms: 0,
            enabled: true,
          },
        ],
      },
    } as any)

    vi.mocked(AppBinding.SaveMockServerConfig).mockImplementation((async (cfg: any) => ({
      success: true,
      data: {
        running: mockStore.running,
        port: cfg.port,
        base_url: `http://127.0.0.1:${cfg.port}`,
        routes: cfg.routes,
      },
    })) as any)

    vi.mocked(AppBinding.StartMockServer).mockImplementation((async (port: number) => ({
      success: true,
      data: {
        running: true,
        port,
        base_url: `http://127.0.0.1:${port}`,
        routes: mockStore.routes,
      },
    })) as any)

    vi.mocked(AppBinding.StopMockServer).mockImplementation((async () => ({
      success: true,
      data: {
        running: false,
        port: mockStore.port,
        base_url: `http://127.0.0.1:${mockStore.port}`,
        routes: mockStore.routes,
      },
    })) as any)

    uiStore.openMockServerModal()
    const wrapper = mount(MockServerModal, {
      global: { stubs: { teleport: true } },
    })
    await flushPromises()

    expect(wrapper.find('[data-test="mock-server-modal"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-test="mock-route-row"]').length).toBe(1)

    // Add a new route
    await wrapper.find('[data-test="add-mock-route-btn"]').trigger('click')
    expect(wrapper.findAll('[data-test="mock-route-row"]').length).toBe(2)

    // Edit the new route
    await wrapper.find('[data-test="mock-route-method-select"]').setValue('POST')
    await wrapper.find('[data-test="mock-route-path-input"]').setValue('/api/orders')
    await wrapper.find('[data-test="mock-route-status-input"]').setValue('201')
    await wrapper.find('[data-test="mock-route-body-input"]').setValue('{"created":true}')

    // Save config
    await wrapper.find('[data-test="save-mock-config-btn"]').trigger('click')
    await flushPromises()
    expect(AppBinding.SaveMockServerConfig).toHaveBeenCalled()

    // Start server
    await wrapper.find('[data-test="mock-toggle-server-btn"]').trigger('click')
    await flushPromises()
    expect(AppBinding.StartMockServer).toHaveBeenCalledWith(4010)
    expect(mockStore.running).toBe(true)
    expect(wrapper.find('[data-test="mock-server-status-badge"]').text()).toContain('RUNNING')

    // Check headers section exists
    expect(wrapper.find('[data-test="mock-route-headers-section"]').exists()).toBe(true)

    // Stop server
    await wrapper.find('[data-test="mock-toggle-server-btn"]').trigger('click')
    await flushPromises()
    expect(AppBinding.StopMockServer).toHaveBeenCalled()
    expect(mockStore.running).toBe(false)
    expect(wrapper.find('[data-test="mock-server-status-badge"]').text()).toContain('STOPPED')
  })

  it('closes modal on Escape key', async () => {
    const uiStore = useUiStore()
    uiStore.mockServerModalOpen = true
    const wrapper = mount(MockServerModal, {
      global: { stubs: { teleport: true } },
    })
    await flushPromises()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(uiStore.mockServerModalOpen).toBe(false)
    wrapper.unmount()
  })
})
