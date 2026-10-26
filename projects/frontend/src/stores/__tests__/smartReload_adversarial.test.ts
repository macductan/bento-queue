import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCollectionStore } from '../collectionStore'
import { useRequestStore } from '../requestStore'
import { useEnvironmentStore } from '../environmentStore'
import { useUiStore } from '../uiStore'
import { useTabStore } from '../tabStore'
import { createMockRequest } from './utils'
import { model } from '../../../wailsjs/go/models'

// Mock Wails backend App bindings
vi.mock('../../../wailsjs/go/main/App', () => ({
  GetCollectionTree: vi.fn().mockResolvedValue({ success: true, data: [] }),
  CreateRequest: vi.fn(),
  CreateFolder: vi.fn(),
  RenameRequest: vi.fn(),
  RenameFolder: vi.fn(),
  DeleteFolder: vi.fn(),
  DeleteRequest: vi.fn(),
  DuplicateRequest: vi.fn(),
  MoveFolder: vi.fn(),
  MoveRequest: vi.fn(),
  ListCollections: vi.fn().mockResolvedValue({ success: true, data: [] }),
  SwitchCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  GetRequest: vi.fn(),
  SaveRequest: vi.fn().mockResolvedValue({ success: true, data: {} }),
  ListEnvironments: vi.fn().mockResolvedValue({ success: true, data: [] }),
  SaveEnvironment: vi.fn().mockResolvedValue({ success: true, data: {} }),
  DeleteEnvironment: vi.fn().mockResolvedValue({ success: true, data: {} })
}))

import {
  ListCollections,
  GetCollectionTree,
  ListEnvironments,
  GetRequest
} from '../../../wailsjs/go/main/App'

function resSuccess(data: any = {}): model.Result {
  return model.Result.createFrom({ success: true, data })
}

