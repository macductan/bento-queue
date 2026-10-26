import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCollectionStore } from '../collectionStore'
import { useRequestStore } from '../requestStore'
import { useResponseStore } from '../responseStore'
import { useEnvironmentStore } from '../environmentStore'
import { useUiStore } from '../uiStore'
import { createMockRequest } from './utils'
import { model } from '../../../wailsjs/go/models'

// Mock wails calls
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
  SelectPostmanFile: vi.fn(),
  ImportPostman: vi.fn(),
  ListCollections: vi.fn().mockResolvedValue({ success: true, data: [] }),
  SwitchCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  CreateCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  RenameCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  DeleteCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  DuplicateCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  UpdateCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  ReorderNodes: vi.fn().mockResolvedValue({ success: true, data: {} }),
  GetRequest: vi.fn(),
  SaveRequest: vi.fn().mockResolvedValue({ success: true, data: {} }),
  ListEnvironments: vi.fn().mockResolvedValue({ success: true, data: [] }),
  SaveEnvironment: vi.fn().mockResolvedValue({ success: true, data: {} }),
  DeleteEnvironment: vi.fn().mockResolvedValue({ success: true, data: {} }),
  SendRequest: vi.fn().mockResolvedValue({ success: true, data: {} }),
  AbortRequest: vi.fn().mockResolvedValue({})
}))

import {
  ListCollections,
  SwitchCollection,
  CreateCollection,
  RenameCollection,
  DeleteCollection,
  DuplicateCollection,
  UpdateCollection,
  ReorderNodes,
  GetCollectionTree,
  SaveRequest,
  ListEnvironments,
  GetRequest,
  CreateRequest,
  MoveFolder
} from '../../../wailsjs/go/main/App'

function resSuccess(data: any = {}): model.Result {
  return model.Result.createFrom({ success: true, data })
}

function resError(message: string, code = 'ERROR'): model.Result {
  return model.Result.createFrom({ success: false, error: { code, message } })
}

