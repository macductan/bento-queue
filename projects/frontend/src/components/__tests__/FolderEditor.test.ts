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

  it('auto-detects selectedEnvScope from envStore.activeEnvId on folder open and folder switch without dirtying state', async () => {
    const { useEnvironmentStore } = await import('@/stores/environmentStore')
    const envStore = useEnvironmentStore()
    envStore.environments = [
      { id: 'env-local', name: 'Local', variables: [] } as any,
      { id: 'env-prod', name: 'Prod', variables: [] } as any
    ]
    envStore.activeEnvId = 'env-local'

    const colStore = useCollectionStore()
    colStore.activeFolderId = 'folder-1'
    colStore.tree = [
      { ...mockTreeNode },
      { ...mockTreeNode, id: 'folder-2', name: 'Folder 2' }
    ]

    const wrapper = mountEditor()
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.selectedEnvScope).toBe('env-local')
    expect(vm.folder_envs['env-local']).toEqual([])
    expect(vm.isDirty).toBe(false)
    expect(vm.saveStatus).toBe('saved')

    // User manually switches dropdown to Folder Global Env
    const select = wrapper.find('select#folder-env-scope-select')
    await select.setValue('__folder_global__')
    expect(vm.selectedEnvScope).toBe('__folder_global__')

    // User switches to folder-2 -> auto-detects 'env-local' again
    colStore.activeFolderId = 'folder-2'
    await flushPromises()
    expect(vm.selectedEnvScope).toBe('env-local')
    expect(vm.isDirty).toBe(false)
  })

  it('updates selectedEnvScope reactively when envStore.activeEnvId changes on Header while preserving folder edits', async () => {
    const { useEnvironmentStore } = await import('@/stores/environmentStore')
    const envStore = useEnvironmentStore()
    envStore.environments = [
      { id: 'env-local', name: 'Local', variables: [] } as any,
      { id: 'env-prod', name: 'Prod', variables: [] } as any
    ]
    envStore.activeEnvId = 'env-local'

    const colStore = useCollectionStore()
    colStore.activeFolderId = 'folder-1'
    colStore.tree = [{ ...mockTreeNode }]

    const wrapper = mountEditor()
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.selectedEnvScope).toBe('env-local')

    // Edit variable in env-local scope
    vm.currentScopeVariables = [{ key: 'local_key', value: 'local_val', enabled: true }]
    await nextTick()
    expect(vm.isDirty).toBe(true)

    // Header changes activeEnvId to 'env-prod'
    envStore.activeEnvId = 'env-prod'
    await nextTick()
    expect(vm.selectedEnvScope).toBe('env-prod')
    expect(vm.folder_envs['env-local']).toEqual([{ key: 'local_key', value: 'local_val', enabled: true }])
    expect(vm.isDirty).toBe(true)

    // Header changes activeEnvId to null ("Không dùng env")
    envStore.activeEnvId = null
    await nextTick()
    expect(vm.selectedEnvScope).toBe('__folder_global__')
    expect(vm.isDirty).toBe(true)
  })

  it('falls back to __folder_global__ when activeEnvId is not in environments or when a manually selected env is deleted from environments', async () => {
    const { useEnvironmentStore } = await import('@/stores/environmentStore')
    const envStore = useEnvironmentStore()
    envStore.environments = [
      { id: 'env-local', name: 'Local', variables: [] } as any,
      { id: 'env-prod', name: 'Prod', variables: [] } as any
    ]
    // activeEnvId points to a non-existent environment
    envStore.activeEnvId = 'env-missing'

    const colStore = useCollectionStore()
    colStore.activeFolderId = 'folder-1'
    colStore.tree = [{ ...mockTreeNode }]

    const wrapper = mountEditor()
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.selectedEnvScope).toBe('__folder_global__')

    // User manually selects 'env-prod'
    const select = wrapper.find('select#folder-env-scope-select')
    await select.setValue('env-prod')
    expect(vm.selectedEnvScope).toBe('env-prod')

    // 'env-prod' is deleted from envStore.environments while activeEnvId is 'env-local'
    envStore.activeEnvId = null
    await nextTick()
    await select.setValue('env-prod')
    expect(vm.selectedEnvScope).toBe('env-prod')

    envStore.environments = [
      { id: 'env-local', name: 'Local', variables: [] } as any
    ]
    await nextTick()
    expect(vm.selectedEnvScope).toBe('__folder_global__')
  })

  it('includes current folder in folderHierarchyNodes and effectiveVariables while keeping parentNodes for AuthEditor, and guards syncExternalFolderVariables when dirty', async () => {
    const colStore = useCollectionStore()
    colStore.activeFolderId = 'folder-1'
    colStore.tree = [
      {
        id: 'parent-folder',
        name: 'Parent Folder',
        type: 'folder',
        path: 'Parent Folder',
        created_at: '2026-10-13',
        variables: [{ key: 'parent_var', value: 'p1', enabled: true }],
        children: [
          { ...mockTreeNode, path: 'Parent Folder/Auth Module' }
        ]
      }
    ]

    const wrapper = mountEditor()
    await flushPromises()

    const vm = wrapper.vm as any
    expect(vm.parentNodes.map((n: any) => n.id)).toEqual(['parent-folder'])
    expect(vm.folderHierarchyNodes.map((n: any) => n.id)).toEqual(['parent-folder', 'folder-1'])
    expect(vm.effectiveVariables.get('parent_var')).toBe('p1')
    expect(vm.effectiveVariables.get('base_url')).toBe('https://api.com')

    // External update when clean should sync
    window.dispatchEvent(new CustomEvent('hecto:folder-updated', {
      detail: {
        id: 'folder-1',
        variables: [{ key: 'base_url', value: 'https://synced.api.com', enabled: true }],
        folder_envs: {}
      }
    }))
    await nextTick()
    expect(vm.variables[0].value).toBe('https://synced.api.com')
    expect(vm.isDirty).toBe(false)

    // External update when dirty should NOT overwrite unsaved edits
    vm.headers.push({ key: 'X-Unsaved', value: '1', enabled: true })
    await nextTick()
    expect(vm.isDirty).toBe(true)

    window.dispatchEvent(new CustomEvent('hecto:folder-updated', {
      detail: {
        id: 'folder-1',
        variables: [{ key: 'base_url', value: 'https://overwrite-attempt.api.com', enabled: true }],
        folder_envs: {}
      }
    }))
    await nextTick()
    expect(vm.variables[0].value).toBe('https://synced.api.com')
  })

  it('integrates real KvpEditor, AuthEditor, and DefaultHeadersTable with 4-tier variable resolution and visible Key inputs', async () => {
    const { useEnvironmentStore } = await import('@/stores/environmentStore')
    const envStore = useEnvironmentStore()
    const colStore = useCollectionStore()

    // Tier 1: Collection Env
    colStore.collections = [
      {
        id: 'Test-Collection',
        name: 'Test-Collection',
        variables: [{ key: 'coll_var', value: 'coll-val', enabled: true }]
      } as any
    ]
    colStore.activeCollectionId = 'Test-Collection'

    // Tier 2: Active Global Env
    envStore.environments = [
      {
        id: 'env-dev',
        name: 'Dev',
        variables: [{ key: 'env_name', value: 'staging', enabled: true }]
      } as any
    ]
    envStore.activeEnvId = 'env-dev'

    // Tier 3 & 4: Parent Folder & Current Folder
    colStore.activeFolderId = 'folder-1'
    colStore.tree = [
      {
        id: 'parent-folder',
        name: 'Parent Folder',
        type: 'folder',
        path: 'Parent Folder',
        created_at: '2026-10-13',
        headers: [{ key: 'X-Env', value: '{{env_name}}-{{parent_var}}', enabled: true }],
        auth: { type: 'bearer', bearer: { token: '{{bearer_token}}' } },
        variables: [{ key: 'parent_var', value: 'parent-v1', enabled: true }],
        children: [
          { ...mockTreeNode, path: 'Parent Folder/Auth Module' }
        ]
      }
    ]

    vi.useFakeTimers()
    vi.mocked(LoadFolder).mockResolvedValue({
      success: true,
      data: {
        id: 'folder-1',
        name: 'Auth Module',
        variables: [{ key: 'bearer_token', value: 'secret-jwt', enabled: true }],
        folder_envs: {
          'env-dev': [{ key: 'bearer_token', value: 'env-specific-jwt', enabled: true }]
        },
        headers: [{ key: 'X-Custom', value: '{{coll_var}}', enabled: true }],
        auth: { type: 'bearer', bearer: { token: '{{bearer_token}}' } }
      }
    } as any)

    activeWrapper = mount(FolderEditor, { attachTo: document.body })
    await flushPromises()
    await nextTick()

    // 1. Verify DefaultHeadersTable in FolderEditor resolves 4-tier variables for inherited headers and preserves rawValue
    const vm = activeWrapper.vm as any
    const inheritedEnvHeader = vm.defaultHeaders.find((h: any) => h.key === 'X-Env')
    const authHeader = vm.defaultHeaders.find((h: any) => h.key === 'Authorization')
    expect(inheritedEnvHeader).toEqual(
      expect.objectContaining({
        key: 'X-Env',
        value: 'staging-parent-v1',
        rawValue: '{{env_name}}-{{parent_var}}',
        source: 'folder'
      })
    )
    expect(authHeader).toEqual(
      expect.objectContaining({
        key: 'Authorization',
        value: 'Bearer env-specific-jwt',
        source: 'auth'
      })
    )

    // Verify toggleDefaultHeader disable / re-enable cycle preserves rawValue for folder header and '' for auth header
    vm.toggleDefaultHeader(inheritedEnvHeader)
    expect(vm.headers).toContainEqual({
      key: 'X-Env',
      value: '{{env_name}}-{{parent_var}}',
      enabled: false
    })
    vm.toggleDefaultHeader(vm.defaultHeaders.find((h: any) => h.key === 'X-Env'))
    expect(vm.headers.some((h: any) => h.key === 'X-Env')).toBe(false)

    vm.toggleDefaultHeader(authHeader)
    expect(vm.headers).toContainEqual({
      key: 'Authorization',
      value: '',
      enabled: false
    })
    vm.toggleDefaultHeader(vm.defaultHeaders.find((h: any) => h.key === 'Authorization'))
    expect(vm.headers.some((h: any) => h.key === 'Authorization')).toBe(false)

    // 2. Verify Key input in KvpEditor uses text-text-primary (not text-transparent) and Value highlights {{coll_var}}
    const keyInputs = activeWrapper.findAll('input[placeholder="Key"]')
    expect(keyInputs.length).toBeGreaterThan(0)
    expect(keyInputs[0].classes()).toContain('text-text-primary')
    expect(keyInputs[0].classes()).not.toContain('text-transparent')
    expect(activeWrapper.find('span.text-variable-valid').text()).toBe('{{coll_var}}')

    // 3. Verify typing into phantom row of Variables tab in env-dev scope binds directly to folder_envs['env-dev']
    const varsTabInputs = activeWrapper.findAll('input[placeholder="Key"]')
    const lastPhantomKeyInput = varsTabInputs[varsTabInputs.length - 1]
    ;(lastPhantomKeyInput.element as HTMLInputElement).value = 'new_env_var'
    await lastPhantomKeyInput.trigger('input')
    await nextTick()

    expect(vm.folder_envs['env-dev']).toEqual([
      { key: 'bearer_token', value: 'env-specific-jwt', enabled: true },
      { key: 'new_env_var', value: '', enabled: true }
    ])

    // 4. Verify AuthEditor highlights {{bearer_token}} and hovering opens VariableHoverPopover with all 4 tiers
    const bearerInput = activeWrapper.find('input#bearer-token-input')
    expect(bearerInput.exists()).toBe(true)
    expect(bearerInput.attributes('type')).toBe('text')
    const bearerSpan = activeWrapper
      .findAll('span.text-variable-valid')
      .find((s: any) => s.text() === '{{bearer_token}}')
    expect(bearerSpan).toBeDefined()

    await bearerSpan!.trigger('mousemove')
    await vi.advanceTimersByTimeAsync(200)
    await nextTick()

    const popover = document.body.querySelector('[data-test="variable-hover-popover"]')
    expect(popover).not.toBeNull()
    expect(popover?.textContent).toContain('Folder: Auth Module (Dev)')
    expect(popover?.textContent).toContain('Folder: Auth Module (Dùng chung)')
    expect(popover?.textContent).toContain('Folder: Parent Folder (Dev)')
    expect(popover?.textContent).toContain('Folder: Parent Folder (Dùng chung)')
    expect(popover?.textContent).toContain('Global Env (Dev)')
    expect(popover?.textContent).toContain('Collection Env (Dùng chung)')
  })
})





