import { defineStore } from 'pinia'
import { watch } from 'vue'
import { useCollectionStore } from './collectionStore'
import { useRequestStore } from './requestStore'
import { useResponseStore, type ExecuteResponse } from './responseStore'

export type TabEntityType = 'request' | 'folder'

export interface TabItem {
  id: string              // Định danh duy nhất: `${type}:${entityId}`
  entityId: string        // UUID của Request hoặc Folder
  type: TabEntityType     // 'request' | 'folder'
  name: string            // Tên hiển thị trên tab
  method?: string         // HTTP Method (chỉ dành cho type === 'request', ví dụ 'GET', 'POST')
  isDirty: boolean        // Cờ báo hiệu có thay đổi chưa lưu (hiển thị chấm amber dot)
}

export interface CachedResponseState {
  response: ExecuteResponse | null
  error: { code: string; message: string } | null
  loading: boolean
  urlInvalid: boolean
}

export function makeTabId(type: TabEntityType, entityId: string): string {
  return `${type}:${entityId}`
}

type FolderFlushHandler = () => Promise<boolean>

const syncedRequestStores = new WeakSet<object>()

export const useTabStore = defineStore('tab', {
  state: () => ({
    tabs: [] as TabItem[],
    activeTabId: null as string | null,
    responseCache: {} as Record<string, CachedResponseState>,
    _folderFlushHandler: null as FolderFlushHandler | null,
    _closingTabIds: new Set<string>()
  }),
  getters: {
    activeTab(state): TabItem | null {
      if (!state.activeTabId) return null
      return state.tabs.find(t => t.id === state.activeTabId) || null
    }
  },
  actions: {
    _ensureRequestStoreSync() {
      const reqStore = useRequestStore()
      if (syncedRequestStores.has(reqStore)) return
      syncedRequestStores.add(reqStore)

      watch(
        () => {
          const cur = reqStore.current
          if (!cur || !cur.id) return null
          return [cur.id, cur.name, cur.method, reqStore.isDirty] as const
        },
        (snap) => {
          if (!snap) return
          const [id, name, method, isDirty] = snap
          const tab = this.tabs.find(t => t.type === 'request' && t.entityId === id)
          if (tab) {
            if (name !== undefined) tab.name = name
            if (method) tab.method = method
            tab.isDirty = isDirty
          }
        },
        { flush: 'sync' }
      )
    },

    openTab(payload: {
      entityId: string
      type: TabEntityType
      name: string
      method?: string
      isDirty?: boolean
    }): TabItem {
      this._ensureRequestStoreSync()
      const id = makeTabId(payload.type, payload.entityId)
      const existing = this.tabs.find(t => t.id === id)
      if (existing) {
        if (payload.name !== undefined && payload.name !== '') {
          existing.name = payload.name
        }
        if (payload.type === 'request' && payload.method !== undefined && payload.method !== '') {
          existing.method = payload.method
        }
        if (payload.isDirty !== undefined) {
          existing.isDirty = payload.isDirty
        }
        this.activeTabId = existing.id
        return existing
      }

      const newTab: TabItem = {
        id,
        entityId: payload.entityId,
        type: payload.type,
        name: payload.name,
        ...(payload.type === 'request' ? { method: payload.method || 'GET' } : {}),
        isDirty: payload.isDirty ?? false
      }
      this.tabs.push(newTab)
      this.activeTabId = newTab.id
      return newTab
    },

    async activateTab(tabId: string): Promise<boolean> {
      this._ensureRequestStoreSync()
      const tab = this.tabs.find(t => t.id === tabId)
      if (!tab) return false

      const colStore = useCollectionStore()
      if (tab.type === 'request') {
        if (this.activeTabId === tabId && colStore.activeRequestId === tab.entityId && !colStore.activeFolderId) {
          return true
        }
        await colStore.selectRequest(tab.entityId)
        return colStore.activeRequestId === tab.entityId
      } else {
        if (this.activeTabId === tabId && colStore.activeFolderId === tab.entityId && !colStore.activeRequestId) {
          return true
        }
        await colStore.setActiveFolderId(tab.entityId)
        return colStore.activeFolderId === tab.entityId && !colStore.activeRequestId
      }
    },

    async closeTab(tabId: string, opts?: { skipFlush?: boolean }): Promise<boolean> {
      this._ensureRequestStoreSync()
      if (this._closingTabIds.has(tabId)) return false
      const idx = this.tabs.findIndex(t => t.id === tabId)
      if (idx === -1) return false

      this._closingTabIds.add(tabId)
      try {
        const targetTab = this.tabs[idx]
        const wasActive = this.activeTabId === tabId
        const colStore = useCollectionStore()
        const reqStore = useRequestStore()
        const resStore = useResponseStore()

        if (wasActive && !opts?.skipFlush) {
          if (targetTab.type === 'request') {
            if (reqStore.isDirty) {
              const saved = await reqStore.flush()
              if (!saved) return false
            }
          } else if (targetTab.type === 'folder') {
            const saved = await this.flushActiveFolderIfNeeded()
            if (!saved) return false
          }
        }

        const currentIdx = this.tabs.findIndex(t => t.id === tabId)
        if (currentIdx === -1) return false

        this.tabs.splice(currentIdx, 1)
        if (targetTab.type === 'request') {
          delete this.responseCache[targetTab.entityId]
        }

        if (wasActive || this.activeTabId === tabId) {
          // Clear active entity pointers for the closed tab before activating adjacent tab
          if (targetTab.type === 'request' && colStore.activeRequestId === targetTab.entityId) {
            colStore.activeRequestId = null
            reqStore.clearRequest()
          } else if (targetTab.type === 'folder' && colStore.activeFolderId === targetTab.entityId) {
            colStore.activeFolderId = null
          }

          if (this.tabs.length > 0) {
            const nextIdx = Math.min(currentIdx, this.tabs.length - 1)
            const nextTab = this.tabs[nextIdx]
            this.activeTabId = nextTab.id
            if (nextTab.type === 'request') {
              await colStore.selectRequest(nextTab.entityId, { force: true })
            } else {
              if (targetTab.type === 'request') {
                resStore.resetDisplay()
              }
              await colStore.setActiveFolderId(nextTab.entityId, { force: true })
            }
          } else {
            this.activeTabId = null
            colStore.activeRequestId = null
            colStore.activeFolderId = null
            reqStore.clearRequest()
            resStore.clear()
          }
        }

        return true
      } finally {
        this._closingTabIds.delete(tabId)
      }
    },

    async closeTabByEntity(
      type: TabEntityType,
      entityId: string,
      opts?: { skipFlush?: boolean }
    ): Promise<boolean> {
      const id = makeTabId(type, entityId)
      return await this.closeTab(id, { skipFlush: opts?.skipFlush ?? true })
    },

    async closeTabsByEntities(
      entities: Array<{ type: TabEntityType; entityId: string } | string>
    ): Promise<void> {
      if (!entities || entities.length === 0) return

      const idsToClose = new Set<string>()
      const requestEntityIdsToClose = new Set<string>()

      for (const item of entities) {
        if (typeof item === 'string') {
          if (item.startsWith('request:') || item.startsWith('folder:')) {
            idsToClose.add(item)
            if (item.startsWith('request:')) {
              requestEntityIdsToClose.add(item.slice('request:'.length))
            }
          } else {
            idsToClose.add(makeTabId('request', item))
            idsToClose.add(makeTabId('folder', item))
            requestEntityIdsToClose.add(item)
          }
        } else if (item && item.entityId) {
          idsToClose.add(makeTabId(item.type, item.entityId))
          if (item.type === 'request') {
            requestEntityIdsToClose.add(item.entityId)
          }
        }
      }

      for (const reqId of requestEntityIdsToClose) {
        delete this.responseCache[reqId]
      }

      const activeWasClosed = Boolean(this.activeTabId && idsToClose.has(this.activeTabId))
      const oldActiveWasRequest = Boolean(this.activeTabId && this.activeTabId.startsWith('request:'))
      let survivingIndexCandidate = 0
      if (activeWasClosed && this.activeTabId) {
        const oldActiveIdx = this.tabs.findIndex(t => t.id === this.activeTabId)
        if (oldActiveIdx !== -1) {
          survivingIndexCandidate = this.tabs
            .slice(0, oldActiveIdx)
            .filter(t => !idsToClose.has(t.id)).length
        }
      }

      this.tabs = this.tabs.filter(t => !idsToClose.has(t.id))

      const colStore = useCollectionStore()
      const reqStore = useRequestStore()
      const resStore = useResponseStore()

      if (activeWasClosed) {
        colStore.activeRequestId = null
        colStore.activeFolderId = null

        if (this.tabs.length > 0) {
          const nextIdx = Math.min(survivingIndexCandidate, this.tabs.length - 1)
          const nextTab = this.tabs[nextIdx]
          this.activeTabId = nextTab.id
          if (nextTab.type === 'request') {
            await colStore.selectRequest(nextTab.entityId, { force: true })
          } else {
            if (oldActiveWasRequest) {
              resStore.resetDisplay()
            }
            await colStore.setActiveFolderId(nextTab.entityId, { force: true })
          }
        } else {
          this.activeTabId = null
          reqStore.clearRequest()
          resStore.clear()
        }
      }
    },

    updateTabMeta(
      type: TabEntityType,
      entityId: string,
      meta: { name?: string; method?: string }
    ) {
      const id = makeTabId(type, entityId)
      const tab = this.tabs.find(t => t.id === id)
      if (!tab) return
      if (meta.name !== undefined) {
        tab.name = meta.name
      }
      if (tab.type === 'request' && meta.method !== undefined) {
        tab.method = meta.method
      }
    },

    setTabDirty(type: TabEntityType, entityId: string, isDirty: boolean) {
      const id = makeTabId(type, entityId)
      const tab = this.tabs.find(t => t.id === id)
      if (tab) {
        tab.isDirty = isDirty
      }
    },

    saveResponseToCache(requestId: string) {
      if (!requestId) return
      const resStore = useResponseStore()
      this.responseCache[requestId] = {
        response: resStore.response ? JSON.parse(JSON.stringify(resStore.response)) : null,
        error: resStore.error ? { ...resStore.error } : null,
        loading: Boolean(resStore.loading),
        urlInvalid: Boolean(resStore.urlInvalid)
      }
    },

    restoreResponseFromCache(requestId: string) {
      const resStore = useResponseStore()
      const cached = requestId ? this.responseCache[requestId] : undefined
      if (cached) {
        resStore.response = cached.response ? JSON.parse(JSON.stringify(cached.response)) : null
        resStore.error = cached.error ? { ...cached.error } : null
        resStore.loading = Boolean(cached.loading)
        resStore.urlInvalid = Boolean(cached.urlInvalid)
      } else {
        resStore.resetDisplay()
      }
    },

    registerFolderFlush(
      fnOrFolderId: FolderFlushHandler | string | null,
      maybeFn?: FolderFlushHandler | null
    ) {
      if (typeof fnOrFolderId === 'function' || fnOrFolderId === null) {
        this._folderFlushHandler = fnOrFolderId
      } else if (typeof fnOrFolderId === 'string') {
        this._folderFlushHandler = maybeFn ?? null
      }
    },

    async flushActiveFolderIfNeeded(): Promise<boolean> {
      if (!this._folderFlushHandler) return true
      const colStore = useCollectionStore()
      const active = this.activeTab
      if (active?.type === 'folder' || colStore.activeFolderId) {
        return await this._folderFlushHandler()
      }
      return true
    },

    clearAllTabs() {
      this.tabs = []
      this.activeTabId = null
      this.responseCache = {}
      this._closingTabIds.clear()
      useResponseStore().clear()
    }
  }
})
