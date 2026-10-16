import { defineStore } from 'pinia'
import { EventsOn } from '../../wailsjs/runtime/runtime'
import { model } from '../../wailsjs/go/models'
import {
  GetCollectionTree,
  CreateRequest,
  CreateFolder,
  RenameRequest,
  RenameFolder,
  DeleteFolder,
  DeleteRequest,
  DuplicateRequest,
  MoveRequest,
  SelectPostmanFile,
  ImportPostman,
  ListCollections,
  SwitchCollection,
  CreateCollection,
  RenameCollection,
  UpdateCollection,
  DeleteCollection,
  DuplicateCollection,
  SaveCollectionGitRemote,
  GetCollectionGitStatus,
  GitPullCollection,
  GitPushCollection,
  GitClearAndPullCollection,
  GitStashAndPullCollection,
  GitListLocalBranches,
  GitPushCollectionToBranch,
  ResolveGitConflict,
  AbortGitMerge
} from '../../wailsjs/go/main/App'
import { useTabStore, type TabEntityType } from './tabStore'

export interface AuthConfig {
  type: 'inherit' | 'none' | 'bearer' | 'basic' | 'apiKey'
  bearer?: { token: string }
  basic?: { username: string; password: string }
  apiKey?: { key: string; value: string; addTo: 'header' | 'query' }
}

export interface TreeNode {
  id: string
  name: string
  type: string
  method?: string
  path: string
  url?: string
  body?: {
    type: string
    content?: string
    [key: string]: any
  }
  children?: TreeNode[]
  variables?: { key: string; value: string; enabled: boolean }[]
  folder_envs?: Record<string, { key: string; value: string; enabled: boolean }[]>
  headers?: { key: string; value: string; enabled: boolean }[]
  auth?: AuthConfig
  auth_envs?: Record<string, AuthConfig>
  created_at: string
}

interface CollectionState {
  tree: TreeNode[]
  expandedFolders: Set<string>
  activeRequestId: string | null
  activeFolderId: string | null
  loading: boolean
  importProgress: string | null
  error: string | null
  collections: model.Collection[]
  activeCollectionId: string | null
  collectionsLoading: boolean
  switching: boolean
  gitSyncLoading: boolean
  gitSyncStatus: model.GitSyncStatus | null
  gitConflictError: { message: string; files: string[] } | null
  gitBranches: string[]
}