describe('collectionStore - Multi Collection & State Isolation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('Getters', () => {
    it('activeCollection returns matching collection or null', () => {
      const store = useCollectionStore()
      expect(store.activeCollection).toBeNull()

      store.collections = [
        { id: 'default', name: 'Default', is_default: true, is_active: false } as any,
        { id: 'project-a', name: 'Project A', is_default: false, is_active: true } as any
      ]
      store.activeCollectionId = 'project-a'

      expect(store.activeCollection).toEqual({
        id: 'project-a',
        name: 'Project A',
        is_default: false,
        is_active: true
      })

      store.activeCollectionId = 'non-existent'
      expect(store.activeCollection).toBeNull()
    })

    it('isDefaultActive returns true when id is default or empty, false otherwise', () => {
      const store = useCollectionStore()
      expect(store.isDefaultActive).toBe(true)

      store.activeCollectionId = 'default'
      expect(store.isDefaultActive).toBe(true)

      store.activeCollectionId = 'custom-id'
      expect(store.isDefaultActive).toBe(false)
    })
  })

  describe('loadCollections', () => {
    it('updates collections and activeCollectionId from item with is_active: true', async () => {
      const store = useCollectionStore()
      vi.mocked(ListCollections).mockResolvedValueOnce(resSuccess([
        { id: 'default', name: 'Default', is_default: true, is_active: false },
        { id: 'ecommerce-uuid', name: 'E-commerce', is_default: false, is_active: true }
      ]))

      await store.loadCollections()

      expect(store.collections).toHaveLength(2)
      expect(store.activeCollectionId).toBe('ecommerce-uuid')
      expect(store.collectionsLoading).toBe(false)
    })

    it('falls back to default if no item has is_active: true', async () => {
      const store = useCollectionStore()
      vi.mocked(ListCollections).mockResolvedValueOnce(resSuccess([
        { id: 'default', name: 'Default', is_default: true, is_active: false }
      ]))

      await store.loadCollections()

      expect(store.activeCollectionId).toBe('default')
    })

    it('handles backend error by clearing collections and showing toast', async () => {
      const store = useCollectionStore()
      const uiStore = useUiStore()
      const showToastSpy = vi.spyOn(uiStore, 'showToast')

      vi.mocked(ListCollections).mockResolvedValueOnce(resError('Failed to read root', 'IO_ERROR'))

      await store.loadCollections()

      expect(store.collections).toEqual([])
      expect(showToastSpy).toHaveBeenCalledWith('Failed to read root')
    })
  })

  describe('switchCollection', () => {
    it('returns true immediately when targetId equals activeCollectionId', async () => {
      const store = useCollectionStore()
      store.activeCollectionId = 'current-id'

      const result = await store.switchCollection('current-id')

      expect(result).toBe(true)
      expect(SwitchCollection).not.toHaveBeenCalled()
    })

    it('blocks concurrent switch calls when switching is in progress', async () => {
      const store = useCollectionStore()
      store.activeCollectionId = 'default'
      store.switching = true

      const result = await store.switchCollection('target-id')

      expect(result).toBe(false)
      expect(SwitchCollection).not.toHaveBeenCalled()
    })

    it('switches collection cleanly when isDirty is false and isolates state', async () => {
      const store = useCollectionStore()
      const reqStore = useRequestStore()
      const resStore = useResponseStore()
      const envStore = useEnvironmentStore()
      const uiStore = useUiStore()

      store.activeCollectionId = 'default'
      store.activeRequestId = 'req-1'
      store.activeFolderId = 'folder-1'
      store.expandedFolders.add('folder-1')
      uiStore.openContextMenu(100, 200, 'folder-1', 'folder')

      reqStore.original = createMockRequest({ id: 'req-1', name: 'Original' })
      reqStore.current = createMockRequest({ id: 'req-1', name: 'Original' })
      expect(reqStore.isDirty).toBe(false)

      resStore.response = { status_code: 200 } as any
      envStore.environments = [{ id: 'env-1', name: 'Dev', variables: [] }] as any
      envStore.setActive('env-1')

      vi.mocked(SwitchCollection).mockResolvedValueOnce(resSuccess({}))
      vi.mocked(ListCollections).mockResolvedValueOnce(resSuccess([
        { id: 'default', name: 'Default', is_default: true, is_active: false },
        { id: 'target-id', name: 'Target', is_default: false, is_active: true }
      ]))

      const result = await store.switchCollection('target-id')

      expect(result).toBe(true)
      expect(SwitchCollection).toHaveBeenCalledWith('target-id')
      expect(store.activeCollectionId).toBe('target-id')
      expect(store.switching).toBe(false)

      // Verifying state isolation
      expect(reqStore.current).toBeNull()
      expect(reqStore.original).toBeNull()
      expect(resStore.response).toBeNull()
      expect(store.activeRequestId).toBeNull()
      expect(store.activeFolderId).toBeNull()
      expect(store.expandedFolders.size).toBe(0)
      expect(envStore.activeEnvId).toBeNull()
      expect(uiStore.contextMenu).toBeNull()
      expect(GetCollectionTree).toHaveBeenCalled()
      expect(ListEnvironments).toHaveBeenCalled()
      expect(ListCollections).toHaveBeenCalled()
    })

    it('refreshes mock server status on collection switch', async () => {
      const store = useCollectionStore()
      const { useMockServerStore } = await import('../mockServerStore')
      const mockStore = useMockServerStore()
      const loadStatusSpy = vi.spyOn(mockStore, 'loadStatus').mockResolvedValue()

      store.activeCollectionId = 'default'
      vi.mocked(SwitchCollection).mockResolvedValueOnce(resSuccess({}))
      vi.mocked(ListCollections).mockResolvedValueOnce(resSuccess([
        { id: 'default', name: 'Default', is_default: true, is_active: false },
        { id: 'target-id', name: 'Target', is_default: false, is_active: true }
      ]))

      const result = await store.switchCollection('target-id')

      expect(result).toBe(true)
      expect(loadStatusSpy).toHaveBeenCalled()
    })

    it('shows toast and keeps collection when backend SwitchCollection fails', async () => {
      const store = useCollectionStore()
      const uiStore = useUiStore()
      const showToastSpy = vi.spyOn(uiStore, 'showToast')

      store.activeCollectionId = 'default'
      vi.mocked(SwitchCollection).mockResolvedValueOnce(resError('Collection không tồn tại', 'NOT_FOUND'))

      const result = await store.switchCollection('missing-id')

      expect(result).toBe(false)
      expect(store.activeCollectionId).toBe('default')
      expect(store.switching).toBe(false)
      expect(showToastSpy).toHaveBeenCalledWith('Collection không tồn tại')
    })

    it('prompts user when isDirty is true and aborts if user cancels', async () => {
      const store = useCollectionStore()
      const reqStore = useRequestStore()
      const uiStore = useUiStore()

      store.activeCollectionId = 'default'
      reqStore.original = createMockRequest({ id: 'req-1', name: 'Original' })
      reqStore.current = createMockRequest({ id: 'req-1', name: 'Modified' })
      expect(reqStore.isDirty).toBe(true)

      const promptSpy = vi.spyOn(uiStore, 'requestUnsavedPrompt').mockResolvedValueOnce('cancel')

      const result = await store.switchCollection('target-id')

      expect(result).toBe(false)
      expect(promptSpy).toHaveBeenCalledWith(
        'Request hiện tại có thay đổi chưa được lưu. Bạn có muốn lưu lại trước khi chuyển collection?'
      )
      expect(SwitchCollection).not.toHaveBeenCalled()
      expect(store.activeCollectionId).toBe('default')
      expect(store.switching).toBe(false)
      expect(reqStore.current?.name).toBe('Modified')
    })

    it('prompts user and saves before switching when user chooses save', async () => {
      const store = useCollectionStore()
      const reqStore = useRequestStore()
      const uiStore = useUiStore()

      store.activeCollectionId = 'default'
      reqStore.original = createMockRequest({ id: 'req-1', name: 'Original' })
      reqStore.current = createMockRequest({ id: 'req-1', name: 'Modified' })
      expect(reqStore.isDirty).toBe(true)

      vi.spyOn(uiStore, 'requestUnsavedPrompt').mockResolvedValueOnce('save')
      vi.mocked(SaveRequest).mockResolvedValueOnce(resSuccess({}))
      vi.mocked(SwitchCollection).mockResolvedValueOnce(resSuccess({}))

      const result = await store.switchCollection('target-id')

      expect(result).toBe(true)
      expect(SaveRequest).toHaveBeenCalled()
      expect(SwitchCollection).toHaveBeenCalledWith('target-id')
      expect(reqStore.current).toBeNull() // Cleared after switch
      expect(store.switching).toBe(false)
    })

    it('aborts switch when user chooses save but saving fails', async () => {
      const store = useCollectionStore()
      const reqStore = useRequestStore()
      const uiStore = useUiStore()

      store.activeCollectionId = 'default'
      reqStore.original = createMockRequest({ id: 'req-1', name: 'Original' })
      reqStore.current = createMockRequest({ id: 'req-1', name: 'Modified' })

      vi.spyOn(uiStore, 'requestUnsavedPrompt').mockResolvedValueOnce('save')
      vi.mocked(SaveRequest).mockResolvedValueOnce(resError('Disk write failed', 'IO_ERROR'))

      const result = await store.switchCollection('target-id')

      expect(result).toBe(false)
      expect(SwitchCollection).not.toHaveBeenCalled()
      expect(store.activeCollectionId).toBe('default')
      expect(store.switching).toBe(false)
    })

    it('aborts switch when save resolves but reqStore is still dirty', async () => {
      const store = useCollectionStore()
      const reqStore = useRequestStore()
      const uiStore = useUiStore()

      store.activeCollectionId = 'default'
      reqStore.original = createMockRequest({ id: 'req-1', name: 'Original' })
      reqStore.current = createMockRequest({ id: 'req-1', name: 'Modified' })

      vi.spyOn(uiStore, 'requestUnsavedPrompt').mockResolvedValueOnce('save')
      // Spy saveCurrent to simulate a save that does not clear dirty state
      vi.spyOn(reqStore, 'saveCurrent').mockImplementation(async () => {
        // Do nothing to original/current, leaving isDirty = true
        return true
      })

      const result = await store.switchCollection('target-id')

      expect(result).toBe(false)
      expect(SwitchCollection).not.toHaveBeenCalled()
      expect(store.switching).toBe(false)
    })

    it('discards unsaved changes and proceeds when user chooses discard', async () => {
      const store = useCollectionStore()
      const reqStore = useRequestStore()
      const uiStore = useUiStore()

      store.activeCollectionId = 'default'
      reqStore.original = createMockRequest({ id: 'req-1', name: 'Original' })
      reqStore.current = createMockRequest({ id: 'req-1', name: 'Modified' })

      vi.spyOn(uiStore, 'requestUnsavedPrompt').mockResolvedValueOnce('discard')
      vi.mocked(SwitchCollection).mockResolvedValueOnce(resSuccess({}))

      const result = await store.switchCollection('target-id')

      expect(result).toBe(true)
      expect(SaveRequest).not.toHaveBeenCalled()
      expect(SwitchCollection).toHaveBeenCalledWith('target-id')
      expect(reqStore.current).toBeNull()
      expect(store.switching).toBe(false)
    })

    it('skips dirty prompt when force option is true', async () => {
      const store = useCollectionStore()
      const reqStore = useRequestStore()
      const uiStore = useUiStore()

      store.activeCollectionId = 'default'
      reqStore.original = createMockRequest({ id: 'req-1', name: 'Original' })
      reqStore.current = createMockRequest({ id: 'req-1', name: 'Modified' })

      const promptSpy = vi.spyOn(uiStore, 'requestUnsavedPrompt')
      vi.mocked(SwitchCollection).mockResolvedValueOnce(resSuccess({}))

      const result = await store.switchCollection('target-id', { force: true })

      expect(result).toBe(true)
      expect(promptSpy).not.toHaveBeenCalled()
      expect(SwitchCollection).toHaveBeenCalledWith('target-id')
      expect(store.switching).toBe(false)
    })
  })

  describe('deleteCollection', () => {
    it('refuses to delete default collection', async () => {
      const store = useCollectionStore()
      const uiStore = useUiStore()
      const showToastSpy = vi.spyOn(uiStore, 'showToast')

      const result = await store.deleteCollection('default')

      expect(result).toBe(false)
      expect(DeleteCollection).not.toHaveBeenCalled()
      expect(showToastSpy).toHaveBeenCalledWith('Không thể xóa collection mặc định')
    })

    it('deletes active collection, falls back to default and isolates state', async () => {
      const store = useCollectionStore()
      const reqStore = useRequestStore()
      const resStore = useResponseStore()
      const envStore = useEnvironmentStore()

      store.activeCollectionId = 'active-to-delete'
      store.activeRequestId = 'req-9'
      store.activeFolderId = 'folder-9'
      store.expandedFolders.add('folder-9')

      reqStore.current = createMockRequest({ id: 'req-9' })
      resStore.response = { status_code: 200 } as any
      resStore.loading = true
      envStore.setActive('env-1')

      vi.mocked(DeleteCollection).mockResolvedValueOnce(resSuccess({ active_collection: 'default' }))

      const result = await store.deleteCollection('active-to-delete')

      expect(result).toBe(true)
      expect(DeleteCollection).toHaveBeenCalledWith('active-to-delete')
      expect(store.activeCollectionId).toBe('default')
      expect(reqStore.current).toBeNull()
      expect(resStore.response).toBeNull()
      expect(resStore.loading).toBe(false)
      expect(store.activeRequestId).toBeNull()
      expect(store.activeFolderId).toBeNull()
      expect(store.expandedFolders.size).toBe(0)
      expect(envStore.activeEnvId).toBeNull()
      expect(GetCollectionTree).toHaveBeenCalled()
      expect(ListEnvironments).toHaveBeenCalled()
      expect(ListCollections).toHaveBeenCalled()
    })

    it('deletes inactive collection without resetting editor or switching active', async () => {
      const store = useCollectionStore()
      const reqStore = useRequestStore()

      store.activeCollectionId = 'active-proj'
      store.activeRequestId = 'req-stay'
      reqStore.current = createMockRequest({ id: 'req-stay' })

      vi.mocked(DeleteCollection).mockResolvedValueOnce(resSuccess(null))
      vi.mocked(ListCollections).mockResolvedValueOnce(resSuccess([
        { id: 'active-proj', name: 'Active Project', is_default: false, is_active: true }
      ]))

      const result = await store.deleteCollection('other-id')

      expect(result).toBe(true)
      expect(DeleteCollection).toHaveBeenCalledWith('other-id')
      expect(store.activeCollectionId).toBe('active-proj')
      expect(reqStore.current).not.toBeNull()
      expect(store.activeRequestId).toBe('req-stay')
      expect(ListCollections).toHaveBeenCalled()
    })

    it('shows toast when DeleteCollection fails', async () => {
      const store = useCollectionStore()
      const uiStore = useUiStore()
      const showToastSpy = vi.spyOn(uiStore, 'showToast')

      vi.mocked(DeleteCollection).mockResolvedValueOnce(resError('Xóa thất bại', 'IO_ERROR'))

      const result = await store.deleteCollection('some-id')

      expect(result).toBe(false)
      expect(showToastSpy).toHaveBeenCalledWith('Xóa thất bại')
    })
  })

  describe('CRUD helpers', () => {
    it('createCollection rejects empty or whitespace name', async () => {
      const store = useCollectionStore()
      const uiStore = useUiStore()
      const showToastSpy = vi.spyOn(uiStore, 'showToast')

      const result = await store.createCollection('   ')

      expect(result).toBe(false)
      expect(CreateCollection).not.toHaveBeenCalled()
      expect(showToastSpy).toHaveBeenCalledWith('Tên không được để trống')
    })

    it('createCollection calls CreateCollection and reloads list', async () => {
      const store = useCollectionStore()
      vi.mocked(CreateCollection).mockResolvedValueOnce(resSuccess({}))

      const result = await store.createCollection('New Project')

      expect(result).toBe(true)
      expect(CreateCollection).toHaveBeenCalledWith('New Project')
      expect(ListCollections).toHaveBeenCalled()
    })

    it('createCollection shows toast and returns false when CreateCollection fails', async () => {
      const store = useCollectionStore()
      const uiStore = useUiStore()
      const showToastSpy = vi.spyOn(uiStore, 'showToast')

      vi.mocked(CreateCollection).mockResolvedValueOnce(resError('Tạo thất bại', 'IO_ERROR'))

      const result = await store.createCollection('Fail Project')

      expect(result).toBe(false)
      expect(showToastSpy).toHaveBeenCalledWith('Tạo thất bại')
    })

    it('renameCollection rejects empty or whitespace name', async () => {
      const store = useCollectionStore()
      const uiStore = useUiStore()
      const showToastSpy = vi.spyOn(uiStore, 'showToast')

      const result = await store.renameCollection('id-1', '  ')

      expect(result).toBe(false)
      expect(RenameCollection).not.toHaveBeenCalled()
      expect(showToastSpy).toHaveBeenCalledWith('Tên không được để trống')
    })

    it('renameCollection calls RenameCollection and reloads list', async () => {
      const store = useCollectionStore()
      vi.mocked(RenameCollection).mockResolvedValueOnce(resSuccess({}))

      const result = await store.renameCollection('id-1', 'Renamed Name')

      expect(result).toBe(true)
      expect(RenameCollection).toHaveBeenCalledWith('id-1', 'Renamed Name')
      expect(ListCollections).toHaveBeenCalled()
    })

    it('renameCollection shows toast and returns false when RenameCollection fails', async () => {
      const store = useCollectionStore()
      const uiStore = useUiStore()
      const showToastSpy = vi.spyOn(uiStore, 'showToast')

      vi.mocked(RenameCollection).mockResolvedValueOnce(resError('Đổi tên thất bại', 'IO_ERROR'))

      const result = await store.renameCollection('id-1', 'New Name')

      expect(result).toBe(false)
      expect(showToastSpy).toHaveBeenCalledWith('Đổi tên thất bại')
    })

    it('duplicateCollection calls DuplicateCollection and reloads list', async () => {
      const store = useCollectionStore()
      vi.mocked(DuplicateCollection).mockResolvedValueOnce(resSuccess({}))

      const result = await store.duplicateCollection('id-1')

      expect(result).toBe(true)
      expect(DuplicateCollection).toHaveBeenCalledWith('id-1')
      expect(ListCollections).toHaveBeenCalled()
    })

    it('duplicateCollection shows toast and returns false when DuplicateCollection fails', async () => {
      const store = useCollectionStore()
      const uiStore = useUiStore()
      const showToastSpy = vi.spyOn(uiStore, 'showToast')

      vi.mocked(DuplicateCollection).mockResolvedValueOnce(resError('Nhân bản thất bại', 'IO_ERROR'))

      const result = await store.duplicateCollection('id-1')

      expect(result).toBe(false)
      expect(showToastSpy).toHaveBeenCalledWith('Nhân bản thất bại')
    })
  })

  describe('Auto-save immediate flush on navigation', () => {
    it('selectRequest flushes dirty request automatically without showing prompt dialog', async () => {
      const store = useCollectionStore()
      const reqStore = useRequestStore()
      const uiStore = useUiStore()

      reqStore.original = createMockRequest({ id: 'req-1', name: 'Req 1', url: 'https://api.com/1' })
      reqStore.current = createMockRequest({ id: 'req-1', name: 'Req 1', url: 'https://api.com/modified' })
      expect(reqStore.isDirty).toBe(true)

      const promptSpy = vi.spyOn(uiStore, 'requestUnsavedPrompt')
      const flushSpy = vi.spyOn(reqStore, 'flush').mockResolvedValue(true)
      vi.mocked(GetRequest).mockResolvedValueOnce(resSuccess(createMockRequest({ id: 'req-2', name: 'Req 2' })))

      await store.selectRequest('req-2')

      expect(promptSpy).not.toHaveBeenCalled()
      expect(flushSpy).toHaveBeenCalledTimes(1)
      expect(store.activeRequestId).toBe('req-2')
    })

    it('selectRequest aborts switch if flush fails', async () => {
      const store = useCollectionStore()
      const reqStore = useRequestStore()

      store.activeRequestId = 'req-1'
      reqStore.original = createMockRequest({ id: 'req-1', url: 'https://api.com/1' })
      reqStore.current = createMockRequest({ id: 'req-1', url: 'https://api.com/modified' })
      expect(reqStore.isDirty).toBe(true)

      vi.spyOn(reqStore, 'flush').mockResolvedValue(false)

      await store.selectRequest('req-2')

      expect(store.activeRequestId).toBe('req-1')
      expect(GetRequest).not.toHaveBeenCalled()
    })

    it('setActiveFolderId flushes dirty request before selecting folder and aborts if flush fails', async () => {
      const store = useCollectionStore()
      const reqStore = useRequestStore()

      store.activeRequestId = 'req-1'
      reqStore.original = createMockRequest({ id: 'req-1', url: 'https://api.com/1' })
      reqStore.current = createMockRequest({ id: 'req-1', url: 'https://api.com/modified' })

      const flushSpy = vi.spyOn(reqStore, 'flush').mockResolvedValue(true)

      await store.setActiveFolderId('folder-1')

      expect(flushSpy).toHaveBeenCalledTimes(1)
      expect(store.activeFolderId).toBe('folder-1')
      expect(store.activeRequestId).toBeNull()
      expect(reqStore.current).toBeNull()

      // When flush fails:
      store.activeRequestId = 'req-1'
      reqStore.original = createMockRequest({ id: 'req-1', url: 'https://api.com/1' })
      reqStore.current = createMockRequest({ id: 'req-1', url: 'https://api.com/modified' })
      vi.spyOn(reqStore, 'flush').mockResolvedValueOnce(false)

      await store.setActiveFolderId('folder-2')
      expect(store.activeFolderId).toBe('folder-1')
      expect(store.activeRequestId).toBe('req-1')
    })

    it('createRequest flushes dirty request before creating new request and aborts if flush fails', async () => {
      const store = useCollectionStore()
      const reqStore = useRequestStore()

      store.activeRequestId = 'req-1'
      reqStore.original = createMockRequest({ id: 'req-1', url: 'https://api.com/1' })
      reqStore.current = createMockRequest({ id: 'req-1', url: 'https://api.com/modified' })

      vi.spyOn(reqStore, 'flush').mockResolvedValueOnce(false)

      await store.createRequest()

      expect(CreateRequest).not.toHaveBeenCalled()
      expect(store.activeRequestId).toBe('req-1')
    })
  })

  describe('updateCollectionVariables', () => {
    it('filters empty keys and updates collection variables on success', async () => {
      const store = useCollectionStore()
      store.collections = [{ id: 'col-1', name: 'Col 1', variables: [] } as any]
      vi.mocked(UpdateCollection).mockResolvedValueOnce(resSuccess({ id: 'col-1', name: 'Col 1', variables: [{ key: 'apiUrl', value: 'https://api.test', enabled: true }] }))

      const ok = await store.updateCollectionVariables('col-1', [
        { key: 'apiUrl', value: 'https://api.test', enabled: true },
        { key: '   ', value: 'empty', enabled: true }
      ])

      expect(ok).toBe(true)
      expect(UpdateCollection).toHaveBeenCalledWith(expect.objectContaining({
        id: 'col-1',
        variables: [{ key: 'apiUrl', value: 'https://api.test', enabled: true }]
      }))
      expect(store.collections[0].variables).toEqual([
        { key: 'apiUrl', value: 'https://api.test', enabled: true }
      ])
    })

    it('returns false when collection id not found', async () => {
      const store = useCollectionStore()
      store.collections = [{ id: 'col-1', name: 'Col 1', variables: [] } as any]
      const ok = await store.updateCollectionVariables('col-unknown', [])
      expect(ok).toBe(false)
      expect(UpdateCollection).not.toHaveBeenCalled()
    })

    it('returns false and displays toast when backend fails', async () => {
      const store = useCollectionStore()
      const uiStore = useUiStore()
      const toastSpy = vi.spyOn(uiStore, 'showToast')
      store.collections = [{ id: 'col-1', name: 'Col 1', variables: [] } as any]
      vi.mocked(UpdateCollection).mockResolvedValueOnce(resError('Failed to write collection'))

      const ok = await store.updateCollectionVariables('col-1', [{ key: 'k', value: 'v', enabled: true }])
      expect(ok).toBe(false)
      expect(toastSpy).toHaveBeenCalledWith('Failed to write collection')
    })

    it('preserves active_env_id and is_active in UpdateCollection payload and store state when updating variables', async () => {
      const store = useCollectionStore()
      store.collections = [
        {
          id: 'col-1',
          name: 'Col 1',
          is_active: true,
          active_env_id: 'env-local',
          variables: [{ key: 'old', value: '1', enabled: true }]
        } as any
      ]
      // Backend returns collection with omitted variables (empty) and is_active: false
      vi.mocked(UpdateCollection).mockResolvedValueOnce(
        resSuccess({ id: 'col-1', name: 'Col 1', is_active: false, active_env_id: 'env-local' })
      )

      const ok = await store.updateCollectionVariables('col-1', [])
      expect(ok).toBe(true)
      expect(UpdateCollection).toHaveBeenCalledWith(expect.objectContaining({
        id: 'col-1',
        active_env_id: 'env-local',
        variables: []
      }))
      expect(store.collections[0].active_env_id).toBe('env-local')
      expect(store.collections[0].is_active).toBe(true)
      expect(store.collections[0].variables).toEqual([])
    })
  })

  describe('Active Environment Persistence (CAP-2)', () => {
    it('persists active_env_id via UpdateCollection when envStore.setActive is called with an environment ID or null', async () => {
      const store = useCollectionStore()
      const envStore = useEnvironmentStore()
      store.collections = [
        { id: 'col-1', name: 'Col 1', is_default: false, is_active: true } as any
      ]
      store.activeCollectionId = 'col-1'
      envStore.environments = [
        { id: 'env-local', name: 'Local', variables: [] } as any
      ]

      vi.mocked(UpdateCollection).mockResolvedValueOnce(
        resSuccess({ id: 'col-1', name: 'Col 1', active_env_id: 'env-local' })
      )

      const ok1 = await envStore.setActive('env-local')
      expect(ok1).toBe(true)
      expect(envStore.activeEnvId).toBe('env-local')
      expect(UpdateCollection).toHaveBeenCalledWith(expect.objectContaining({
        id: 'col-1',
        active_env_id: 'env-local'
      }))
      expect(store.activeCollection?.active_env_id).toBe('env-local')

      // Selecting "Không dùng env" (null) persists empty string ""
      vi.mocked(UpdateCollection).mockResolvedValueOnce(
        resSuccess({ id: 'col-1', name: 'Col 1', active_env_id: '' })
      )
      const ok2 = await envStore.setActive(null)
      expect(ok2).toBe(true)
      expect(envStore.activeEnvId).toBeNull()
      expect(UpdateCollection).toHaveBeenLastCalledWith(expect.objectContaining({
        id: 'col-1',
        active_env_id: ''
      }))
      expect(store.activeCollection?.active_env_id).toBe('')
    })

    it('shows toast and restores previous coll.active_env_id when UpdateCollection fails during updateActiveCollectionEnv', async () => {
      const store = useCollectionStore()
      const envStore = useEnvironmentStore()
      const uiStore = useUiStore()
      const toastSpy = vi.spyOn(uiStore, 'showToast')

      store.collections = [
        { id: 'col-1', name: 'Col 1', is_default: false, is_active: true, active_env_id: 'env-prev' } as any
      ]
      store.activeCollectionId = 'col-1'
      vi.mocked(UpdateCollection).mockResolvedValueOnce(resError('Lỗi ghi đĩa', 'IO_ERROR'))

      const ok = await envStore.setActive('env-local')
      expect(ok).toBe(false)
      expect(envStore.activeEnvId).toBe('env-local')
      expect(store.activeCollection?.active_env_id).toBe('env-prev')
      expect(toastSpy).toHaveBeenCalledWith('Lỗi ghi đĩa')
    })

    it('restores activeEnvId on startup and when switching between collections', async () => {
      const store = useCollectionStore()
      const envStore = useEnvironmentStore()

      // Startup with Collection A having active_env_id: "env-local"
      vi.mocked(ListCollections).mockResolvedValueOnce(resSuccess([
        { id: 'col-a', name: 'Collection A', is_active: true, active_env_id: 'env-local' },
        { id: 'col-b', name: 'Collection B', is_active: false, active_env_id: 'env-staging' }
      ]))
      vi.mocked(ListEnvironments).mockResolvedValueOnce(resSuccess([
        { id: 'env-local', name: 'Local', variables: [] }
      ]))

      await Promise.all([store.loadCollections(), envStore.loadAll()])
      envStore.syncActiveEnvFromCollection()

      expect(store.activeCollectionId).toBe('col-a')
      expect(envStore.activeEnvId).toBe('env-local')

      // Switch to Collection B -> restores "env-staging"
      vi.mocked(SwitchCollection).mockResolvedValueOnce(resSuccess({}))
      vi.mocked(ListCollections).mockResolvedValueOnce(resSuccess([
        { id: 'col-a', name: 'Collection A', is_active: false, active_env_id: 'env-local' },
        { id: 'col-b', name: 'Collection B', is_active: true, active_env_id: 'env-staging' }
      ]))
      vi.mocked(ListEnvironments).mockResolvedValueOnce(resSuccess([
        { id: 'env-staging', name: 'Staging', variables: [] }
      ]))

      await store.switchCollection('col-b')
      expect(store.activeCollectionId).toBe('col-b')
      expect(envStore.activeEnvId).toBe('env-staging')
    })

    it('falls back safely to null and clears stale active_env_id when saved active_env_id does not exist in environments', async () => {
      const store = useCollectionStore()
      const envStore = useEnvironmentStore()

      vi.mocked(ListCollections).mockResolvedValueOnce(resSuccess([
        { id: 'col-a', name: 'Collection A', is_active: true, active_env_id: 'env-deleted' }
      ]))
      vi.mocked(ListEnvironments).mockResolvedValueOnce(resSuccess([
        { id: 'env-other', name: 'Other', variables: [] }
      ]))

      await store.loadCollections()
      await envStore.loadAll()

      expect(envStore.activeEnvId).toBeNull()
      expect(store.activeCollection?.active_env_id).toBe('')
    })

    it('resets activeEnvId to null and persists empty active_env_id when active environment is removed', async () => {
      const { DeleteEnvironment } = await import('../../../wailsjs/go/main/App')
      const store = useCollectionStore()
      const envStore = useEnvironmentStore()

      store.collections = [
        { id: 'col-a', name: 'Collection A', is_active: true, active_env_id: 'env-local' } as any
      ]
      store.activeCollectionId = 'col-a'
      envStore.environments = [
        { id: 'env-local', name: 'Local', variables: [] } as any
      ]
      envStore.activeEnvId = 'env-local'

      vi.mocked(DeleteEnvironment).mockResolvedValueOnce(resSuccess({}))
      vi.mocked(UpdateCollection).mockResolvedValueOnce(resSuccess({
        id: 'col-a',
        name: 'Collection A',
        active_env_id: ''
      }))
      vi.mocked(ListEnvironments).mockResolvedValueOnce(resSuccess([]))

      const removed = await envStore.remove('env-local')
      expect(removed).toBe(true)
      expect(envStore.activeEnvId).toBeNull()
      expect(UpdateCollection).toHaveBeenCalledWith(expect.objectContaining({
        id: 'col-a',
        active_env_id: ''
      }))
      expect(store.activeCollection?.active_env_id).toBe('')
    })
  })

  describe('deleteFolder with active request inside', () => {
    it('cancels auto-save and clears requestStore when deleting folder containing active request', async () => {
      const { DeleteFolder } = await import('../../../wailsjs/go/main/App')
      const store = useCollectionStore()
      const reqStore = useRequestStore()

      store.tree = [
        {
          id: 'folder-parent',
          name: 'Parent',
          type: 'folder',
          path: '/folder-parent',
          created_at: '',
          children: [
            {
              id: 'req-child',
              name: 'Child Req',
              type: 'request',
              method: 'GET',
              path: '/folder-parent/req-child',
              created_at: ''
            }
          ]
        }
      ]
      store.activeRequestId = 'req-child'
      store.expandedFolders.add('folder-parent')
      reqStore.original = createMockRequest({ id: 'req-child', url: 'https://api.example.com/1' })
      reqStore.current = createMockRequest({ id: 'req-child', url: 'https://api.example.com/2' })

      const cancelSpy = vi.spyOn(reqStore, 'cancelAutoSave')
      const clearSpy = vi.spyOn(reqStore, 'clearRequest')
      vi.mocked(DeleteFolder).mockResolvedValueOnce(resSuccess(null))
      vi.mocked(GetCollectionTree).mockResolvedValueOnce(resSuccess([]))

      await store.deleteFolder('folder-parent')

      expect(cancelSpy).toHaveBeenCalled()
      expect(clearSpy).toHaveBeenCalled()
      expect(store.activeRequestId).toBeNull()
      expect(reqStore.current).toBeNull()
    })

    it('cancels auto-save even when DeleteFolder returns an error and preserves activeRequestId', async () => {
      const { DeleteFolder } = await import('../../../wailsjs/go/main/App')
      const store = useCollectionStore()
      const reqStore = useRequestStore()

      store.tree = [
        {
          id: 'folder-parent',
          name: 'Parent',
          type: 'folder',
          path: '/folder-parent',
          created_at: '',
          children: [
            {
              id: 'req-child',
              name: 'Child Req',
              type: 'request',
              method: 'GET',
              path: '/folder-parent/req-child',
              created_at: ''
            }
          ]
        }
      ]
      store.activeRequestId = 'req-child'
      reqStore.original = createMockRequest({ id: 'req-child', url: 'https://api.example.com/1' })
      reqStore.current = createMockRequest({ id: 'req-child', url: 'https://api.example.com/2' })

      const cancelSpy = vi.spyOn(reqStore, 'cancelAutoSave')
      const clearSpy = vi.spyOn(reqStore, 'clearRequest')
      vi.mocked(DeleteFolder).mockResolvedValueOnce(resError('Delete failed', 'IO_ERROR'))

      await store.deleteFolder('folder-parent')

      expect(cancelSpy).toHaveBeenCalledTimes(1)
      expect(clearSpy).not.toHaveBeenCalled()
      expect(store.activeRequestId).toBe('req-child')
    })

    it('clears requestStore before selecting sibling request in deleteFolder and deleteRequest', async () => {
      const { DeleteFolder, DeleteRequest } = await import('../../../wailsjs/go/main/App')
      const store = useCollectionStore()
      const reqStore = useRequestStore()

      store.tree = [
        {
          id: 'folder-parent',
          name: 'Parent',
          type: 'folder',
          path: '/folder-parent',
          created_at: '',
          children: [
            {
              id: 'req-child',
              name: 'Child Req',
              type: 'request',
              method: 'GET',
              path: '/folder-parent/req-child',
              created_at: ''
            }
          ]
        },
        {
          id: 'req-sibling',
          name: 'Sibling Req',
          type: 'request',
          method: 'GET',
          path: '/req-sibling',
          created_at: ''
        },
        {
          id: 'req-sibling-2',
          name: 'Sibling Req 2',
          type: 'request',
          method: 'GET',
          path: '/req-sibling-2',
          created_at: ''
        }
      ]
      store.activeRequestId = 'req-child'
      reqStore.original = createMockRequest({ id: 'req-child', url: 'https://api.example.com/1' })
      reqStore.current = createMockRequest({ id: 'req-child', url: 'https://api.example.com/2' })

      const clearSpy = vi.spyOn(reqStore, 'clearRequest')
      const selectSpy = vi.spyOn(store, 'selectRequest').mockResolvedValue()
      vi.mocked(DeleteFolder).mockResolvedValueOnce(resSuccess(null))
      vi.mocked(GetCollectionTree).mockResolvedValueOnce(resSuccess(store.tree.slice(1)))

      await store.deleteFolder('folder-parent')

      expect(clearSpy).toHaveBeenCalledTimes(1)
      expect(selectSpy).toHaveBeenCalledWith('req-sibling', { force: true })

      // Also verify deleteRequest when a sibling request exists
      clearSpy.mockClear()
      selectSpy.mockClear()
      store.activeRequestId = 'req-sibling'
      reqStore.original = createMockRequest({ id: 'req-sibling', url: 'https://api.example.com/1' })
      reqStore.current = createMockRequest({ id: 'req-sibling', url: 'https://api.example.com/2' })
      vi.mocked(DeleteRequest).mockResolvedValueOnce(resSuccess(null))
      vi.mocked(GetCollectionTree).mockResolvedValueOnce(resSuccess(store.tree.slice(1)))

      await store.deleteRequest('req-sibling')

      expect(clearSpy).toHaveBeenCalledTimes(1)
      expect(selectSpy).toHaveBeenCalledWith('req-sibling-2', { force: true })
    })

    it('renameRequest syncs reqStore.current.name and reqStore.original.name from reloaded tree node', async () => {
      const { RenameRequest } = await import('../../../wailsjs/go/main/App')
      const store = useCollectionStore()
      const reqStore = useRequestStore()

      const truncatedName = 'N'.repeat(255)
      const rawName = 'N'.repeat(300)

      store.activeRequestId = 'req-1'
      reqStore.original = createMockRequest({ id: 'req-1', name: 'Old Name' })
      reqStore.current = createMockRequest({ id: 'req-1', name: 'Old Name' })

      vi.mocked(RenameRequest).mockResolvedValueOnce(resSuccess({ id: 'req-1', name: truncatedName }))
      vi.mocked(GetCollectionTree).mockResolvedValueOnce(resSuccess([
        {
          id: 'req-1',
          name: truncatedName,
          type: 'request',
          method: 'GET',
          path: '/req-1',
          created_at: ''
        }
      ]))

      await store.renameRequest('req-1', rawName)

      expect(reqStore.current.name).toBe(truncatedName)
      expect(reqStore.original.name).toBe(truncatedName)
    })

    it('isDescendantFolder, findParentFolderId and canMoveNodeTo validate hierarchy properly', () => {
      const store = useCollectionStore()
      store.tree = [
        {
          id: 'f1',
          name: 'Folder 1',
          type: 'folder',
          path: '/f1',
          created_at: '',
          children: [
            {
              id: 'f1_sub',
              name: 'Sub 1',
              type: 'folder',
              path: '/f1/sub',
              created_at: '',
              children: [
                {
                  id: 'req_nested',
                  name: 'Nested Req',
                  type: 'request',
                  method: 'GET',
                  path: '/f1/sub/req',
                  created_at: ''
                }
              ]
            }
          ]
        },
        {
          id: 'f2',
          name: 'Folder 2',
          type: 'folder',
          path: '/f2',
          created_at: '',
          children: []
        },
        {
          id: 'req_root',
          name: 'Root Req',
          type: 'request',
          method: 'GET',
          path: '/req_root',
          created_at: ''
        }
      ]

      // isDescendantFolder
      expect(store.isDescendantFolder('f1', 'f1')).toBe(true)
      expect(store.isDescendantFolder('f1', 'f1_sub')).toBe(true)
      expect(store.isDescendantFolder('f1', 'f2')).toBe(false)
      expect(store.isDescendantFolder('f2', 'f1')).toBe(false)

      // findParentFolderId
      expect(store.findParentFolderId(store.tree, 'f1')).toBe('')
      expect(store.findParentFolderId(store.tree, 'req_root')).toBe('')
      expect(store.findParentFolderId(store.tree, 'f1_sub')).toBe('f1')
      expect(store.findParentFolderId(store.tree, 'req_nested')).toBe('f1_sub')
      expect(store.findParentFolderId(store.tree, 'nonexistent')).toBeNull()

      // canMoveNodeTo
      expect(store.canMoveNodeTo('', 'folder', 'f2')).toBe(false)
      expect(store.canMoveNodeTo('nonexistent', 'folder', 'f2')).toBe(false)
      // Cannot move to current parent
      expect(store.canMoveNodeTo('f1', 'folder', '')).toBe(false) // already at root
      expect(store.canMoveNodeTo('f1_sub', 'folder', 'f1')).toBe(false) // already in f1
      // Folder cannot move to self or descendant
      expect(store.canMoveNodeTo('f1', 'folder', 'f1')).toBe(false)
      expect(store.canMoveNodeTo('f1', 'folder', 'f1_sub')).toBe(false)
      // Valid moves
      expect(store.canMoveNodeTo('f1', 'folder', 'f2')).toBe(true)
      expect(store.canMoveNodeTo('f1_sub', 'folder', '')).toBe(true)
      expect(store.canMoveNodeTo('f1_sub', 'folder', 'f2')).toBe(true)
      expect(store.canMoveNodeTo('req_nested', 'request', '')).toBe(true)
      expect(store.canMoveNodeTo('req_nested', 'request', 'f2')).toBe(true)
    })

    it('moveFolder calls MoveFolder, reloads tree, auto-expands target path and shows toast', async () => {
      const store = useCollectionStore()
      const uiStore = useUiStore()
      const toastSpy = vi.spyOn(uiStore, 'showToast')

      const updatedTree = [
        {
          id: 'f-target',
          name: 'Target Folder',
          type: 'folder' as const,
          path: '/target',
          created_at: '',
          children: [
            {
              id: 'f-moved',
              name: 'Moved Folder',
              type: 'folder' as const,
              path: '/target/moved',
              created_at: '',
              children: []
            }
          ]
        }
      ]

      vi.mocked(MoveFolder).mockResolvedValueOnce(resSuccess(null))
      vi.mocked(GetCollectionTree).mockResolvedValueOnce(resSuccess(updatedTree))

      await store.moveFolder('f-moved', 'f-target')

      expect(MoveFolder).toHaveBeenCalledWith('f-moved', 'f-target')
      expect(toastSpy).toHaveBeenCalledWith('Đã di chuyển')
      expect(store.expandedFolders.has('f-target')).toBe(true)
    })
  })

  describe('Reorder & Sort nodes', () => {
    it('reorderNodes calls backend and updates local tree order', async () => {
      const store = useCollectionStore()
      store.tree = [
        { id: '1', name: 'Req 1', type: 'request', path: '', created_at: '' },
        { id: '2', name: 'Req 2', type: 'request', path: '', created_at: '' },
        { id: '3', name: 'Req 3', type: 'request', path: '', created_at: '' }
      ]

      vi.mocked(ReorderNodes).mockResolvedValueOnce(resSuccess(null))

      const success = await store.reorderNodes('', ['3', '1', '2'])
      expect(success).toBe(true)
      expect(ReorderNodes).toHaveBeenCalledWith('', ['3', '1', '2'])
      expect(store.tree.map(n => n.id)).toEqual(['3', '1', '2'])
    })

    it('sortNodes sorts folders first then requests, toggling asc and desc', async () => {
      const store = useCollectionStore()
      const uiStore = useUiStore()
      const toastSpy = vi.spyOn(uiStore, 'showToast')

      store.tree = [
        { id: 'req-z', name: 'Zebra', type: 'request', path: '', created_at: '' },
        { id: 'f-b', name: 'Beta Folder', type: 'folder', path: '', created_at: '', children: [] },
        { id: 'req-a', name: 'Apple', type: 'request', path: '', created_at: '' },
        { id: 'f-a', name: 'Alpha Folder', type: 'folder', path: '', created_at: '', children: [] }
      ]

      vi.mocked(ReorderNodes).mockResolvedValue(resSuccess(null))

      // First sort -> A-Z
      const res1 = await store.sortNodes('', 'asc')
      expect(res1).toBe(true)
      expect(store.tree.map(n => n.id)).toEqual(['f-a', 'f-b', 'req-a', 'req-z'])
      expect(toastSpy).toHaveBeenCalledWith('Đã sắp xếp A-Z')

      // Second sort -> toggle to Z-A
      const res2 = await store.sortNodes('')
      expect(res2).toBe(true)
      expect(store.tree.map(n => n.id)).toEqual(['f-b', 'f-a', 'req-z', 'req-a'])
      expect(toastSpy).toHaveBeenCalledWith('Đã sắp xếp Z-A')
    })

    it('canReorderNode validates cyclical drops and self drops', () => {
      const store = useCollectionStore()
      store.tree = [
        {
          id: 'f-parent',
          name: 'Parent',
          type: 'folder',
          path: '',
          created_at: '',
          children: [
            { id: 'f-child', name: 'Child', type: 'folder', path: '', created_at: '', children: [] }
          ]
        },
        { id: 'req-1', name: 'Req 1', type: 'request', path: '', created_at: '' }
      ]

      // Self
      expect(store.canReorderNode('req-1', 'request', 'req-1', 'before')).toBe(false)
      expect(store.canReorderNode('f-parent', 'folder', 'f-parent', 'inside')).toBe(false)

      // Folder into descendant
      expect(store.canReorderNode('f-parent', 'folder', 'f-child', 'inside')).toBe(false)
      expect(store.canReorderNode('f-parent', 'folder', 'f-child', 'before')).toBe(false)

      // Valid reorders
      expect(store.canReorderNode('req-1', 'request', 'f-parent', 'before')).toBe(true)
      expect(store.canReorderNode('f-child', 'folder', 'req-1', 'after')).toBe(true)
    })

    it('expandPathToNode expands all ancestor folders of the target node', () => {
      const store = useCollectionStore()
      store.tree = [
        {
          id: 'f-level1',
          name: 'Level 1',
          type: 'folder',
          path: '',
          created_at: '',
          children: [
            {
              id: 'f-level2',
              name: 'Level 2',
              type: 'folder',
              path: '',
              created_at: '',
              children: [
                { id: 'req-nested', name: 'Nested Req', type: 'request', path: '', created_at: '' }
              ]
            }
          ]
        }
      ]

      store.expandPathToNode('req-nested')
      expect(store.expandedFolders.has('f-level1')).toBe(true)
      expect(store.expandedFolders.has('f-level2')).toBe(true)
    })

    it('revealNodeInTree collapses unrelated folders, expands target path, clears filter and triggers highlight', async () => {
      const store = useCollectionStore()
      store.tree = [
        {
          id: 'f-unrelated',
          name: 'Unrelated Folder',
          type: 'folder',
          path: '',
          created_at: '',
          children: []
        },
        {
          id: 'f-1',
          name: 'Folder 1',
          type: 'folder',
          path: '',
          created_at: '',
          children: [
            { id: 'req-target', name: 'Target Req', type: 'request', path: '', created_at: '' }
          ]
        }
      ]

      store.expandedFolders.add('f-unrelated')
      expect(store.expandedFolders.has('f-unrelated')).toBe(true)

      const { useUiStore } = await import('../uiStore')
      const uiStore = useUiStore()
      const clearFilterSpy = vi.spyOn(uiStore, 'clearTreeFilter')
      const highlightSpy = vi.spyOn(uiStore, 'highlightTreeNode')

      await store.revealNodeInTree('req-target')
      // f-unrelated should be collapsed
      expect(store.expandedFolders.has('f-unrelated')).toBe(false)
      // target ancestor f-1 should be expanded
      expect(store.expandedFolders.has('f-1')).toBe(true)
      expect(clearFilterSpy).toHaveBeenCalled()
      expect(highlightSpy).toHaveBeenCalledWith('req-target', 2500)
    })
  })

  describe('smartReload & External Change Sync (Story 4)', () => {
    it('sets hasExternalChanges when Wails runtime emits collection:external-change', () => {
      let registeredCallback: (() => void) | null = null
      ;(window as any).runtime = {
        EventsOnMultiple: vi.fn((eventName: string, cb: () => void) => {
          if (eventName === 'collection:external-change') {
            registeredCallback = cb
          }
          return () => {}
        })
      }

      try {
        setActivePinia(createPinia())
        const store = useCollectionStore()
        expect(store.hasExternalChanges).toBe(false)
        expect(registeredCallback).toBeTypeOf('function')

        registeredCallback!()
        expect(store.hasExternalChanges).toBe(true)
      } finally {
        delete (window as any).runtime
      }
    })

    it('preserves expandedFolders for surviving folders, syncs activeEnvId, updates surviving tabs, and closes deleted tabs', async () => {
      const { useTabStore } = await import('../tabStore')
      const store = useCollectionStore()
      const envStore = useEnvironmentStore()
      const tabStore = useTabStore()

      store.hasExternalChanges = true
      store.expandedFolders = new Set(['f-keep', 'f-deleted'])

      // Pre-populate environments where env-1 was active, and disk switched collection active_env_id to env-2
      envStore.environments = [
        { id: 'env-1', name: 'Dev', variables: [] } as any,
        { id: 'env-2', name: 'Staging', variables: [] } as any
      ]
      envStore.activeEnvId = 'env-1'
      envStore.loaded = true

      tabStore.openTab({ entityId: 'f-keep', type: 'folder', name: 'Old Folder Name' })
      tabStore.openTab({ entityId: 'f-deleted', type: 'folder', name: 'Deleted Folder' })
      tabStore.openTab({ entityId: 'req-deleted', type: 'request', name: 'Deleted Req', method: 'GET' })
      tabStore.openTab({ entityId: 'req-keep', type: 'request', name: 'Old Req Name', method: 'GET' })

      vi.mocked(ListCollections).mockResolvedValueOnce(
        resSuccess([
          { id: 'default', name: 'Default', is_default: true, is_active: true, active_env_id: 'env-2' }
        ])
      )
      vi.mocked(ListEnvironments).mockResolvedValueOnce(
        resSuccess([
          { id: 'env-1', name: 'Dev', variables: [] },
          { id: 'env-2', name: 'Staging', variables: [] }
        ])
      )
      vi.mocked(GetCollectionTree).mockResolvedValueOnce(
        resSuccess([
          {
            id: 'f-keep',
            name: 'Renamed Folder',
            type: 'folder',
            path: 'renamed-folder',
            created_at: '',
            children: [
              {
                id: 'req-keep',
                name: 'Renamed Request',
                type: 'request',
                method: 'POST',
                path: 'renamed-folder/req-keep',
                created_at: ''
              }
            ]
          }
        ])
      )
      vi.mocked(GetRequest).mockResolvedValueOnce(
        resSuccess(createMockRequest({ id: 'req-keep', name: 'Renamed Request', method: 'POST', url: 'https://api.example.com/v2' }))
      )

      await store.smartReload()

      expect(store.hasExternalChanges).toBe(false)
      expect(store.expandedFolders.has('f-keep')).toBe(true)
      expect(store.expandedFolders.has('f-deleted')).toBe(false)
      expect(envStore.activeEnvId).toBe('env-2')

      // f-deleted and req-deleted tabs should be closed; f-keep and req-keep should have updated names/methods
      expect(tabStore.tabs.map(t => t.id)).toEqual(['folder:f-keep', 'request:req-keep'])
      expect(tabStore.tabs[0].name).toBe('Renamed Folder')
      expect(tabStore.tabs[1].name).toBe('Renamed Request')
      expect(tabStore.tabs[1].method).toBe('POST')
      expect(GetRequest).toHaveBeenCalledWith('req-keep')

      // Also verify that if activeRequestId and activeFolderId point to deleted entities, they are cleaned up
      const reqStore = useRequestStore()
      const cancelAutoSaveSpy = vi.spyOn(reqStore, 'cancelAutoSave')
      const clearRequestSpy = vi.spyOn(reqStore, 'clearRequest')
      const registerFlushSpy = vi.spyOn(tabStore, 'registerFolderFlush')

      store.activeRequestId = 'req-gone'
      store.activeFolderId = 'f-gone'
      vi.mocked(ListCollections).mockResolvedValueOnce(
        resSuccess([{ id: 'default', name: 'Default', is_default: true, is_active: true }])
      )
      vi.mocked(ListEnvironments).mockResolvedValueOnce(resSuccess([]))
      vi.mocked(GetCollectionTree).mockResolvedValueOnce(resSuccess([]))

      await store.smartReload()

      expect(cancelAutoSaveSpy).toHaveBeenCalled()
      expect(clearRequestSpy).toHaveBeenCalled()
      expect(registerFlushSpy).toHaveBeenCalledWith(null)
      expect(store.activeRequestId).toBeNull()
      expect(store.activeFolderId).toBeNull()
    })

    it('protects dirty active Request tab during smartReload and shows warning toast', async () => {
      const { useTabStore } = await import('../tabStore')
      const store = useCollectionStore()
      const reqStore = useRequestStore()
      const uiStore = useUiStore()
      const tabStore = useTabStore()

      const initialReq = createMockRequest({ id: 'req-dirty', name: 'Dirty Req', method: 'GET', url: 'https://old.local' })
      reqStore.original = JSON.parse(JSON.stringify(initialReq))
      reqStore.current = { ... JSON.parse(JSON.stringify(initialReq)), url: 'https://unsaved-edit.local' }
      expect(reqStore.isDirty).toBe(true)

      store.activeRequestId = 'req-dirty'
      tabStore.openTab({ entityId: 'req-dirty', type: 'request', name: 'Dirty Req', method: 'GET', isDirty: true })

      vi.mocked(ListCollections).mockResolvedValueOnce(
        resSuccess([{ id: 'default', name: 'Default', is_default: true, is_active: true }])
      )
      vi.mocked(ListEnvironments).mockResolvedValueOnce(resSuccess([]))
      vi.mocked(GetCollectionTree).mockResolvedValueOnce(
        resSuccess([
          { id: 'req-dirty', name: 'Dirty Req', type: 'request', method: 'POST', path: 'req-dirty', created_at: '' }
        ])
      )

      const toastSpy = vi.spyOn(uiStore, 'showToast')
      vi.mocked(GetRequest).mockClear()

      await store.smartReload()

      expect(GetRequest).not.toHaveBeenCalled()
      expect(reqStore.current?.url).toBe('https://unsaved-edit.local')
      expect(toastSpy).toHaveBeenCalledWith(
        'Dữ liệu trên đĩa đã thay đổi, nhưng tab hiện tại đang có chỉnh sửa chưa lưu nên được giữ nguyên.'
      )
    })

    it('dispatches hecto:folder-updated when active Folder tab is clean, and shows warning toast when dirty', async () => {
      const { useTabStore } = await import('../tabStore')
      const store = useCollectionStore()
      const uiStore = useUiStore()
      const tabStore = useTabStore()

      store.activeFolderId = 'f-1'
      tabStore.openTab({ entityId: 'f-1', type: 'folder', name: 'Folder 1', isDirty: false })

      const folderTree = [
        { id: 'f-1', name: 'Folder 1', type: 'folder', path: 'f-1', created_at: '', children: [] }
      ]
      vi.mocked(ListCollections).mockResolvedValue(
        resSuccess([{ id: 'default', name: 'Default', is_default: true, is_active: true }])
      )
      vi.mocked(ListEnvironments).mockResolvedValue(resSuccess([]))
      vi.mocked(GetCollectionTree).mockResolvedValue(resSuccess(folderTree))

      const receivedEvents: any[] = []
      const onFolderUpdated = (e: Event) => {
        receivedEvents.push((e as CustomEvent).detail)
      }
      window.addEventListener('hecto:folder-updated', onFolderUpdated)

      try {
        // 1. Clean folder tab -> dispatches hecto:folder-updated
        await store.smartReload()
        expect(receivedEvents).toEqual([{ folderId: 'f-1', reload: true }])

        // 2. Dirty folder tab -> does not dispatch event, shows toast
        receivedEvents.length = 0
        tabStore.setTabDirty('folder', 'f-1', true)
        const toastSpy = vi.spyOn(uiStore, 'showToast')

        await store.smartReload()
        expect(receivedEvents).toHaveLength(0)
        expect(toastSpy).toHaveBeenCalledWith(
          'Dữ liệu trên đĩa đã thay đổi, nhưng tab hiện tại đang có chỉnh sửa chưa lưu nên được giữ nguyên.'
        )
      } finally {
        window.removeEventListener('hecto:folder-updated', onFolderUpdated)
      }
    })

    it('synchronizes flowStore during smartReload: reloads clean active flow and protects dirty active flow', async () => {
      const { useFlowStore } = await import('../flowStore')
      const store = useCollectionStore()
      const flowStore = useFlowStore()
      const uiStore = useUiStore()

      vi.mocked(ListCollections).mockResolvedValue(
        resSuccess([{ id: 'default', name: 'Default', is_default: true, is_active: true }])
      )
      vi.mocked(ListEnvironments).mockResolvedValue(resSuccess([]))
      vi.mocked(GetCollectionTree).mockResolvedValue(resSuccess([]))

      const loadFlowTreeSpy = vi.spyOn(flowStore, 'loadFlowTree').mockImplementation(async () => {
        flowStore.flowTree = [
          {
            id: 'ff-keep',
            name: 'Flow Folder Keep',
            type: 'flow_folder',
            path: 'flows/ff-keep',
            created_at: '',
            children: [
              { id: 'flow-active', name: 'Active Flow', type: 'flow', path: 'flows/ff-keep/flow-active.json', created_at: '' }
            ]
          }
        ]
      })
      const selectFlowSpy = vi.spyOn(flowStore, 'selectFlow').mockResolvedValue(true)

      // 1. Clean active flow -> reloads via selectFlow(id, { force: true }) and prunes deleted expandedFlowFolders
      flowStore.expandedFlowFolders.add('ff-keep')
      flowStore.expandedFlowFolders.add('ff-deleted')
      flowStore.activeFlowId = 'flow-active'
      flowStore.currentFlow = { id: 'flow-active', name: 'Active Flow', nodes: [] } as any
      flowStore.savedSnapshot = JSON.stringify(flowStore.currentFlow)
      expect(flowStore.isDirty).toBe(false)

      await store.smartReload()

      expect(loadFlowTreeSpy).toHaveBeenCalledTimes(1)
      expect(flowStore.expandedFlowFolders.has('ff-keep')).toBe(true)
      expect(flowStore.expandedFlowFolders.has('ff-deleted')).toBe(false)
      expect(selectFlowSpy).toHaveBeenCalledWith('flow-active', { force: true })

      // 2. Dirty active flow -> preserves in-memory currentFlow and shows warning toast
      selectFlowSpy.mockClear()
      const toastSpy = vi.spyOn(uiStore, 'showToast')
      flowStore.currentFlow = { id: 'flow-active', name: 'Unsaved Flow Name', nodes: [] } as any
      expect(flowStore.isDirty).toBe(true)

      await store.smartReload()

      expect(selectFlowSpy).not.toHaveBeenCalled()
      expect(flowStore.currentFlow?.name).toBe('Unsaved Flow Name')
      expect(toastSpy).toHaveBeenCalledWith(
        'Dữ liệu trên đĩa đã thay đổi, nhưng Flow hiện tại đang có chỉnh sửa chưa lưu nên được giữ nguyên.'
      )

      // 3. Deleted dirty active flow -> clears currentFlow and shows deleted toast
      toastSpy.mockClear()
      loadFlowTreeSpy.mockImplementationOnce(async () => {
        flowStore.flowTree = []
      })

      await store.smartReload()

      expect(flowStore.activeFlowId).toBeNull()
      expect(flowStore.currentFlow).toBeNull()
      expect(toastSpy).toHaveBeenCalledWith('Mục đang chỉnh sửa đã bị xóa khỏi đĩa.')

      // 4. When loadFlowTree fails (flowStore.error is set), smartReload does NOT clear activeFlowId
      flowStore.activeFlowId = 'flow-keep-on-error'
      flowStore.currentFlow = { id: 'flow-keep-on-error', name: 'Keep On Error', nodes: [] } as any
      loadFlowTreeSpy.mockImplementationOnce(async () => {
        flowStore.error = 'Transient disk error'
        flowStore.flowTree = []
      })

      await store.smartReload()

      expect(flowStore.activeFlowId).toBe('flow-keep-on-error')
      expect(flowStore.currentFlow?.id).toBe('flow-keep-on-error')
    })

    it('guards switchCollection when flowStore.isDirty is true and resets flowStore state on switchCollection, deleteCollection, and refresh', async () => {
      const { useFlowStore } = await import('../flowStore')
      const store = useCollectionStore()
      const flowStore = useFlowStore()
      const uiStore = useUiStore()

      store.activeCollectionId = 'default'
      flowStore.activeFlowId = 'flow-1'
      flowStore.currentFlow = { id: 'flow-1', name: 'Dirty Flow', nodes: [] } as any
      flowStore.savedSnapshot = '{"id":"flow-1","name":"Original Flow"}'
      flowStore.expandedFlowFolders.add('ff-1')
      flowStore.sortDirectionMap = { '': 'asc' }
      expect(flowStore.isDirty).toBe(true)

      // 1. Cancel unsaved flow prompt -> aborts switchCollection
      const promptSpy = vi.spyOn(uiStore, 'requestUnsavedPrompt').mockResolvedValueOnce('cancel')
      const cancelled = await store.switchCollection('col-2')
      expect(cancelled).toBe(false)
      expect(promptSpy).toHaveBeenCalled()
      expect(SwitchCollection).not.toHaveBeenCalled()

      // 2. Discard unsaved flow -> switches collection and resets flowStore
      promptSpy.mockResolvedValueOnce('discard')
      vi.mocked(SwitchCollection).mockResolvedValueOnce(resSuccess({}))
      vi.mocked(GetCollectionTree).mockResolvedValueOnce(resSuccess([]))
      vi.mocked(ListCollections).mockResolvedValueOnce(
        resSuccess([{ id: 'col-2', name: 'Collection 2', is_active: true }])
      )
      vi.mocked(ListEnvironments).mockResolvedValueOnce(resSuccess([]))
      const loadFlowTreeSpy = vi.spyOn(flowStore, 'loadFlowTree').mockResolvedValue()

      const switched = await store.switchCollection('col-2')
      expect(switched).toBe(true)
      expect(flowStore.activeFlowId).toBeNull()
      expect(flowStore.currentFlow).toBeNull()
      expect(flowStore.expandedFlowFolders.size).toBe(0)
      expect(flowStore.sortDirectionMap).toEqual({})
      expect(loadFlowTreeSpy).toHaveBeenCalled()

      // 3. deleteCollection on active collection resets flowStore and reloads flowTree
      flowStore.activeFlowId = 'flow-col2'
      flowStore.expandedFlowFolders.add('ff-col2')
      flowStore.sortDirectionMap = { 'ff-col2': 'desc' }
      vi.mocked(DeleteCollection).mockResolvedValueOnce(resSuccess({ active_collection: 'default' }))
      vi.mocked(GetCollectionTree).mockResolvedValueOnce(resSuccess([]))
      vi.mocked(ListCollections).mockResolvedValueOnce(
        resSuccess([{ id: 'default', name: 'Default', is_active: true }])
      )
      vi.mocked(ListEnvironments).mockResolvedValueOnce(resSuccess([]))
      loadFlowTreeSpy.mockClear()

      const deleted = await store.deleteCollection('col-2')
      expect(deleted).toBe(true)
      expect(flowStore.activeFlowId).toBeNull()
      expect(flowStore.expandedFlowFolders.size).toBe(0)
      expect(flowStore.sortDirectionMap).toEqual({})
      expect(loadFlowTreeSpy).toHaveBeenCalled()

      // 4. refresh() resets flowStore and reloads flowTree
      flowStore.activeFlowId = 'flow-default'
      flowStore.expandedFlowFolders.add('ff-default')
      flowStore.sortDirectionMap = { '': 'asc' }
      vi.mocked(GetCollectionTree).mockResolvedValueOnce(resSuccess([]))
      loadFlowTreeSpy.mockClear()

      await store.refresh()
      expect(flowStore.activeFlowId).toBeNull()
      expect(flowStore.expandedFlowFolders.size).toBe(0)
      expect(flowStore.sortDirectionMap).toEqual({})
      expect(loadFlowTreeSpy).toHaveBeenCalled()
    })
  })
})


