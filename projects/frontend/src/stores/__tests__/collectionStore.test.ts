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
  MoveRequest: vi.fn(),
  SelectPostmanFile: vi.fn(),
  ImportPostman: vi.fn(),
  ListCollections: vi.fn().mockResolvedValue({ success: true, data: [] }),
  SwitchCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  CreateCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  RenameCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  DeleteCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
  DuplicateCollection: vi.fn().mockResolvedValue({ success: true, data: {} }),
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
  GetCollectionTree,
  SaveRequest,
  ListEnvironments
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
        { slug: 'default', name: 'Default', is_default: true, is_active: false } as any,
        { slug: 'project-a', name: 'Project A', is_default: false, is_active: true } as any
      ]
      store.activeCollectionSlug = 'project-a'

      expect(store.activeCollection).toEqual({
        slug: 'project-a',
        name: 'Project A',
        is_default: false,
        is_active: true
      })

      store.activeCollectionSlug = 'non-existent'
      expect(store.activeCollection).toBeNull()
    })

    it('isDefaultActive returns true when slug is default or empty, false otherwise', () => {
      const store = useCollectionStore()
      expect(store.isDefaultActive).toBe(true)

      store.activeCollectionSlug = 'default'
      expect(store.isDefaultActive).toBe(true)

      store.activeCollectionSlug = 'custom-slug'
      expect(store.isDefaultActive).toBe(false)
    })
  })

  describe('loadCollections', () => {
    it('updates collections and activeCollectionSlug from item with is_active: true', async () => {
      const store = useCollectionStore()
      vi.mocked(ListCollections).mockResolvedValueOnce(resSuccess([
        { slug: 'default', name: 'Default', is_default: true, is_active: false },
        { slug: 'ecommerce-uuid', name: 'E-commerce', is_default: false, is_active: true }
      ]))

      await store.loadCollections()

      expect(store.collections).toHaveLength(2)
      expect(store.activeCollectionSlug).toBe('ecommerce-uuid')
      expect(store.collectionsLoading).toBe(false)
    })

    it('falls back to default if no item has is_active: true', async () => {
      const store = useCollectionStore()
      vi.mocked(ListCollections).mockResolvedValueOnce(resSuccess([
        { slug: 'default', name: 'Default', is_default: true, is_active: false }
      ]))

      await store.loadCollections()

      expect(store.activeCollectionSlug).toBe('default')
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
    it('returns true immediately when targetSlug equals activeCollectionSlug', async () => {
      const store = useCollectionStore()
      store.activeCollectionSlug = 'current-slug'

      const result = await store.switchCollection('current-slug')

      expect(result).toBe(true)
      expect(SwitchCollection).not.toHaveBeenCalled()
    })

    it('blocks concurrent switch calls when switching is in progress', async () => {
      const store = useCollectionStore()
      store.activeCollectionSlug = 'default'
      store.switching = true

      const result = await store.switchCollection('target-slug')

      expect(result).toBe(false)
      expect(SwitchCollection).not.toHaveBeenCalled()
    })

    it('switches collection cleanly when isDirty is false and isolates state', async () => {
      const store = useCollectionStore()
      const reqStore = useRequestStore()
      const resStore = useResponseStore()
      const envStore = useEnvironmentStore()
      const uiStore = useUiStore()

      store.activeCollectionSlug = 'default'
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
        { slug: 'default', name: 'Default', is_default: true, is_active: false },
        { slug: 'target-slug', name: 'Target', is_default: false, is_active: true }
      ]))

      const result = await store.switchCollection('target-slug')

      expect(result).toBe(true)
      expect(SwitchCollection).toHaveBeenCalledWith('target-slug')
      expect(store.activeCollectionSlug).toBe('target-slug')
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

    it('shows toast and keeps collection when backend SwitchCollection fails', async () => {
      const store = useCollectionStore()
      const uiStore = useUiStore()
      const showToastSpy = vi.spyOn(uiStore, 'showToast')

      store.activeCollectionSlug = 'default'
      vi.mocked(SwitchCollection).mockResolvedValueOnce(resError('Collection không tồn tại', 'NOT_FOUND'))

      const result = await store.switchCollection('missing-slug')

      expect(result).toBe(false)
      expect(store.activeCollectionSlug).toBe('default')
      expect(store.switching).toBe(false)
      expect(showToastSpy).toHaveBeenCalledWith('Collection không tồn tại')
    })

    it('prompts user when isDirty is true and aborts if user cancels', async () => {
      const store = useCollectionStore()
      const reqStore = useRequestStore()
      const uiStore = useUiStore()

      store.activeCollectionSlug = 'default'
      reqStore.original = createMockRequest({ id: 'req-1', name: 'Original' })
      reqStore.current = createMockRequest({ id: 'req-1', name: 'Modified' })
      expect(reqStore.isDirty).toBe(true)

      const promptSpy = vi.spyOn(uiStore, 'requestUnsavedPrompt').mockResolvedValueOnce('cancel')

      const result = await store.switchCollection('target-slug')

      expect(result).toBe(false)
      expect(promptSpy).toHaveBeenCalledWith(
        'Request hiện tại có thay đổi chưa được lưu. Bạn có muốn lưu lại trước khi chuyển collection?'
      )
      expect(SwitchCollection).not.toHaveBeenCalled()
      expect(store.activeCollectionSlug).toBe('default')
      expect(store.switching).toBe(false)
      expect(reqStore.current?.name).toBe('Modified')
    })

    it('prompts user and saves before switching when user chooses save', async () => {
      const store = useCollectionStore()
      const reqStore = useRequestStore()
      const uiStore = useUiStore()

      store.activeCollectionSlug = 'default'
      reqStore.original = createMockRequest({ id: 'req-1', name: 'Original' })
      reqStore.current = createMockRequest({ id: 'req-1', name: 'Modified' })
      expect(reqStore.isDirty).toBe(true)

      vi.spyOn(uiStore, 'requestUnsavedPrompt').mockResolvedValueOnce('save')
      vi.mocked(SaveRequest).mockResolvedValueOnce(resSuccess({}))
      vi.mocked(SwitchCollection).mockResolvedValueOnce(resSuccess({}))

      const result = await store.switchCollection('target-slug')

      expect(result).toBe(true)
      expect(SaveRequest).toHaveBeenCalled()
      expect(SwitchCollection).toHaveBeenCalledWith('target-slug')
      expect(reqStore.current).toBeNull() // Cleared after switch
      expect(store.switching).toBe(false)
    })

    it('aborts switch when user chooses save but saving fails', async () => {
      const store = useCollectionStore()
      const reqStore = useRequestStore()
      const uiStore = useUiStore()

      store.activeCollectionSlug = 'default'
      reqStore.original = createMockRequest({ id: 'req-1', name: 'Original' })
      reqStore.current = createMockRequest({ id: 'req-1', name: 'Modified' })

      vi.spyOn(uiStore, 'requestUnsavedPrompt').mockResolvedValueOnce('save')
      vi.mocked(SaveRequest).mockResolvedValueOnce(resError('Disk write failed', 'IO_ERROR'))

      const result = await store.switchCollection('target-slug')

      expect(result).toBe(false)
      expect(SwitchCollection).not.toHaveBeenCalled()
      expect(store.activeCollectionSlug).toBe('default')
      expect(store.switching).toBe(false)
    })

    it('aborts switch when save resolves but reqStore is still dirty', async () => {
      const store = useCollectionStore()
      const reqStore = useRequestStore()
      const uiStore = useUiStore()

      store.activeCollectionSlug = 'default'
      reqStore.original = createMockRequest({ id: 'req-1', name: 'Original' })
      reqStore.current = createMockRequest({ id: 'req-1', name: 'Modified' })

      vi.spyOn(uiStore, 'requestUnsavedPrompt').mockResolvedValueOnce('save')
      // Spy saveCurrent to simulate a save that does not clear dirty state
      vi.spyOn(reqStore, 'saveCurrent').mockImplementation(async () => {
        // Do nothing to original/current, leaving isDirty = true
      })

      const result = await store.switchCollection('target-slug')

      expect(result).toBe(false)
      expect(SwitchCollection).not.toHaveBeenCalled()
      expect(store.switching).toBe(false)
    })

    it('discards unsaved changes and proceeds when user chooses discard', async () => {
      const store = useCollectionStore()
      const reqStore = useRequestStore()
      const uiStore = useUiStore()

      store.activeCollectionSlug = 'default'
      reqStore.original = createMockRequest({ id: 'req-1', name: 'Original' })
      reqStore.current = createMockRequest({ id: 'req-1', name: 'Modified' })

      vi.spyOn(uiStore, 'requestUnsavedPrompt').mockResolvedValueOnce('discard')
      vi.mocked(SwitchCollection).mockResolvedValueOnce(resSuccess({}))

      const result = await store.switchCollection('target-slug')

      expect(result).toBe(true)
      expect(SaveRequest).not.toHaveBeenCalled()
      expect(SwitchCollection).toHaveBeenCalledWith('target-slug')
      expect(reqStore.current).toBeNull()
      expect(store.switching).toBe(false)
    })

    it('skips dirty prompt when force option is true', async () => {
      const store = useCollectionStore()
      const reqStore = useRequestStore()
      const uiStore = useUiStore()

      store.activeCollectionSlug = 'default'
      reqStore.original = createMockRequest({ id: 'req-1', name: 'Original' })
      reqStore.current = createMockRequest({ id: 'req-1', name: 'Modified' })

      const promptSpy = vi.spyOn(uiStore, 'requestUnsavedPrompt')
      vi.mocked(SwitchCollection).mockResolvedValueOnce(resSuccess({}))

      const result = await store.switchCollection('target-slug', { force: true })

      expect(result).toBe(true)
      expect(promptSpy).not.toHaveBeenCalled()
      expect(SwitchCollection).toHaveBeenCalledWith('target-slug')
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

      store.activeCollectionSlug = 'active-to-delete'
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
      expect(store.activeCollectionSlug).toBe('default')
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

      store.activeCollectionSlug = 'active-proj'
      store.activeRequestId = 'req-stay'
      reqStore.current = createMockRequest({ id: 'req-stay' })

      vi.mocked(DeleteCollection).mockResolvedValueOnce(resSuccess(null))
      vi.mocked(ListCollections).mockResolvedValueOnce(resSuccess([
        { slug: 'active-proj', name: 'Active Project', is_default: false, is_active: true }
      ]))

      const result = await store.deleteCollection('other-slug')

      expect(result).toBe(true)
      expect(DeleteCollection).toHaveBeenCalledWith('other-slug')
      expect(store.activeCollectionSlug).toBe('active-proj')
      expect(reqStore.current).not.toBeNull()
      expect(store.activeRequestId).toBe('req-stay')
      expect(ListCollections).toHaveBeenCalled()
    })

    it('shows toast when DeleteCollection fails', async () => {
      const store = useCollectionStore()
      const uiStore = useUiStore()
      const showToastSpy = vi.spyOn(uiStore, 'showToast')

      vi.mocked(DeleteCollection).mockResolvedValueOnce(resError('Xóa thất bại', 'IO_ERROR'))

      const result = await store.deleteCollection('some-slug')

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

      const result = await store.renameCollection('slug-1', '  ')

      expect(result).toBe(false)
      expect(RenameCollection).not.toHaveBeenCalled()
      expect(showToastSpy).toHaveBeenCalledWith('Tên không được để trống')
    })

    it('renameCollection calls RenameCollection and reloads list', async () => {
      const store = useCollectionStore()
      vi.mocked(RenameCollection).mockResolvedValueOnce(resSuccess({}))

      const result = await store.renameCollection('slug-1', 'Renamed Name')

      expect(result).toBe(true)
      expect(RenameCollection).toHaveBeenCalledWith('slug-1', 'Renamed Name')
      expect(ListCollections).toHaveBeenCalled()
    })

    it('renameCollection shows toast and returns false when RenameCollection fails', async () => {
      const store = useCollectionStore()
      const uiStore = useUiStore()
      const showToastSpy = vi.spyOn(uiStore, 'showToast')

      vi.mocked(RenameCollection).mockResolvedValueOnce(resError('Đổi tên thất bại', 'IO_ERROR'))

      const result = await store.renameCollection('slug-1', 'New Name')

      expect(result).toBe(false)
      expect(showToastSpy).toHaveBeenCalledWith('Đổi tên thất bại')
    })

    it('duplicateCollection calls DuplicateCollection and reloads list', async () => {
      const store = useCollectionStore()
      vi.mocked(DuplicateCollection).mockResolvedValueOnce(resSuccess({}))

      const result = await store.duplicateCollection('slug-1')

      expect(result).toBe(true)
      expect(DuplicateCollection).toHaveBeenCalledWith('slug-1')
      expect(ListCollections).toHaveBeenCalled()
    })

    it('duplicateCollection shows toast and returns false when DuplicateCollection fails', async () => {
      const store = useCollectionStore()
      const uiStore = useUiStore()
      const showToastSpy = vi.spyOn(uiStore, 'showToast')

      vi.mocked(DuplicateCollection).mockResolvedValueOnce(resError('Nhân bản thất bại', 'IO_ERROR'))

      const result = await store.duplicateCollection('slug-1')

      expect(result).toBe(false)
      expect(showToastSpy).toHaveBeenCalledWith('Nhân bản thất bại')
    })
  })
})
