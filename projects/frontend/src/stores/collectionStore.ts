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
  DeleteCollection,
  DuplicateCollection
} from '../../wailsjs/go/main/App'

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
  children?: TreeNode[]
  variables?: { key: string; value: string; enabled: boolean }[]
  headers?: { key: string; value: string; enabled: boolean }[]
  auth?: AuthConfig
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
  activeCollectionSlug: string | null
  collectionsLoading: boolean
  switching: boolean
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
    activeCollectionSlug: null,
    collectionsLoading: false,
    switching: false
  }),
  getters: {
    activeCollection(state): model.Collection | null {
      if (!state.activeCollectionSlug) return null
      return state.collections.find(c => c.slug === state.activeCollectionSlug) || null
    },
    isDefaultActive(state): boolean {
      if (!state.activeCollectionSlug) return true
      return state.activeCollectionSlug === 'default' || state.collections.find(c => c.slug === state.activeCollectionSlug)?.is_default === true
    }
  },
  actions: {
    async refresh() {
      this.tree = []
      this.activeRequestId = null
      this.activeFolderId = null
      const { useRequestStore } = await import('./requestStore')
      useRequestStore().clearRequest()
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
            this.activeCollectionSlug = active.slug
          } else if (!this.activeCollectionSlug || !list.some(c => c.slug === this.activeCollectionSlug)) {
            this.activeCollectionSlug = 'default'
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
    async switchCollection(targetSlug: string, opts?: { force?: boolean }): Promise<boolean> {
      if (this.switching) return false
      if (targetSlug === this.activeCollectionSlug) return true

      this.switching = true
      try {
        const { useRequestStore } = await import('./requestStore')
        const reqStore = useRequestStore()
        const { useUiStore } = await import('./uiStore')
        const uiStore = useUiStore()

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

        const result = await SwitchCollection(targetSlug)
        if (result.success) {
          this.activeCollectionSlug = targetSlug
          reqStore.clearRequest()
          const { useResponseStore } = await import('./responseStore')
          const resStore = useResponseStore()
          resStore.clear()
          this.activeRequestId = null
          this.activeFolderId = null
          this.expandedFolders.clear()
          uiStore.closeContextMenu()
          const { useEnvironmentStore } = await import('./environmentStore')
          const envStore = useEnvironmentStore()
          await Promise.all([this.loadTree(), envStore.refresh(), this.loadCollections()])
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
    async renameCollection(slug: string, name: string): Promise<boolean> {
      const { useUiStore } = await import('./uiStore')
      const uiStore = useUiStore()

      if (!name || !name.trim()) {
        uiStore.showToast('Tên không được để trống')
        return false
      }

      try {
        const result = await RenameCollection(slug, name.trim())
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
    async deleteCollection(slug: string): Promise<boolean> {
      const { useUiStore } = await import('./uiStore')
      const uiStore = useUiStore()

      if (slug === 'default') {
        uiStore.showToast('Không thể xóa collection mặc định')
        return false
      }

      // Abort/clear in-flight HTTP request before calling DeleteCollection
      const { useResponseStore } = await import('./responseStore')
      const resStore = useResponseStore()
      resStore.clear()

      try {
        const result = await DeleteCollection(slug)
        if (result.success) {
          uiStore.showToast('Đã xóa collection')
          const isActive = slug === this.activeCollectionSlug || Boolean((result.data as any)?.active_collection)
          if (isActive) {
            this.activeCollectionSlug = 'default'
            const { useRequestStore } = await import('./requestStore')
            useRequestStore().clearRequest()
            this.activeRequestId = null
            this.activeFolderId = null
            this.expandedFolders.clear()
            const { useEnvironmentStore } = await import('./environmentStore')
            const envStore = useEnvironmentStore()
            await Promise.all([this.loadTree(), envStore.refresh(), this.loadCollections()])
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
    async duplicateCollection(slug: string): Promise<boolean> {
      const { useUiStore } = await import('./uiStore')
      const uiStore = useUiStore()
      try {
        const result = await DuplicateCollection(slug)
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
      if (this.activeRequestId === id) return
      
      const { useRequestStore } = await import('./requestStore')
      const reqStore = useRequestStore()
      const { useUiStore } = await import('./uiStore')
      const uiStore = useUiStore()

      if (!opts?.force && reqStore.isDirty) {
        const choice = await uiStore.requestUnsavedPrompt()
        if (choice === 'cancel') return
        if (choice === 'save') {
          await reqStore.saveCurrent()
          if (reqStore.error) return // abort if save failed
        }
      }
      
      this.activeRequestId = id
      this.activeFolderId = null
      
      await reqStore.loadRequest(id)
      
      // Guard: if the user clicked a different request while this was in flight, discard result
      if (this.activeRequestId !== id) return
      
      if (reqStore.error) {
        this.activeRequestId = null
        uiStore.showToast(reqStore.error)
      }
    },
    async setActiveFolderId(id: string) {
      if (this.activeFolderId === id) return
      const { useUiStore } = await import('./uiStore')
      const uiStore = useUiStore()
      const { useRequestStore } = await import('./requestStore')
      const reqStore = useRequestStore()
      if (reqStore.isDirty) {
        const choice = await uiStore.requestUnsavedPrompt()
        if (choice === 'cancel') return
        if (choice === 'save') {
          await reqStore.saveCurrent()
          if (reqStore.error) return // abort if save failed
        }
      }
      this.activeFolderId = id
      this.activeRequestId = null
      void import('./requestStore').then(({ useRequestStore }) => {
        useRequestStore().clearRequest()
      })
    },
    async createRequest(parentId: string = "") {
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
          if (this.activeRequestId === id) {
            const { useRequestStore } = await import('./requestStore')
            const reqStore = useRequestStore()
            if (reqStore.current && reqStore.original) {
              reqStore.current.name = name
              reqStore.original.name = name
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
      try {
        const result = await DeleteRequest(id)
        if (result.success) {
          const { useUiStore } = await import('./uiStore')
          useUiStore().showToast('Đã xóa')
          
          // Must run against the pre-delete tree so sibling lookup still sees the deleted node
          if (this.activeRequestId === id) {
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
      const activeInside = !!this.activeRequestId &&
        !!folderNode?.children &&
        !!this.findNode(folderNode.children, this.activeRequestId)
      const activeFolderInside = !!this.activeFolderId && 
        (this.activeFolderId === id || !!this.findNode(folderNode?.children || [], this.activeFolderId))

      try {
        const result = await DeleteFolder(id)
        if (result.success) {
          const { useUiStore } = await import('./uiStore')
          useUiStore().showToast('Đã xóa')
          
          this.expandedFolders.delete(id)
          
          // Pre-delete tree is still in place: pick next/previous request at the folder's level
          if (activeInside) {
            this.selectNextRequestOrClear(id)
          }
          if (activeFolderInside) {
            this.activeFolderId = null
          }
          await this.loadTree()
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
    }
  }
})
