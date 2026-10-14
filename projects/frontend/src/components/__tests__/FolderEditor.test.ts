import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import FolderEditor from '../FolderEditor.vue'
import { useCollectionStore, type TreeNode } from '@/stores/collectionStore'
import { useUiStore } from '@/stores/uiStore'
import { LoadFolder, UpdateFolder } from '../../../wailsjs/go/main/App'

vi.mock('../../../wailsjs/go/main/App', () => ({
  LoadFolder: vi.fn(),
  UpdateFolder: vi.fn(),
  GetCollectionTree: vi.fn().mockResolvedValue({ success: true, data: [] }),
  ListEnvironments: vi.fn().mockResolvedValue({ success: true, data: [] })
}))

describe('FolderEditor.vue - Auto-save & Save State Indicator', () => {
  const mockFolder = {
    id: 'folder-1',
    name: 'Auth Module',
    variables: [{ key: 'base_url', value: 'https://api.com', enabled: true }],
    headers: [{ key: 'X-App', value: 'web', enabled: true }],
    auth: { type: 'inherit' as const }
  }

  const mockTreeNode: TreeNode = {
    id: 'folder-1',
    name: 'Auth Module',
    type: 'folder',
    path: '/collections/default/Auth Module',
    created_at: '2026-10-13',
    children: []
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(LoadFolder).mockResolvedValue({ success: true, data: JSON.parse(JSON.stringify(mockFolder)) } as any)
    vi.mocked(UpdateFolder).mockResolvedValue({ success: true, data: {} } as any)
  })

  let activeWrapper: any = null

  afterEach(() => {
    if (activeWrapper) {
      activeWrapper.unmount()
      activeWrapper = null
    }
    vi.useRealTimers()
  })

  const mountEditor = () => {
    activeWrapper = mount(FolderEditor, {
      global: {
        stubs: {
          KvpEditor: true,
          AuthEditor: true
        }
      }
    })
    return activeWrapper
  }

  it('loads folder data and displays "Đã lưu" state initially', async () => {
    const colStore = useCollectionStore()
    colStore.activeFolderId = 'folder-1'
    colStore.tree = [{ ...mockTreeNode }]

    const wrapper = mountEditor()
    await nextTick()
    await nextTick()

    const indicator = wrapper.find('[data-test="folder-save-state-indicator"]')
    expect(indicator.exists()).toBe(true)
    expect(indicator.attributes('data-status')).toBe('saved')
    expect(indicator.text()).toContain('Đã lưu')
  })

  it('triggers debounced auto-save (800ms) when folder data is modified', async () => {
    vi.useFakeTimers()
    const colStore = useCollectionStore()
    colStore.activeFolderId = 'folder-1'
    colStore.tree = [{ ...mockTreeNode }]

    const wrapper = mountEditor()
    await nextTick()
    await nextTick()

    // Modify headers
    const vm = wrapper.vm as any
    vm.headers.push({ key: 'X-New', value: '123', enabled: true })
    await nextTick()

    const indicator = wrapper.find('[data-test="folder-save-state-indicator"]')
    expect(indicator.attributes('data-status')).toBe('unsaved')
    expect(indicator.text()).toContain('Chưa lưu')
    expect(UpdateFolder).not.toHaveBeenCalled()

    // Fast-forward 800ms
    await vi.advanceTimersByTimeAsync(800)

    expect(UpdateFolder).toHaveBeenCalledTimes(1)
    expect(indicator.attributes('data-status')).toBe('saved')
    expect(indicator.text()).toContain('Đã lưu')
  })

  it('flushes pending changes on unmount', async () => {
    const colStore = useCollectionStore()
    colStore.activeFolderId = 'folder-1'
    colStore.tree = [{ ...mockTreeNode }]

    const wrapper = mountEditor()
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as any
    vm.headers.push({ key: 'X-Unmount', value: 'val', enabled: true })
    await nextTick()

    wrapper.unmount()
    activeWrapper = null
    await nextTick()

    expect(UpdateFolder).toHaveBeenCalledTimes(1)
  })

  it('saves on manual Ctrl+S and displays toast notification', async () => {
    const colStore = useCollectionStore()
    const uiStore = useUiStore()
    colStore.activeFolderId = 'folder-1'
    colStore.tree = [{ ...mockTreeNode }]

    const wrapper = mountEditor()
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as any
    vm.variables.push({ key: 'token', value: 'xyz', enabled: true })
    await nextTick()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))
    await nextTick()
    await nextTick()

    expect(UpdateFolder).toHaveBeenCalledTimes(1)
    expect(uiStore.toast?.text).toBe('Đã lưu cấu hình thư mục')
  })

  it('handles save error and shows error indicator and toast', async () => {
    vi.mocked(UpdateFolder).mockResolvedValueOnce({
      success: false,
      error: { message: 'Disk write failed' }
    } as any)

    const colStore = useCollectionStore()
    const uiStore = useUiStore()
    colStore.activeFolderId = 'folder-1'
    colStore.tree = [{ ...mockTreeNode }]

    const wrapper = mountEditor()
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as any
    vm.variables.push({ key: 'new_var', value: '1', enabled: true })
    await nextTick()

    await vm.saveFolderData()
    await nextTick()

    const indicator = wrapper.find('[data-test="folder-save-state-indicator"]')
    expect(indicator.attributes('data-status')).toBe('error')
    expect(indicator.text()).toContain('Lỗi khi lưu')
    expect(uiStore.toast?.text).toBe('Disk write failed')
  })

  it('does not get stuck in dirty loop when empty key rows are added', async () => {
    vi.useFakeTimers()
    const colStore = useCollectionStore()
    colStore.activeFolderId = 'folder-1'
    colStore.tree = [{ ...mockTreeNode }]

    const wrapper = mountEditor()
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as any
    // Add empty key rows
    vm.headers.push({ key: '', value: '', enabled: true })
    vm.variables.push({ key: '   ', value: 'empty', enabled: true })
    await nextTick()

    // Empty key rows are filtered out by clean snapshot, so isDirty should be false
    expect(vm.isDirty).toBe(false)
    expect(vm.saveStatus).toBe('saved')

    await vi.advanceTimersByTimeAsync(1000)
    expect(UpdateFolder).not.toHaveBeenCalled()
  })

  it('flushes dirty folder when changing activeFolderId to another folder', async () => {
    const colStore = useCollectionStore()
    colStore.activeFolderId = 'folder-1'
    colStore.tree = [
      { ...mockTreeNode },
      { ...mockTreeNode, id: 'folder-2', name: 'Folder 2' }
    ]

    const wrapper = mountEditor()
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as any
    vm.headers.push({ key: 'X-Folder1-Edit', value: 'val', enabled: true })
    await nextTick()
    expect(vm.isDirty).toBe(true)

    // Switch to folder-2
    colStore.activeFolderId = 'folder-2'
    await flushPromises()

    expect(UpdateFolder).toHaveBeenCalledTimes(1)
    expect(LoadFolder).toHaveBeenCalledWith('folder-2')
  })

  it('suppresses debounced save when uiStore.autoSaveEnabled is false', async () => {
    vi.useFakeTimers()
    const uiStore = useUiStore()
    uiStore.setAutoSaveEnabled(false)

    const colStore = useCollectionStore()
    colStore.activeFolderId = 'folder-1'
    colStore.tree = [{ ...mockTreeNode }]

    const wrapper = mountEditor()
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as any
    vm.headers.push({ key: 'X-Disabled-Setting', value: '1', enabled: true })
    await nextTick()

    expect(vm.isDirty).toBe(true)
    expect(vm.saveStatus).toBe('unsaved')

    await vi.advanceTimersByTimeAsync(1000)
    expect(UpdateFolder).not.toHaveBeenCalled()
  })

  it('allows switching environment scope and editing folder_envs', async () => {
    const { useEnvironmentStore } = await import('@/stores/environmentStore')
    const envStore = useEnvironmentStore()
    envStore.environments = [
      { id: 'env-dev', name: 'Development', variables: [] } as any,
      { id: 'env-prod', name: 'Production', variables: [] } as any
    ]

    const folderWithEnvs = {
      ...mockFolder,
      variables: [{ key: 'f_global', value: '1', enabled: true }],
      folder_envs: {
        'env-dev': [{ key: 'auth_url', value: 'https://dev.auth.com', enabled: true }]
      }
    }
    vi.mocked(LoadFolder).mockResolvedValue({ success: true, data: folderWithEnvs } as any)

    const colStore = useCollectionStore()
    colStore.activeFolderId = 'folder-1'
    colStore.tree = [{ ...mockTreeNode }]

    const wrapper = mountEditor()
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as any
    expect(vm.selectedEnvScope).toBe('__folder_global__')
    expect(vm.currentScopeVariables[0].key).toBe('f_global')

    // Switch scope to env-dev
    vm.selectedEnvScope = 'env-dev'
    await nextTick()
    expect(vm.currentScopeVariables[0].key).toBe('auth_url')
    expect(vm.currentScopeVariables[0].value).toBe('https://dev.auth.com')

    // Add a variable for env-dev
    vm.currentScopeVariables.push({ key: 'timeout', value: '2000', enabled: true })
    await nextTick()
    expect(vm.isDirty).toBe(true)

    // Save
    await vm.saveFolderData()
    expect(UpdateFolder).toHaveBeenCalledWith(expect.objectContaining({
      variables: [{ key: 'f_global', value: '1', enabled: true }],
      folder_envs: {
        'env-dev': [
          { key: 'auth_url', value: 'https://dev.auth.com', enabled: true },
          { key: 'timeout', value: '2000', enabled: true }
        ]
      }
    }))
  })

  it('renders select with dark mode styling, updates total variables badge, and switches scope via DOM', async () => {
    const { useEnvironmentStore } = await import('@/stores/environmentStore')
    const envStore = useEnvironmentStore()
    envStore.environments = [
      { id: 'env-dev', name: 'Development', variables: [] } as any
    ]

    const folderWithEnvs = {
      ...mockFolder,
      variables: [{ key: 'f_global', value: '1', enabled: true }],
      folder_envs: {
        'env-dev': [
          { key: 'auth_url', value: 'https://dev.auth.com', enabled: true },
          { key: 'empty_ignore', value: '', enabled: true },
          { key: '   ', value: 'ignored', enabled: true }
        ]
      }
    }
    vi.mocked(LoadFolder).mockResolvedValue({ success: true, data: folderWithEnvs } as any)

    const colStore = useCollectionStore()
    colStore.activeFolderId = 'folder-1'
    colStore.tree = [{ ...mockTreeNode }]

    const wrapper = mountEditor()
    await nextTick()
    await nextTick()

    const vm = wrapper.vm as any
    // 1 valid in variables + 2 valid non-blank keys in folder_envs['env-dev'] = 3
    expect(vm.totalVariablesCount).toBe(3)

    const select = wrapper.find('select#folder-env-scope-select')
    expect(select.exists()).toBe(true)
    expect(select.classes()).toContain('appearance-none')
    expect(select.classes()).toContain('bg-surface-overlay')

    await select.setValue('env-dev')
    expect(vm.selectedEnvScope).toBe('env-dev')
    expect(vm.currentScopeVariables[0].key).toBe('auth_url')
  })
})