export const useCollectionStore = defineStore('collection', {
  state: (): CollectionState => ({
    tree: [],
    expandedFolders: new Set<string>(),
    activeRequestId: null,
    activeFolderId: null,
    loading: false,
    importProgress: null,
    error: null,
    collections: [],
    activeCollectionId: null,
    collectionsLoading: false,
    switching: false,
    gitSyncLoading: false,
    gitSyncStatus: null,
    gitConflictError: null,
    gitBranches: []
  }),
  getters: {
    activeCollection(state): model.Collection | null {
      if (!state.activeCollectionId) return null
      return state.collections.find(c => c.id === state.activeCollectionId) || null
    },
    isDefaultActive(state): boolean {
      if (!state.activeCollectionId) return true
      return state.activeCollectionId === 'default' || state.collections.find(c => c.id === state.activeCollectionId)?.is_default === true
    }
  },
  actions: {
    async refresh() {
      this.tree = []
      this.activeRequestId = null
      this.activeFolderId = null
      const { useRequestStore } = await import('./requestStore')
      useRequestStore().clearRequest()
      const { useResponseStore } = await import('./responseStore')
      useResponseStore().clear()
      useTabStore().clearAllTabs()
      this.expandedFolders.clear()
      await this.loadTree()
    },
    async loadTree() {
      this.loading = true
      this.error = null
      try {
        const result = await GetCollectionTree()
        if (result.success) {
          this.tree = result.data || []
        } else {
          this.error = result.error?.message || 'Failed to load tree'
        }
      } catch (err) {
        this.error = String(err)
      } finally {
        this.loading = false
      }
    },
    async loadCollections() {
      this.collectionsLoading = true
      try {
        const result = await ListCollections()
        if (result.success) {
          const list = (result.data as model.Collection[]) || []
          this.collections = list
          const active = list.find(c => c.is_active)
          if (active) {
            this.activeCollectionId = active.id || 'default'
          } else if (!this.activeCollectionId || !list.some(c => c.id === this.activeCollectionId)) {
            this.activeCollectionId = 'default'
          }
          const { useEnvironmentStore } = await import('./environmentStore')
          const envStore = useEnvironmentStore()
          if (envStore.loaded) {
            envStore.syncActiveEnvFromCollection()
          }
        } else {
          this.collections = []
          const { useUiStore } = await import('./uiStore')
          useUiStore().showToast(result.error?.message || 'Không thể tải danh sách collection')
        }
      } catch (err) {
        this.collections = []
        const { useUiStore } = await import('./uiStore')
        useUiStore().showToast(String(err))
      } finally {
        this.collectionsLoading = false
      }
    },
    async switchCollection(targetId: string, opts?: { force?: boolean }): Promise<boolean> {
      if (this.switching) return false
      if (targetId === this.activeCollectionId) return true

      this.switching = true
      try {
        const { useRequestStore } = await import('./requestStore')
        const reqStore = useRequestStore()
        const { useUiStore } = await import('./uiStore')
        const uiStore = useUiStore()
        const tabStore = useTabStore()

        if (!opts?.force && reqStore.isDirty) {
          const choice = await uiStore.requestUnsavedPrompt(
            'Request hiện tại có thay đổi chưa được lưu. Bạn có muốn lưu lại trước khi chuyển collection?'
          )
          if (choice === 'cancel') return false
          if (choice === 'save') {
            await reqStore.saveCurrent()
            if (reqStore.error || reqStore.isDirty) return false
          }
          // if choice === 'discard', continue
        }

        if (!opts?.force && (this.activeFolderId || tabStore.activeTab?.type === 'folder')) {
          const folderSaved = await tabStore.flushActiveFolderIfNeeded()
          if (!folderSaved) return false
        }

        const result = await SwitchCollection(targetId)
        if (result.success) {
          this.activeCollectionId = targetId
          reqStore.clearRequest()
          const { useResponseStore } = await import('./responseStore')
          const resStore = useResponseStore()
          resStore.clear()
          tabStore.clearAllTabs()
          this.activeRequestId = null
          this.activeFolderId = null
          this.expandedFolders.clear()
          uiStore.closeContextMenu()
          const { useEnvironmentStore } = await import('./environmentStore')
          const envStore = useEnvironmentStore()
          const { useMockServerStore } = await import('./mockServerStore')
          const mockStore = useMockServerStore()
          await Promise.all([this.loadTree(), envStore.refresh(), this.loadCollections(), mockStore.loadStatus()])
          envStore.syncActiveEnvFromCollection()
          return true
        } else {
          uiStore.showToast(result.error?.message || 'Không thể chuyển collection')
          return false
        }
      } catch (err) {
        const { useUiStore } = await import('./uiStore')
        useUiStore().showToast(String(err))
        return false
      } finally {
        this.switching = false
      }
    },
    async createCollection(name: string): Promise<boolean> {
      const { useUiStore } = await import('./uiStore')
      const uiStore = useUiStore()

      if (!name || !name.trim()) {
        uiStore.showToast('Tên không được để trống')
        return false
      }

      try {
        const result = await CreateCollection(name.trim())
        if (result.success) {
          await this.loadCollections()
          uiStore.showToast('Đã tạo collection')
          return true
        } else {
          uiStore.showToast(result.error?.message || 'Không thể tạo collection')
          return false
        }
      } catch (err) {
        uiStore.showToast(String(err))
        return false
      }
    },
    async renameCollection(id: string, name: string): Promise<boolean> {
      const { useUiStore } = await import('./uiStore')
      const uiStore = useUiStore()

      if (!name || !name.trim()) {
        uiStore.showToast('Tên không được để trống')
        return false
      }

      try {
        const result = await RenameCollection(id, name.trim())
        if (result.success) {
          await this.loadCollections()
          uiStore.showToast('Đã đổi tên collection')
          return true
        } else {
          uiStore.showToast(result.error?.message || 'Không thể đổi tên collection')
          return false
        }
      } catch (err) {
        uiStore.showToast(String(err))
        return false
      }
    },
    async deleteCollection(id: string): Promise<boolean> {
      const { useUiStore } = await import('./uiStore')
      const uiStore = useUiStore()

      if (id === 'default') {
        uiStore.showToast('Không thể xóa collection mặc định')
        return false
      }

      // Abort/clear in-flight HTTP request before calling DeleteCollection
      const { useResponseStore } = await import('./responseStore')
      const resStore = useResponseStore()
      resStore.clear()

      try {
        const result = await DeleteCollection(id)
        if (result.success) {
          uiStore.showToast('Đã xóa collection')
          const isActive = id === this.activeCollectionId || Boolean((result.data as any)?.active_collection)
          if (isActive) {
            this.activeCollectionId = 'default'
            const { useRequestStore } = await import('./requestStore')
            useRequestStore().clearRequest()
            useTabStore().clearAllTabs()
            this.activeRequestId = null
            this.activeFolderId = null
            this.expandedFolders.clear()
            const { useEnvironmentStore } = await import('./environmentStore')
            const envStore = useEnvironmentStore()
            await Promise.all([this.loadTree(), envStore.refresh(), this.loadCollections()])
            envStore.syncActiveEnvFromCollection()
          } else {
            await this.loadCollections()
          }
          return true
        } else {
          uiStore.showToast(result.error?.message || 'Không thể xóa collection')
          return false
        }
      } catch (err) {
        uiStore.showToast(String(err))
        return false
      }
    },
    async duplicateCollection(id: string): Promise<boolean> {
      const { useUiStore } = await import('./uiStore')
      const uiStore = useUiStore()
      try {
        const result = await DuplicateCollection(id)
        if (result.success) {
          await this.loadCollections()
          uiStore.showToast('Đã nhân bản collection')
          return true
        } else {
          uiStore.showToast(result.error?.message || 'Không thể nhân bản collection')
          return false
        }
      } catch (err) {
        uiStore.showToast(String(err))
        return false
      }
    },
    toggleFolder(id: string) {
      if (this.expandedFolders.has(id)) {
        this.expandedFolders.delete(id)
      } else {
        this.expandedFolders.add(id)
      }
    },
    async selectRequest(id: string, opts?: { force?: boolean }) {
      const tabStore = useTabStore()
      if (this.activeRequestId === id && !this.activeFolderId) {
        const node = this.findNode(this.tree, id)
        const { useRequestStore } = await import('./requestStore')
        const reqStore = useRequestStore()
        tabStore.openTab({
          entityId: id,
          type: 'request',
          name: reqStore.current?.id === id ? (reqStore.current.name || node?.name || id) : (node?.name || id),
          method: reqStore.current?.id === id ? (reqStore.current.method || node?.method || 'GET') : (node?.method || 'GET'),
          isDirty: reqStore.current?.id === id ? reqStore.isDirty : undefined
        })
        return
      }
      
      const { useRequestStore } = await import('./requestStore')
      const reqStore = useRequestStore()
      const { useUiStore } = await import('./uiStore')
      const uiStore = useUiStore()

      if (!opts?.force && reqStore.isDirty) {
        const saved = await reqStore.flush()
        if (!saved) return // abort switch if save failed
      }

      if (!opts?.force && (this.activeFolderId || tabStore.activeTab?.type === 'folder')) {
        const folderSaved = await tabStore.flushActiveFolderIfNeeded()
        if (!folderSaved) return
      }

      const prevActiveRequestId = this.activeRequestId
      const prevActiveFolderId = this.activeFolderId
      const prevRequestId = this.activeRequestId || (tabStore.activeTab?.type === 'request' ? tabStore.activeTab.entityId : null)
      if (prevRequestId && prevRequestId !== id) {
        tabStore.saveResponseToCache(prevRequestId)
      }
      const prevOriginal = reqStore.original ? JSON.parse(JSON.stringify(reqStore.original)) : null
      const prevCurrent = reqStore.current ? JSON.parse(JSON.stringify(reqStore.current)) : null
      const prevSaveStatus = reqStore.saveStatus
      const prevContentTypeAuto = reqStore.contentTypeAuto

      const hadTabBefore = tabStore.tabs.some(t => t.type === 'request' && t.entityId === id)
      const prevActiveTabId = tabStore.activeTabId
      const node = this.findNode(this.tree, id)

      tabStore.openTab({
        entityId: id,
        type: 'request',
        name: node?.name || id,
        method: node?.method || 'GET'
      })
      tabStore.restoreResponseFromCache(id)
      
      this.activeRequestId = id
      this.activeFolderId = null
      
      await reqStore.loadRequest(id)
      
      // Guard: if the user clicked a different request while this was in flight, discard result
      if (this.activeRequestId !== id) return
      
      if (reqStore.error) {
        const errMsg = reqStore.error
        if (!hadTabBefore) {
          tabStore.tabs = tabStore.tabs.filter(t => !(t.type === 'request' && t.entityId === id))
          delete tabStore.responseCache[id]
          tabStore.activeTabId = prevActiveTabId && tabStore.tabs.some(t => t.id === prevActiveTabId)
            ? prevActiveTabId
            : (tabStore.tabs[tabStore.tabs.length - 1]?.id ?? null)
        }
        if (prevActiveRequestId && prevActiveRequestId !== id) {
          this.activeRequestId = prevActiveRequestId
          this.activeFolderId = null
          tabStore.restoreResponseFromCache(prevActiveRequestId)
          if (prevOriginal && prevCurrent && prevCurrent.id === prevActiveRequestId) {
            reqStore.original = prevOriginal
            reqStore.current = prevCurrent
            reqStore.saveStatus = prevSaveStatus
            reqStore.contentTypeAuto = prevContentTypeAuto
          }
        } else if (prevActiveFolderId) {
          this.activeRequestId = null
          this.activeFolderId = prevActiveFolderId
          const { useResponseStore } = await import('./responseStore')
          useResponseStore().resetDisplay()
        } else {
          this.activeRequestId = null
        }
        uiStore.showToast(errMsg)
        return
      }

      if (reqStore.current && reqStore.current.id === id) {
        tabStore.updateTabMeta('request', id, {
          name: reqStore.current.name || node?.name || id,
          method: reqStore.current.method || node?.method || 'GET'
        })
        tabStore.setTabDirty('request', id, reqStore.isDirty)
      }
    },
    async setActiveFolderId(id: string, opts?: { force?: boolean }) {
      const tabStore = useTabStore()
      if (this.activeFolderId === id && !this.activeRequestId) {
        const node = this.findNode(this.tree, id)
        tabStore.openTab({
          entityId: id,
          type: 'folder',
          name: node?.name || id
        })
        return
      }
      const { useRequestStore } = await import('./requestStore')
      const reqStore = useRequestStore()
      if (!opts?.force && reqStore.isDirty) {
        const saved = await reqStore.flush()
        if (!saved) return // abort if save failed
      }
      if (!opts?.force && ((this.activeFolderId && this.activeFolderId !== id) || (tabStore.activeTab?.type === 'folder' && tabStore.activeTab.entityId !== id))) {
        const folderSaved = await tabStore.flushActiveFolderIfNeeded()
        if (!folderSaved) return
      }

      const prevRequestId = this.activeRequestId || (tabStore.activeTab?.type === 'request' ? tabStore.activeTab.entityId : null)
      if (prevRequestId) {
        tabStore.saveResponseToCache(prevRequestId)
      }
      const { useResponseStore } = await import('./responseStore')
      useResponseStore().resetDisplay()

      this.activeFolderId = id
      this.activeRequestId = null
      reqStore.clearRequest()

      const node = this.findNode(this.tree, id)
      tabStore.openTab({
        entityId: id,
        type: 'folder',
        name: node?.name || id
      })
    },
    async selectFolder(id: string) {
      await this.setActiveFolderId(id)
    },
    async updateCollectionVariables(
      id: string,
      variables: { key: string; value: string; enabled: boolean }[],
      auth?: AuthConfig,
      authEnvs?: Record<string, AuthConfig>
    ): Promise<boolean> {
      const coll = this.collections.find(c => c.id === id)
      if (!coll) return false
      const { useUiStore } = await import('./uiStore')
      const uiStore = useUiStore()
      try {
        const cleanVars = (variables || []).filter(v => typeof v?.key === 'string' && v.key.trim() !== '')
        const preservedActiveEnvId = coll.active_env_id || ''
        const prevIsActive = coll.is_active
        const payload: any = {
          ...coll,
          id,
          variables: cleanVars,
          ...(auth !== undefined ? { auth } : {}),
          ...(authEnvs !== undefined ? { auth_envs: authEnvs } : {}),
          active_env_id: preservedActiveEnvId
        }
        const result = await UpdateCollection(payload)
        if (result.success) {
          if (result.data && Object.keys(result.data).length > 0) {
            Object.assign(coll, result.data)
            coll.is_active = prevIsActive
            coll.variables = result.data.variables ?? cleanVars
            if (auth !== undefined) {
              ;(coll as any).auth = (result.data as any).auth ?? auth
            }
            if (authEnvs !== undefined) {
              ;(coll as any).auth_envs = (result.data as any).auth_envs ?? authEnvs
            }
            if (result.data.active_env_id === undefined && preservedActiveEnvId) {
              coll.active_env_id = preservedActiveEnvId
            }
          } else {
            coll.variables = cleanVars
            if (auth !== undefined) {
              ;(coll as any).auth = auth
            }
            if (authEnvs !== undefined) {
              ;(coll as any).auth_envs = authEnvs
            }
          }
          return true
        } else {
          uiStore.showToast(result.error?.message || 'Không thể cập nhật biến collection')
          return false
        }
      } catch (err: any) {
        uiStore.showToast(String(err))
        return false
      }
    },
    async updateActiveCollectionEnv(activeEnvId: string | null): Promise<boolean> {
      const coll = this.activeCollection
      if (!coll) return false
      const normalizedEnvId = activeEnvId ? activeEnvId.trim() : ''
      const prevActiveEnvId = coll.active_env_id
      const prevIsActive = coll.is_active
      const prevVariables = coll.variables
      coll.active_env_id = normalizedEnvId

      let updateFn: typeof UpdateCollection | undefined
      try {
        updateFn = UpdateCollection
      } catch {
        return true
      }
      if (typeof updateFn !== 'function') {
        return true
      }

      const { useUiStore } = await import('./uiStore')
      const uiStore = useUiStore()
      try {
        const payload: any = {
          ...coll,
          id: coll.id || this.activeCollectionId,
          active_env_id: normalizedEnvId
        }
        const result = await updateFn(payload)
        if (result.success) {
          if (result.data && Object.keys(result.data).length > 0) {
            Object.assign(coll, result.data)
            coll.is_active = prevIsActive
            if (result.data.variables === undefined && prevVariables !== undefined) {
              coll.variables = prevVariables
            }
          }
          coll.active_env_id = normalizedEnvId
          return true
        } else {
          coll.active_env_id = prevActiveEnvId
          uiStore.showToast(result.error?.message || 'Không thể lưu môi trường đang chọn')
          return false
        }
      } catch (err: any) {
        coll.active_env_id = prevActiveEnvId
        uiStore.showToast(String(err))
        return false
      }
    },
    async createRequest(parentId: string = "") {
      const { useRequestStore } = await import('./requestStore')
      const reqStore = useRequestStore()
      if (reqStore.isDirty) {
        const saved = await reqStore.flush()
        if (!saved) return // abort if save failed
      }
      const tabStore = useTabStore()
      if (this.activeFolderId || tabStore.activeTab?.type === 'folder') {
        const folderSaved = await tabStore.flushActiveFolderIfNeeded()
        if (!folderSaved) return
      }
      try {
        const result = await CreateRequest(parentId)
        if (result.success) {
          await this.loadTree()
          if (result.data) {
             void this.selectRequest(result.data.id)
             if (parentId) {
               const path = this.findFolderPath(this.tree, parentId)
               if (path) path.forEach(n => this.expandedFolders.add(n.id))
             }
          }
        } else {
          const { useUiStore } = await import('./uiStore')
          useUiStore().showToast(result.error?.message || 'Không thể tạo request')
        }
      } catch (err) {
        const { useUiStore } = await import('./uiStore')
        useUiStore().showToast(String(err))
      }
    },
    async createFolder(parentId: string = "") {
      try {
        const result = await CreateFolder(parentId)
        if (result.success) {
          await this.loadTree()
          if (parentId) {
             const path = this.findFolderPath(this.tree, parentId)
             if (path) path.forEach(n => this.expandedFolders.add(n.id))
          }
          if (result.data) {
             this.expandedFolders.add(result.data.id)
          }
        } else {
          const { useUiStore } = await import('./uiStore')
          useUiStore().showToast(result.error?.message || 'Không thể tạo thư mục')
        }
      } catch (err) {
        const { useUiStore } = await import('./uiStore')
        useUiStore().showToast(String(err))
      }
    },
    async renameRequest(id: string, name: string) {
      try {
        const result = await RenameRequest(id, name)
        if (result.success) {
          await this.loadTree()
          const updatedNode = this.findNode(this.tree, id)
          const resolvedName = updatedNode ? updatedNode.name : ((result.data as any)?.name || name)
          useTabStore().updateTabMeta('request', id, { name: resolvedName })
          if (this.activeRequestId === id) {
            const { useRequestStore } = await import('./requestStore')
            const reqStore = useRequestStore()
            if (reqStore.current?.id === id && reqStore.original?.id === id) {
              reqStore.current.name = resolvedName
              reqStore.original.name = resolvedName
            }
          }
        } else {
          const { useUiStore } = await import('./uiStore')
          useUiStore().showToast(result.error?.message || 'Không thể đổi tên request')
        }
      } catch (err) {
        const { useUiStore } = await import('./uiStore')
        useUiStore().showToast(String(err))
      }
    },
    async renameFolder(id: string, name: string) {
      try {
        const result = await RenameFolder(id, name)
        if (result.success) {
          await this.loadTree()
          const updatedNode = this.findNode(this.tree, id)
          const resolvedName = updatedNode ? updatedNode.name : ((result.data as any)?.name || name)
          useTabStore().updateTabMeta('folder', id, { name: resolvedName })
        } else {
          const { useUiStore } = await import('./uiStore')
          useUiStore().showToast(result.error?.message || 'Không thể đổi tên thư mục')
        }
      } catch (err) {
        const { useUiStore } = await import('./uiStore')
        useUiStore().showToast(String(err))
      }
    },
    async deleteRequest(id: string) {
      if (this.activeRequestId === id) {
        const { useRequestStore } = await import('./requestStore')
        useRequestStore().cancelAutoSave()
      }
      try {
        const result = await DeleteRequest(id)
        if (result.success) {
          const { useUiStore } = await import('./uiStore')
          useUiStore().showToast('Đã xóa')
          
          const tabStore = useTabStore()
          const hadRequestTab = tabStore.tabs.some(t => t.type === 'request' && t.entityId === id)

          if (this.activeRequestId === id) {
            const { useRequestStore } = await import('./requestStore')
            useRequestStore().clearRequest()
          }

          if (hadRequestTab) {
            await tabStore.closeTabByEntity('request', id, { skipFlush: true })
          } else if (this.activeRequestId === id) {
            // Must run against the pre-delete tree so sibling lookup still sees the deleted node
            this.selectNextRequestOrClear(id)
          }
          await this.loadTree()
        } else {
          const { useUiStore } = await import('./uiStore')
          useUiStore().showToast(result.error?.message || 'Không thể xóa request')
          // Item already removed outside the app: resync the sidebar
          if (result.error?.code === 'NOT_FOUND') await this.loadTree()
        }
      } catch (err) {
        const { useUiStore } = await import('./uiStore')
        useUiStore().showToast(String(err))
      }
    },
    async deleteFolder(id: string) {
      // Capture before the call: is the active request inside the folder being deleted?
      const folderNode = this.findNode(this.tree, id)
      const entitiesToClose: Array<{ type: TabEntityType; entityId: string }> = [
        { type: 'folder', entityId: id }
      ]
      const collectSubtree = (nodes?: TreeNode[]) => {
        if (!nodes) return
        for (const child of nodes) {
          entitiesToClose.push({
            type: child.type === 'folder' ? 'folder' : 'request',
            entityId: child.id
          })
          if (child.children) {
            collectSubtree(child.children)
          }
        }
      }
      if (folderNode?.children) {
        collectSubtree(folderNode.children)
      }

      const activeInside = !!this.activeRequestId &&
        !!folderNode?.children &&
        !!this.findNode(folderNode.children, this.activeRequestId)
      const activeFolderInside = !!this.activeFolderId && 
        (this.activeFolderId === id || !!this.findNode(folderNode?.children || [], this.activeFolderId))

      if (activeInside) {
        const { useRequestStore } = await import('./requestStore')
        useRequestStore().cancelAutoSave()
      }

      try {
        const result = await DeleteFolder(id)
        if (result.success) {
          const { useUiStore } = await import('./uiStore')
          useUiStore().showToast('Đã xóa')
          
          for (const ent of entitiesToClose) {
            if (ent.type === 'folder') {
              this.expandedFolders.delete(ent.entityId)
            }
          }
          
          const tabStore = useTabStore()
          const hadMatchingTabs = tabStore.tabs.some(t =>
            entitiesToClose.some(e => e.type === t.type && e.entityId === t.entityId)
          )

          // Pre-delete tree is still in place: pick next/previous request at the folder's level
          const stillActiveInside = !!this.activeRequestId &&
            !!folderNode?.children &&
            !!this.findNode(folderNode.children, this.activeRequestId)
          if (stillActiveInside) {
            const { useRequestStore } = await import('./requestStore')
            useRequestStore().clearRequest()
          }

          if (activeFolderInside) {
            tabStore.registerFolderFlush(null)
            this.activeFolderId = null
          }

          if (!hadMatchingTabs) {
            if (stillActiveInside) {
              this.selectNextRequestOrClear(id)
            }
            await this.loadTree()
          } else {
            await this.loadTree()
            await tabStore.closeTabsByEntities(entitiesToClose)
          }
        } else {
          const { useUiStore } = await import('./uiStore')
          useUiStore().showToast(result.error?.message || 'Không thể xóa thư mục')
          if (result.error?.code === 'NOT_FOUND') await this.loadTree()
        }
      } catch (err) {
        const { useUiStore } = await import('./uiStore')
        useUiStore().showToast(String(err))
      }
    },
    async duplicateRequest(id: string) {
      if (this.activeRequestId === id) {
        const { useRequestStore } = await import('./requestStore')
        const reqStore = useRequestStore()
        if (reqStore.isDirty || reqStore.autoSaveTimer) {
          await reqStore.flush()
        }
      }
      try {
        const result = await DuplicateRequest(id)
        if (result.success && result.data) {
          await this.loadTree()
          void this.selectRequest(result.data.id)
        } else {
          const { useUiStore } = await import('./uiStore')
          useUiStore().showToast(result.error?.message || 'Không thể sao chép request')
          if (result.error?.code === 'NOT_FOUND') await this.loadTree()
        }
      } catch (err) {
        const { useUiStore } = await import('./uiStore')
        useUiStore().showToast(String(err))
      }
    },
    async moveRequest(id: string, targetFolderId: string) {
      try {
        const result = await MoveRequest(id, targetFolderId)
        if (result.success) {
          const { useUiStore } = await import('./uiStore')
          useUiStore().showToast('Đã di chuyển')
          
          await this.loadTree()
          
          if (targetFolderId) {
             const path = this.findFolderPath(this.tree, targetFolderId)
             if (path) {
                path.forEach(node => this.expandedFolders.add(node.id))
             }
          }
        } else {
          const { useUiStore } = await import('./uiStore')
          useUiStore().showToast(result.error?.message || 'Không thể di chuyển request')
          if (result.error?.code === 'NOT_FOUND') await this.loadTree()
        }
      } catch (err) {
        const { useUiStore } = await import('./uiStore')
        useUiStore().showToast(String(err))
      }
    },
    async importPostman() {
      try {
        const filePath = await SelectPostmanFile()
        if (!filePath) return // user canceled

        const { useUiStore } = await import('./uiStore')
        const uiStore = useUiStore()

        this.loading = true
        this.importProgress = "Đang chuẩn bị import..."
        
        // Listen to import progress
        const off = EventsOn("import:progress", (data: any) => {
          if (data && data.text) {
             this.importProgress = `${data.text} (${data.count}/${data.total})`
          }
        })

        try {
          const result = await ImportPostman(filePath)

          if (result.success) {
            const count = result.data?.count || 0
            uiStore.showToast(`Đã import thành công ${count} mục`)
            await this.loadTree()
            
            const firstRequestId = result.data?.firstRequestId
            if (firstRequestId) {
              const path = this.findFolderPath(this.tree, firstRequestId)
              if (path) {
                 path.forEach(node => this.expandedFolders.add(node.id))
              }
              void this.selectRequest(firstRequestId)
            }
          } else {
            uiStore.showImportError(result.error?.message || 'Không thể import Postman collection')
          }
        } finally {
          off()
          this.loading = false
          this.importProgress = null
        }
      } catch (err) {
        const { useUiStore } = await import('./uiStore')
        useUiStore().showImportError(String(err))
        this.loading = false
        this.importProgress = null
      }
    },

    findNode(nodes: TreeNode[], id: string): TreeNode | null {
      for (const node of nodes) {
        if (node.id === id) return node
        if (node.children) {
          const found = this.findNode(node.children, id)
          if (found) return found
        }
      }
      return null
    },
    selectNextRequestOrClear(deletedId: string) {
      const siblings = this.findParentArray(this.tree, deletedId) ?? []
      const index = siblings.findIndex(n => n.id === deletedId)
      const after = index === -1 ? [] : siblings.slice(index + 1)
      const before = index === -1 ? [] : siblings.slice(0, index).reverse()
      // Next sibling request first, then the closest previous one
      const next = [...after, ...before].find(n => n.type === 'request')

      if (next) {
        void this.selectRequest(next.id, { force: true })
        return
      }

      this.activeRequestId = null
      void import('./requestStore').then(({ useRequestStore }) => {
        useRequestStore().clearRequest()
      })
    },
    findParentArray(nodes: TreeNode[], id: string): TreeNode[] | null {
      for (const node of nodes) {
        if (node.id === id) return nodes
        if (node.children) {
          const found = this.findParentArray(node.children, id)
          if (found) return found
        }
      }
      return null
    },
    findFolderPath(nodes: TreeNode[], targetId: string, currentPath: TreeNode[] = []): TreeNode[] | null {
      for (const node of nodes) {
        if (node.id === targetId) return [...currentPath, node]
        if (node.children) {
          const found = this.findFolderPath(node.children, targetId, [...currentPath, node])
          if (found) return found
        }
      }
      return null
    },
    async fetchGitStatus(collectionId?: string): Promise<model.GitSyncStatus | null> {
      const targetId = collectionId || this.activeCollectionId || 'default'
      try {
        const res = await GetCollectionGitStatus(targetId)
        if (res.success && res.data) {
          this.gitSyncStatus = res.data as model.GitSyncStatus
          if (!this.gitSyncStatus.has_conflicts) {
            this.gitConflictError = null
          }
          return this.gitSyncStatus
        }
      } catch {
        // Ignore status fetch error
      }
      return null
    },
    async saveGitRemote(remoteUrl: string, collectionId?: string): Promise<boolean> {
      const targetId = collectionId || this.activeCollectionId || 'default'
      this.gitSyncLoading = true
      try {
        const res = await SaveCollectionGitRemote(targetId, remoteUrl.trim())
        const { useUiStore } = await import('./uiStore')
        const uiStore = useUiStore()
        if (res.success) {
          this.gitSyncStatus = (res.data as model.GitSyncStatus) || null
          await this.loadCollections()
          uiStore.showToast('Đã lưu cấu hình Git Remote')
          return true
        } else {
          uiStore.showToast(res.error?.message || 'Không thể lưu cấu hình Git Remote')
          return false
        }
      } catch (err) {
        const { useUiStore } = await import('./uiStore')
        useUiStore().showToast(String(err))
        return false
      } finally {
        this.gitSyncLoading = false
      }
    },
    async flushDirtyBeforeGitSync(): Promise<boolean> {
      const { useRequestStore } = await import('./requestStore')
      const reqStore = useRequestStore()
      const saved = await reqStore.flush()
      if (!saved) return false
      const tabStore = useTabStore()
      const folderSaved = await tabStore.flushActiveFolderIfNeeded()
      if (!folderSaved) return false
      return true
    },
    async gitPull(collectionId?: string): Promise<boolean> {
      const targetId = collectionId || this.activeCollectionId || 'default'
      const { useUiStore } = await import('./uiStore')
      const uiStore = useUiStore()
      const coll = this.collections.find(c => c.id === targetId) || this.activeCollection
      if (!coll?.git_remote_url && !this.gitSyncStatus?.remote_url) {
        uiStore.gitSyncModalOpen = true
        uiStore.showToast('Vui lòng cấu hình Git Remote URL trước khi Pull')
        return false
      }

      if (!(await this.flushDirtyBeforeGitSync())) {
        return false
      }

      this.gitSyncLoading = true
      this.gitConflictError = null
      try {
        const res = await GitPullCollection(targetId)
        if (res.success) {
          this.gitSyncStatus = (res.data as model.GitSyncStatus) || null
          const { useEnvironmentStore } = await import('./environmentStore')
          const envStore = useEnvironmentStore()
          await Promise.all([this.loadTree(), envStore.refresh(), this.loadCollections()])
          if (this.activeRequestId) {
            const { useRequestStore } = await import('./requestStore')
            if (this.findNode(this.tree, this.activeRequestId)) {
              await useRequestStore().loadRequest(this.activeRequestId)
            } else {
              this.activeRequestId = null
              useRequestStore().clearRequest()
            }
          }
          uiStore.showToast('Git Pull thành công')
          return true
        } else {
          const statusData = res.data as model.GitSyncStatus | undefined
          if (statusData) {
            this.gitSyncStatus = statusData
          }
          if (res.error?.code === 'GIT_CONFLICT') {
            this.gitConflictError = {
              message: res.error.message,
              files: statusData?.conflict_files || []
            }
            uiStore.gitSyncModalOpen = true
            if (statusData?.conflicts && statusData.conflicts.length > 0) {
              uiStore.gitConflictModalOpen = true
            }
          }
          uiStore.showToast(res.error?.message || 'Lỗi khi thực thi Git Pull')
          return false
        }
      } catch (err) {
        uiStore.showToast(String(err))
        return false
      } finally {
        this.gitSyncLoading = false
      }
    },
    async fetchLocalBranches(collectionId?: string): Promise<string[]> {
      const targetId = collectionId || this.activeCollectionId || 'default'
      try {
        if (typeof GitListLocalBranches === 'function') {
          const res = await GitListLocalBranches(targetId)
          if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
            this.gitBranches = res.data as string[]
            return this.gitBranches
          }
        }
      } catch {
        // Ignore branch list fetch error
      }
      const fallback = this.gitSyncStatus?.branch || 'main'
      this.gitBranches = [fallback]
      return this.gitBranches
    },
    async gitClearAndPull(remoteUrl: string, collectionId?: string): Promise<boolean> {
      const targetId = collectionId || this.activeCollectionId || 'default'
      const { useUiStore } = await import('./uiStore')
      const uiStore = useUiStore()
      this.gitSyncLoading = true
      this.gitConflictError = null
      try {
        const saveRes = await SaveCollectionGitRemote(targetId, remoteUrl.trim())
        if (!saveRes.success) {
          uiStore.showToast(saveRes.error?.message || 'Không thể lưu cấu hình Git Remote')
          return false
        }
        const res = await GitClearAndPullCollection(targetId)
        if (res.success) {
          this.gitSyncStatus = (res.data as model.GitSyncStatus) || null
          const { useEnvironmentStore } = await import('./environmentStore')
          const envStore = useEnvironmentStore()
          await Promise.all([this.loadTree(), envStore.refresh(), this.loadCollections(), this.fetchLocalBranches(targetId)])
          if (this.activeRequestId) {
            const { useRequestStore } = await import('./requestStore')
            if (this.findNode(this.tree, this.activeRequestId)) {
              await useRequestStore().loadRequest(this.activeRequestId)
            } else {
              this.activeRequestId = null
              useRequestStore().clearRequest()
            }
          }
          uiStore.showToast('Đã xóa dữ liệu local và đồng bộ từ Remote')
          return true
        } else {
          if (res.data) {
            this.gitSyncStatus = res.data as model.GitSyncStatus
          }
          if (res.error?.code === 'GIT_CONFLICT') {
            this.gitConflictError = {
              message: res.error.message,
              files: (res.data as model.GitSyncStatus | undefined)?.conflict_files || []
            }
            uiStore.gitSyncModalOpen = true
          }
          uiStore.showToast(res.error?.message || 'Lỗi khi thực thi Clear & Pull')
          return false
        }
      } catch (err) {
        uiStore.showToast(String(err))
        return false
      } finally {
        this.gitSyncLoading = false
      }
    },
    async gitStashAndPull(remoteUrl: string, collectionId?: string): Promise<boolean> {
      const targetId = collectionId || this.activeCollectionId || 'default'
      const { useUiStore } = await import('./uiStore')
      const uiStore = useUiStore()

      if (!(await this.flushDirtyBeforeGitSync())) {
        return false
      }

      this.gitSyncLoading = true
      this.gitConflictError = null
      try {
        const saveRes = await SaveCollectionGitRemote(targetId, remoteUrl.trim())
        if (!saveRes.success) {
          uiStore.showToast(saveRes.error?.message || 'Không thể lưu cấu hình Git Remote')
          return false
        }
        const res = await GitStashAndPullCollection(targetId)
        if (res.success) {
          this.gitSyncStatus = (res.data as model.GitSyncStatus) || null
          const { useEnvironmentStore } = await import('./environmentStore')
          const envStore = useEnvironmentStore()
          await Promise.all([this.loadTree(), envStore.refresh(), this.loadCollections(), this.fetchLocalBranches(targetId)])
          if (this.activeRequestId) {
            const { useRequestStore } = await import('./requestStore')
            if (this.findNode(this.tree, this.activeRequestId)) {
              await useRequestStore().loadRequest(this.activeRequestId)
            } else {
              this.activeRequestId = null
              useRequestStore().clearRequest()
            }
          }
          uiStore.showToast('Đã stash, pull và gộp thay đổi thành công')
          return true
        } else {
          const statusData = res.data as model.GitSyncStatus | undefined
          if (statusData) {
            this.gitSyncStatus = statusData
          }
          if (res.error?.code === 'GIT_CONFLICT') {
            this.gitConflictError = {
              message: res.error.message,
              files: statusData?.conflict_files || []
            }
            uiStore.gitSyncModalOpen = true
            if (statusData?.conflicts && statusData.conflicts.length > 0) {
              uiStore.gitConflictModalOpen = true
            }
          }
          uiStore.showToast(res.error?.message || 'Lỗi khi thực thi Stash & Pull')
          return false
        }
      } catch (err) {
        uiStore.showToast(String(err))
        return false
      } finally {
        this.gitSyncLoading = false
      }
    },
    async gitPush(branch?: string, collectionId?: string): Promise<boolean> {
      let targetBranch = branch?.trim() || ''
      let targetId = collectionId || this.activeCollectionId || 'default'
      // Backward compatibility if single argument is a collection ID rather than a branch name
      if (
        !collectionId &&
        branch &&
        !this.gitBranches.includes(branch) &&
        branch !== this.gitSyncStatus?.branch &&
        this.collections.some(c => c.id === branch)
      ) {
        targetId = branch
        targetBranch = ''
      }
      const { useUiStore } = await import('./uiStore')
      const uiStore = useUiStore()
      const coll = this.collections.find(c => c.id === targetId) || this.activeCollection
      if (!coll?.git_remote_url && !this.gitSyncStatus?.remote_url) {
        uiStore.gitSyncModalOpen = true
        uiStore.showToast('Vui lòng cấu hình Git Remote URL trước khi Push')
        return false
      }

      if (!(await this.flushDirtyBeforeGitSync())) {
        return false
      }

      this.gitSyncLoading = true
      try {
        const res = targetBranch && typeof GitPushCollectionToBranch === 'function'
          ? await GitPushCollectionToBranch(targetId, targetBranch)
          : await GitPushCollection(targetId)
        if (res.success) {
          this.gitSyncStatus = (res.data as model.GitSyncStatus) || null
          if (targetId === this.activeCollectionId) {
            const { useEnvironmentStore } = await import('./environmentStore')
            const envStore = useEnvironmentStore()
            await Promise.all([this.loadTree(), envStore.refresh(), this.loadCollections()])
            if (this.activeRequestId) {
              const { useRequestStore } = await import('./requestStore')
              if (this.findNode(this.tree, this.activeRequestId)) {
                await useRequestStore().loadRequest(this.activeRequestId)
              } else {
                this.activeRequestId = null
                useRequestStore().clearRequest()
              }
            }
          }
          uiStore.showToast('Git Push thành công')
          return true
        } else {
          const statusData = res.data as model.GitSyncStatus | undefined
          if (statusData) {
            this.gitSyncStatus = statusData
          }
          if (res.error?.code === 'GIT_CONFLICT') {
            this.gitConflictError = {
              message: res.error.message,
              files: statusData?.conflict_files || []
            }
            uiStore.gitSyncModalOpen = true
            if (statusData?.conflicts && statusData.conflicts.length > 0) {
              uiStore.gitConflictModalOpen = true
            }
          }
          uiStore.showToast(res.error?.message || 'Lỗi khi thực thi Git Push')
          return false
        }
      } catch (err) {
        uiStore.showToast(String(err))
        return false
      } finally {
        this.gitSyncLoading = false
      }
    },
    async resolveGitConflicts(resolvedFiles: Record<string, any>, collectionId?: string): Promise<boolean> {
      const targetId = collectionId || this.activeCollectionId || 'default'
      const { useUiStore } = await import('./uiStore')
      const uiStore = useUiStore()
      this.gitSyncLoading = true
      try {
        const res = await ResolveGitConflict(targetId, resolvedFiles)
        if (res.success) {
          this.gitSyncStatus = (res.data as model.GitSyncStatus) || null
          this.gitConflictError = null
          uiStore.gitConflictModalOpen = false
          const { useEnvironmentStore } = await import('./environmentStore')
          const envStore = useEnvironmentStore()
          await Promise.all([this.loadTree(), envStore.refresh(), this.loadCollections()])
          if (this.activeRequestId) {
            const { useRequestStore } = await import('./requestStore')
            if (this.findNode(this.tree, this.activeRequestId)) {
              await useRequestStore().loadRequest(this.activeRequestId)
            } else {
              this.activeRequestId = null
              useRequestStore().clearRequest()
            }
          }
          uiStore.showToast('Đã giải quyết xung đột và hoàn tất đồng bộ Git')
          return true
        } else {
          const statusData = res.data as model.GitSyncStatus | undefined
          if (statusData) {
            this.gitSyncStatus = statusData
          }
          if (res.error?.code === 'GIT_CONFLICT') {
            this.gitConflictError = {
              message: res.error.message,
              files: statusData?.conflict_files || []
            }
          }
          uiStore.showToast(res.error?.message || 'Không thể giải quyết xung đột Git')
          return false
        }
      } catch (err) {
        uiStore.showToast(String(err))
        return false
      } finally {
        this.gitSyncLoading = false
      }
    },
    async abortGitMerge(collectionId?: string): Promise<boolean> {
      const targetId = collectionId || this.activeCollectionId || 'default'
      const { useUiStore } = await import('./uiStore')
      const uiStore = useUiStore()
      this.gitSyncLoading = true
      try {
        const res = await AbortGitMerge(targetId)
        if (res.success) {
          this.gitSyncStatus = (res.data as model.GitSyncStatus) || null
          this.gitConflictError = null
          uiStore.gitConflictModalOpen = false
          const { useEnvironmentStore } = await import('./environmentStore')
          const envStore = useEnvironmentStore()
          await Promise.all([this.loadTree(), envStore.refresh(), this.loadCollections()])
          if (this.activeRequestId) {
            const { useRequestStore } = await import('./requestStore')
            if (this.findNode(this.tree, this.activeRequestId)) {
              await useRequestStore().loadRequest(this.activeRequestId)
            } else {
              this.activeRequestId = null
              useRequestStore().clearRequest()
            }
          }
          uiStore.showToast('Đã huỷ merge và khôi phục trạng thái trước đó')
          return true
        } else {
          const statusData = res.data as model.GitSyncStatus | undefined
          if (statusData) {
            this.gitSyncStatus = statusData
          }
          if (res.error?.code === 'GIT_CONFLICT') {
            this.gitConflictError = {
              message: res.error.message,
              files: statusData?.conflict_files || []
            }
          }
          uiStore.showToast(res.error?.message || 'Không thể huỷ merge Git')
          return false
        }
      } catch (err) {
        uiStore.showToast(String(err))
        return false
      } finally {
        this.gitSyncLoading = false
      }
    }
  }
})