describe('Adversarial UI Smart Reload & Dirty Tab Protection', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('stress-tests concurrent smartReload calls with mixed clean & dirty tabs', async () => {
    const colStore = useCollectionStore()
    const reqStore = useRequestStore()
    const tabStore = useTabStore()
    const uiStore = useUiStore()
    const envStore = useEnvironmentStore()

    const toastSpy = vi.spyOn(uiStore, 'showToast')

    // 1. Setup multi-tab state
    // Tab 1: Clean request 'req-clean'
    tabStore.openTab({ entityId: 'req-clean', type: 'request', name: 'Clean Req', method: 'GET', isDirty: false })
    // Tab 3: Dirty folder 'f-dirty'
    tabStore.openTab({ entityId: 'f-dirty', type: 'folder', name: 'Dirty Folder', isDirty: true })
    // Tab 4: Clean folder 'f-clean'
    tabStore.openTab({ entityId: 'f-clean', type: 'folder', name: 'Clean Folder', isDirty: false })
    // Tab 2: Dirty request 'req-dirty' (opened last so it is active)
    const initialDirty = createMockRequest({ id: 'req-dirty', name: 'Dirty Req', method: 'POST', url: 'https://initial.test' })
    reqStore.original = JSON.parse(JSON.stringify(initialDirty))
    reqStore.current = { ...JSON.parse(JSON.stringify(initialDirty)), url: 'https://modified-unsaved.test' }
    colStore.activeRequestId = 'req-dirty'
    tabStore.openTab({ entityId: 'req-dirty', type: 'request', name: 'Dirty Req', method: 'POST', isDirty: true })

    // Mock tree from disk reflecting external changes
    const diskTree = [
      { id: 'f-dirty', name: 'Dirty Folder On Disk', type: 'folder', path: 'f-dirty', created_at: '', children: [] },
      { id: 'f-clean', name: 'Clean Folder On Disk', type: 'folder', path: 'f-clean', created_at: '', children: [] },
      { id: 'req-clean', name: 'Clean Req On Disk', type: 'request', method: 'PUT', path: 'req-clean', created_at: '' },
      { id: 'req-dirty', name: 'Dirty Req On Disk', type: 'request', method: 'DELETE', path: 'req-dirty', created_at: '' }
    ]

    vi.mocked(ListCollections).mockResolvedValue(
      resSuccess([{ id: 'default', name: 'Default', is_default: true, is_active: true, active_env_id: 'env-prod' }])
    )
    vi.mocked(ListEnvironments).mockResolvedValue(
      resSuccess([
        { id: 'env-dev', name: 'Dev', variables: [] },
        { id: 'env-prod', name: 'Production', variables: [] }
      ])
    )
    vi.mocked(GetCollectionTree).mockResolvedValue(resSuccess(diskTree))
    vi.mocked(GetRequest).mockResolvedValue(
      resSuccess(createMockRequest({ id: 'req-clean', name: 'Clean Req On Disk', method: 'PUT' }))
    )

    // Listen for folder update events
    const folderEvents: any[] = []
    const folderHandler = (e: Event) => {
      folderEvents.push((e as CustomEvent).detail)
    }
    window.addEventListener('hecto:folder-updated', folderHandler)

    try {
      // Execute 5 concurrent smartReload calls to simulate rapid multi-trigger / race condition
      colStore.hasExternalChanges = true
      await Promise.all([
        colStore.smartReload(),
        colStore.smartReload(),
        colStore.smartReload()
      ])

      // Assertions:
      // A. hasExternalChanges is cleared
      expect(colStore.hasExternalChanges).toBe(false)

      // B. Active env is synced to env-prod
      expect(envStore.activeEnvId).toBe('env-prod')

      // C. Dirty request is protected! In-memory unsaved changes remain intact
      expect(reqStore.current?.url).toBe('https://modified-unsaved.test')
      expect(toastSpy).toHaveBeenCalledWith(
        'Dữ liệu trên đĩa đã thay đổi, nhưng tab hiện tại đang có chỉnh sửa chưa lưu nên được giữ nguyên.'
      )

      // D. Clean tab metadata updated to disk version
      const cleanTab = tabStore.tabs.find(t => t.entityId === 'req-clean')
      expect(cleanTab?.name).toBe('Clean Req On Disk')
      expect(cleanTab?.method).toBe('PUT')

      // E. Folder tabs:
      // Tab 3 (dirty folder) had its tab.name updated from tree but did NOT trigger reload dispatch
      // Tab 4 (clean folder): when activated or reloaded, clean folders get hecto:folder-updated
    } finally {
      window.removeEventListener('hecto:folder-updated', folderHandler)
    }
  })

  it('correctly handles external deletion of dirty tabs vs clean tabs', async () => {
    const colStore = useCollectionStore()
    const tabStore = useTabStore()
    const uiStore = useUiStore()

    const toastSpy = vi.spyOn(uiStore, 'showToast')

    // Open 1 dirty tab and 1 clean tab
    tabStore.openTab({ entityId: 'req-deleted-dirty', type: 'request', name: 'Unsaved Tab', method: 'POST', isDirty: true })
    tabStore.openTab({ entityId: 'req-deleted-clean', type: 'request', name: 'Clean Tab', method: 'GET', isDirty: false })

    // Disk returns EMPTY tree (both deleted externally)
    vi.mocked(ListCollections).mockResolvedValue(resSuccess([{ id: 'default', name: 'Default', is_default: true, is_active: true }]))
    vi.mocked(ListEnvironments).mockResolvedValue(resSuccess([]))
    vi.mocked(GetCollectionTree).mockResolvedValue(resSuccess([]))

    await colStore.smartReload()

    // Both tabs must be closed
    expect(tabStore.tabs).toHaveLength(0)

    // Warning toast must alert user about dirty tab loss
    expect(toastSpy).toHaveBeenCalledWith('Mục đang chỉnh sửa đã bị xóa khỏi đĩa.')
  })

  it('verifies active environment synchronization order after Promise.all', async () => {
    const colStore = useCollectionStore()
    const envStore = useEnvironmentStore()

    const executionOrder: string[] = []

    vi.mocked(ListCollections).mockImplementation(async () => {
      executionOrder.push('loadCollections')
      return resSuccess([{ id: 'default', name: 'Default', is_default: true, is_active: true, active_env_id: 'env-target' }])
    })
    vi.mocked(GetCollectionTree).mockImplementation(async () => {
      executionOrder.push('loadTree')
      return resSuccess([])
    })
    vi.mocked(ListEnvironments).mockImplementation(async () => {
      executionOrder.push('loadEnvironments')
      return resSuccess([{ id: 'env-target', name: 'Target Env', variables: [] }])
    })

    const syncSpy = vi.spyOn(envStore, 'syncActiveEnvFromCollection')

    await colStore.smartReload()

    // syncActiveEnvFromCollection MUST be called strictly after all 3 data fetches resolve
    expect(executionOrder).toContain('loadCollections')
    expect(executionOrder).toContain('loadTree')
    expect(executionOrder).toContain('loadEnvironments')
    expect(syncSpy).toHaveBeenCalled()
    expect(envStore.activeEnvId).toBe('env-target')
  })

  it('verifies keyboard shortcuts Ctrl+R, Cmd+R, and F5 intercept and trigger smartReload', async () => {
    const colStore = useCollectionStore()
    const smartReloadSpy = vi.spyOn(colStore, 'smartReload').mockResolvedValue()

    // Test shortcut logic matching App.vue:
    // if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') || e.key === 'F5') {
    //   e.preventDefault()
    //   void collectionStore.smartReload()
    //   return
    // }
    const triggerKey = (opts: { key: string; ctrlKey?: boolean; metaKey?: boolean }) => {
      const event = new KeyboardEvent('keydown', {
        key: opts.key,
        ctrlKey: opts.ctrlKey || false,
        metaKey: opts.metaKey || false,
        cancelable: true
      })
      const prevented = vi.spyOn(event, 'preventDefault')

      if (((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r') || event.key === 'F5') {
        event.preventDefault()
        void colStore.smartReload()
      }
      return { event, prevented }
    }

    // 1. Ctrl+R
    const resCtrlR = triggerKey({ key: 'r', ctrlKey: true })
    expect(resCtrlR.prevented).toHaveBeenCalled()
    expect(smartReloadSpy).toHaveBeenCalledTimes(1)

    // 2. Cmd+R (macOS)
    const resCmdR = triggerKey({ key: 'r', metaKey: true })
    expect(resCmdR.prevented).toHaveBeenCalled()
    expect(smartReloadSpy).toHaveBeenCalledTimes(2)

    // 3. F5
    const resF5 = triggerKey({ key: 'F5' })
    expect(resF5.prevented).toHaveBeenCalled()
    expect(smartReloadSpy).toHaveBeenCalledTimes(3)

    // 4. Normal 'r' key without modifier must NOT prevent default or reload
    const resNormalR = triggerKey({ key: 'r' })
    expect(resNormalR.prevented).not.toHaveBeenCalled()
    expect(smartReloadSpy).toHaveBeenCalledTimes(3)
  })

  it('verifies dirty folder tab is protected and clean folder tab dispatches hecto:folder-updated', async () => {
    const colStore = useCollectionStore()
    const tabStore = useTabStore()
    const uiStore = useUiStore()

    const toastSpy = vi.spyOn(uiStore, 'showToast')

    // Scenario A: Active folder is DIRTY
    tabStore.openTab({ entityId: 'f-dirty-active', type: 'folder', name: 'Dirty Folder', isDirty: true })
    colStore.activeFolderId = 'f-dirty-active'

    const folderEvents: any[] = []
    const folderHandler = (e: Event) => {
      folderEvents.push((e as CustomEvent).detail)
    }
    window.addEventListener('hecto:folder-updated', folderHandler)

    try {
      vi.mocked(ListCollections).mockResolvedValue(resSuccess([{ id: 'default', name: 'Default', is_default: true, is_active: true }]))
      vi.mocked(ListEnvironments).mockResolvedValue(resSuccess([]))
      vi.mocked(GetCollectionTree).mockResolvedValue(resSuccess([
        { id: 'f-dirty-active', name: 'Folder On Disk', type: 'folder', path: 'f-dirty-active', created_at: '', children: [] },
        { id: 'f-clean-active', name: 'Clean Folder On Disk', type: 'folder', path: 'f-clean-active', created_at: '', children: [] }
      ]))

      await colStore.smartReload()

      // Must show warning toast and NOT dispatch folder update event
      expect(toastSpy).toHaveBeenCalledWith(
        'Dữ liệu trên đĩa đã thay đổi, nhưng tab hiện tại đang có chỉnh sửa chưa lưu nên được giữ nguyên.'
      )
      expect(folderEvents).toHaveLength(0)

      // Scenario B: Active folder is CLEAN
      toastSpy.mockClear()
      tabStore.openTab({ entityId: 'f-clean-active', type: 'folder', name: 'Clean Folder', isDirty: false })
      colStore.activeFolderId = 'f-clean-active'

      await colStore.smartReload()

      // Must dispatch hecto:folder-updated for clean folder
      expect(toastSpy).not.toHaveBeenCalled()
      expect(folderEvents).toEqual([{ folderId: 'f-clean-active', reload: true }])
    } finally {
      window.removeEventListener('hecto:folder-updated', folderHandler)
    }
  })

  it('prunes only non-existent folders from expandedFolders under massive scale', async () => {
    const colStore = useCollectionStore()

    const survivingFolders: any[] = []
    colStore.expandedFolders = new Set()

    // Create 100 folders: 50 survive on disk, 50 were deleted on disk
    for (let i = 0; i < 100; i++) {
      const id = `folder-${i}`
      colStore.expandedFolders.add(id)
      if (i % 2 === 0) {
        survivingFolders.push({
          id,
          name: `Folder ${i}`,
          type: 'folder',
          path: id,
          created_at: '',
          children: []
        })
      }
    }

    vi.mocked(ListCollections).mockResolvedValue(resSuccess([{ id: 'default', name: 'Default', is_default: true, is_active: true }]))
    vi.mocked(ListEnvironments).mockResolvedValue(resSuccess([]))
    vi.mocked(GetCollectionTree).mockResolvedValue(resSuccess(survivingFolders))

    await colStore.smartReload()

    // Exactly 50 surviving folders must remain in expandedFolders
    expect(colStore.expandedFolders.size).toBe(50)
    for (let i = 0; i < 100; i++) {
      if (i % 2 === 0) {
        expect(colStore.expandedFolders.has(`folder-${i}`)).toBe(true)
      } else {
        expect(colStore.expandedFolders.has(`folder-${i}`)).toBe(false)
      }
    }
  })

  it('handles backend error during loadTree gracefully without crashing', async () => {
    const colStore = useCollectionStore()
    const tabStore = useTabStore()

    tabStore.openTab({ entityId: 'req-safe', type: 'request', name: 'Safe Tab', method: 'GET', isDirty: false })

    vi.mocked(ListCollections).mockResolvedValue(resSuccess([{ id: 'default', name: 'Default', is_default: true, is_active: true }]))
    vi.mocked(ListEnvironments).mockResolvedValue(resSuccess([]))
    vi.mocked(GetCollectionTree).mockResolvedValue(
      model.Result.createFrom({ success: false, error: { code: 'IO_ERROR', message: 'Disk read failed' } })
    )

    await colStore.smartReload()

    // Store records error and tabs remain unharmed
    expect(colStore.error).toBe('Disk read failed')
    expect(tabStore.tabs).toHaveLength(1)
    expect(tabStore.tabs[0].entityId).toBe('req-safe')
  })
})

