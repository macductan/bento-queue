import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import HistoryModal from '../HistoryModal.vue'
import { useUiStore } from '@/stores/uiStore'
import { useHistoryStore } from '@/stores/historyStore'
import { useRequestStore } from '@/stores/requestStore'
import { useResponseStore } from '@/stores/responseStore'

vi.mock('../../../wailsjs/go/main/App', () => ({
  ListExecutionHistory: vi.fn(),
  RecordExecutionHistory: vi.fn(),
  ClearExecutionHistory: vi.fn(),
  ListChangelog: vi.fn(),
  ClearChangelog: vi.fn(),
}))

import * as AppBinding from '../../../wailsjs/go/main/App'

describe('HistoryModal.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('loads and displays Request Execution History and restores a selected execution into requestStore and responseStore', async () => {
    const uiStore = useUiStore()
    const requestStore = useRequestStore()
    const responseStore = useResponseStore()

    vi.mocked(AppBinding.ListExecutionHistory).mockResolvedValue({
      success: true,
      data: [
        {
          id: 'exec-1',
          collection_id: 'Test-Collection',
          request_id: 'req-1',
          request_name: 'List Users',
          method: 'POST',
          url: 'https://api.example.com/users',
          status_code: 201,
          status_text: '201 Created',
          time_ms: 48,
          size_bytes: 128,
          timestamp: '2026-10-15T00:00:00Z',
          request: {
            method: 'POST',
            url: 'https://api.example.com/users',
            headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
            body: '{"name":"Alice"}',
            body_type: 'json',
          },
          response: {
            status_code: 201,
            status_text: '201 Created',
            headers: { 'Content-Type': ['application/json'] },
            body: '{"id":1,"name":"Alice"}',
            time_ms: 48,
            size_bytes: 128,
            timestamp: '2026-10-15T00:00:00Z',
            truncated: false,
            is_binary: false,
          },
        },
      ],
    } as any)

    vi.mocked(AppBinding.ListChangelog).mockResolvedValue({
      success: true,
      data: [
        {
          id: 'chg-1',
          collection_id: 'Test-Collection',
          entity_type: 'request',
          entity_id: 'req-1',
          entity_name: 'List Users',
          action: 'update',
          summary: 'Cập nhật request List Users (POST)',
          timestamp: '2026-10-15T00:00:00Z',
        },
      ],
    } as any)

    uiStore.openHistoryModal()
    const wrapper = mount(HistoryModal, {
      global: { stubs: { teleport: true } }
    })
    await flushPromises()

    expect(wrapper.find('[data-test="history-modal"]').exists()).toBe(true)
    const rows = wrapper.findAll('[data-test="execution-entry-row"]')
    expect(rows.length).toBe(1)
    expect(rows[0]!.text()).toContain('List Users')
    expect(rows[0]!.text()).toContain('201')

    // Restore execution
    const restoreBtn = wrapper.find('[data-test="restore-execution-btn"]')
    expect(restoreBtn.exists()).toBe(true)
    await restoreBtn.trigger('click')
    await flushPromises()

    expect(requestStore.current?.method).toBe('POST')
    expect(requestStore.current?.url).toBe('https://api.example.com/users')
    expect(requestStore.current?.body.content).toBe('{"name":"Alice"}')
    expect(requestStore.current?.params).toEqual([])
    expect(responseStore.response?.status_code).toBe(201)
    expect(uiStore.historyModalOpen).toBe(false)
  })

  it('prompts confirmation when restoring an execution belonging to a different request and clears params', async () => {
    const uiStore = useUiStore()
    const requestStore = useRequestStore()
    const historyStore = useHistoryStore()

    requestStore.current = {
      id: 'req-current',
      name: 'Current Request',
      method: 'GET',
      url: 'https://api.example.com/current',
      headers: [],
      params: [{ key: 'page', value: '1', enabled: true }],
      body: { type: 'none', content: '' },
      auth: { type: 'inherit' },
      created_at: '',
      updated_at: ''
    }

    const confirmSpy = vi.spyOn(uiStore, 'requestConfirm').mockResolvedValue(true)

    const entry = {
      id: 'exec-diff',
      collection_id: 'coll-1',
      request_id: 'req-other',
      request_name: 'Other Request',
      method: 'PUT',
      url: 'https://api.example.com/other?foo=bar',
      status_code: 200,
      status_text: '200 OK',
      time_ms: 15,
      size_bytes: 42,
      timestamp: '2026-10-15T00:00:00Z',
      request: {
        method: 'PUT',
        url: 'https://api.example.com/other?foo=bar',
        headers: [],
        body: '{"updated":true}',
        body_type: 'json'
      }
    } as any

    const restored = await historyStore.restoreExecution(entry)
    expect(restored).toBe(true)
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Other Request'))
    expect(requestStore.current.params).toEqual([])
    expect(requestStore.current.method).toBe('PUT')
  })

  it('switches to Changelog tab and clears execution history and changelog', async () => {
    const uiStore = useUiStore()
    const historyStore = useHistoryStore()

    vi.mocked(AppBinding.ListExecutionHistory).mockResolvedValue({
      success: true,
      data: [
        {
          id: 'exec-1',
          collection_id: 'Test-Collection',
          request_name: 'Ping',
          method: 'GET',
          url: 'https://api.example.com/ping',
          status_code: 200,
          status_text: '200 OK',
          time_ms: 10,
          size_bytes: 16,
          timestamp: '2026-10-15T00:00:00Z',
          request: { method: 'GET', url: 'https://api.example.com/ping', headers: [], body: '' },
        },
      ],
    } as any)

    vi.mocked(AppBinding.ListChangelog).mockResolvedValue({
      success: true,
      data: [
        {
          id: 'chg-1',
          collection_id: 'Test-Collection',
          entity_type: 'folder',
          entity_id: 'fld-1',
          entity_name: 'Auth Folder',
          action: 'create',
          summary: 'Tạo thư mục Auth Folder',
          timestamp: '2026-10-15T00:00:00Z',
        },
      ],
    } as any)

    vi.mocked(AppBinding.ClearExecutionHistory).mockResolvedValue({ success: true } as any)
    vi.mocked(AppBinding.ClearChangelog).mockResolvedValue({ success: true } as any)
    const confirmSpy = vi.spyOn(uiStore, 'requestConfirm').mockResolvedValue(true)

    uiStore.openHistoryModal()
    const wrapper = mount(HistoryModal, {
      global: { stubs: { teleport: true } }
    })
    await flushPromises()

    // Clear executions with confirmation
    await wrapper.find('[data-test="clear-executions-btn"]').trigger('click')
    await flushPromises()
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('lịch sử gọi API'))
    expect(historyStore.executions.length).toBe(0)

    // Switch to Changelog tab
    await wrapper.find('[data-test="history-tab-changelog"]').trigger('click')
    const chgRows = wrapper.findAll('[data-test="changelog-entry-row"]')
    expect(chgRows.length).toBe(1)
    expect(chgRows[0]!.text()).toContain('Tạo thư mục Auth Folder')

    // Clear changelog with confirmation
    await wrapper.find('[data-test="clear-changelog-btn"]').trigger('click')
    await flushPromises()
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('lịch sử thay đổi'))
    expect(historyStore.changelog.length).toBe(0)
  })

  it('closes modal on Escape key', async () => {
    const uiStore = useUiStore()
    uiStore.openHistoryModal()
    const wrapper = mount(HistoryModal, {
      global: { stubs: { teleport: true } }
    })
    await flushPromises()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(uiStore.historyModalOpen).toBe(false)
    wrapper.unmount()
  })
})
