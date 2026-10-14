import { defineStore } from 'pinia'
import { GetRequest, SaveRequest } from '../../wailsjs/go/main/App'

export interface KVPair {
  key: string
  value: string
  enabled: boolean
  _isAuto?: boolean
}

import type { AuthConfig } from './collectionStore'

export interface Body {
  type: string
  content: string
}

export interface Request {
  id: string
  name: string
  method: string
  url: string
  headers: KVPair[]
  params: KVPair[]
  body: Body
  auth?: AuthConfig
  created_at: string
  updated_at: string
}

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error'

interface RequestState {
  original: Request | null
  current: Request | null
  loading: boolean
  saving: boolean
  saveStatus: SaveStatus
  error: string | null
  contentTypeAuto: boolean
  autoSaveTimer: ReturnType<typeof setTimeout> | null
  activeSavePromise: Promise<boolean> | null
}

// Helper for deep equality on objects using sorted keys
function stringifySorted(obj: any): string {
  if (obj === null || obj === undefined) return String(obj)
  if (typeof obj !== 'object') return String(obj)
  if (Array.isArray(obj)) {
    const filtered = obj.filter((item: any) => !item || !(item._isAuto && item.enabled))
    return `[${filtered.map(stringifySorted).join(',')}]`
  }
  const keys = Object.keys(obj).sort()
  const sortedObj: Record<string, any> = {}
  for (const key of keys) {
    if (key === '_isAuto') continue
    sortedObj[key] = stringifySorted(obj[key])
  }
  return JSON.stringify(sortedObj)
}

export const useRequestStore = defineStore('request', {
  state: (): RequestState => ({
    original: null,
    current: null,
    loading: false,
    saving: false,
    saveStatus: 'saved',
    error: null,
    contentTypeAuto: false,
    autoSaveTimer: null,
    activeSavePromise: null
  }),
  getters: {
    isDirty(state): boolean {
      if (!state.original || !state.current) return false
      return stringifySorted(state.original) !== stringifySorted(state.current)
    }
  },
  actions: {
    async loadRequest(id: string) {
      this.cancelAutoSave()
      this.loading = true
      this.error = null
      this.saveStatus = 'saved'
      this.contentTypeAuto = false
      try {
        const result = await GetRequest(id)
        if (result.success && result.data) {
          this.original = result.data as Request
          if (!this.original.auth) {
            this.original.auth = { type: 'inherit' }
          }
          if (this.original?.body?.type === 'json' && this.original.headers) {
            const h = this.original.headers.find(
              item => item && typeof item.key === 'string' &&
              item.key.trim().toLowerCase() === 'content-type' &&
              item.value.trim().toLowerCase() === 'application/json'
            )
            if (h) {
              h._isAuto = true
              this.contentTypeAuto = true
            }
          }
          this.current = JSON.parse(JSON.stringify(this.original))
        } else {
          this.error = result.error?.message || 'Không thể tải request'
          this.original = null
          this.current = null
        }
      } catch (err) {
        this.error = String(err)
        this.original = null
        this.current = null
      } finally {
        this.loading = false
      }
    },
    clearRequest() {
      this.cancelAutoSave()
      this.original = null
      this.current = null
      this.loading = false
      this.saving = false
      this.saveStatus = 'saved'
      this.error = null
      this.contentTypeAuto = false
    },
    scheduleAutoSave(delay: number = 800) {
      this.cancelAutoSave()
      if (!this.current || !this.isDirty) {
        if (!this.isDirty && this.saveStatus !== 'saving') {
          this.saveStatus = 'saved'
        }
        return
      }
      if (this.saveStatus !== 'saving') {
        this.saveStatus = 'unsaved'
      }
      this.autoSaveTimer = setTimeout(async () => {
        this.autoSaveTimer = null
        if (this.current && this.isDirty) {
          await this.saveCurrent({ silent: true })
        }
      }, delay)
    },
    cancelAutoSave() {
      if (this.autoSaveTimer) {
        clearTimeout(this.autoSaveTimer)
        this.autoSaveTimer = null
      }
    },
    async flush(): Promise<boolean> {
      this.cancelAutoSave()
      if (this.activeSavePromise) {
        const prev = await this.activeSavePromise
        if (!this.current) return true
        if (!prev) return false
        if (!this.isDirty) {
          return prev
        }
      }
      if (!this.current || !this.isDirty) {
        return true
      }
      return await this.saveCurrent({ silent: true })
    },
    async saveCurrent(options?: { silent?: boolean }): Promise<boolean> {
      this.cancelAutoSave()

      if (this.activeSavePromise) {
        const prev = await this.activeSavePromise
        if (!this.current) return false
        if (!this.isDirty) {
          if (!options?.silent) {
            const { useUiStore } = await import('./uiStore')
            useUiStore().showToast('Đã lưu')
          }
          return prev
        }
      }

      if (!this.current) return false

      if (!this.isDirty) {
        if (!options?.silent) {
          const { useUiStore } = await import('./uiStore')
          useUiStore().showToast('Đã lưu')
        }
        return true
      }

      let savePromise: Promise<boolean> | null = null
      const exec = async (): Promise<boolean> => {
        this.saving = true
        this.saveStatus = 'saving'
        this.error = null
        let toSave: any = null
        try {
          toSave = JSON.parse(JSON.stringify(this.current))
          if (toSave.headers) {
            toSave.headers = toSave.headers
              .filter((h: any) => !(h._isAuto && h.enabled))
              .map(({ _isAuto, ...rest }: any) => rest)
          }
          const result = await SaveRequest(toSave as any)
          if (result.success) {
            if (this.current && this.current.id === toSave.id) {
              if (stringifySorted(this.current) === stringifySorted(toSave)) {
                this.original = JSON.parse(JSON.stringify(this.current))
                this.saveStatus = 'saved'
              } else {
                this.original = JSON.parse(JSON.stringify(toSave))
                this.saveStatus = 'unsaved'
              }
            }
            if (!options?.silent) {
              const { useUiStore } = await import('./uiStore')
              useUiStore().showToast('Đã lưu')
            }
            // Trigger tree reload in collectionStore
            const { useCollectionStore } = await import('./collectionStore')
            await useCollectionStore().loadTree()
            return true
          } else {
            const errorMsg = result.error?.message || 'Không thể lưu request'
            if (this.current && this.current.id === toSave?.id) {
              this.error = errorMsg
              this.saveStatus = 'error'
            }
            const { useUiStore } = await import('./uiStore')
            useUiStore().showToast(errorMsg)
            return false
          }
        } catch (err) {
          const errorMsg = String(err)
          if (this.current && this.current.id === toSave?.id) {
            this.error = errorMsg
            this.saveStatus = 'error'
          }
          const { useUiStore } = await import('./uiStore')
          useUiStore().showToast(errorMsg)
          return false
        } finally {
          this.saving = false
          if (this.activeSavePromise === savePromise) {
            this.activeSavePromise = null
          }
        }
      }

      savePromise = exec()
      this.activeSavePromise = savePromise
      return await savePromise
    },
    setBodyType(type: 'none' | 'json' | 'text') {
      if (!this.current) return
      if (!this.current.body) {
        this.current.body = { type: 'none', content: '' }
      }
      
      const hs = this.current.headers || []
      if (!this.current.headers) this.current.headers = hs
    
      if (type !== 'json' && this.contentTypeAuto) {
        const autoIndex = hs.findIndex(h => h._isAuto)
        if (autoIndex >= 0) {
          hs.splice(autoIndex, 1)
        }
        this.contentTypeAuto = false
      }
    
      if (type === 'json' && !this.contentTypeAuto) {
        const hasContentType = hs.some(h => h.key.trim().toLowerCase() === 'content-type')
        if (!hasContentType) {
          hs.unshift({
            key: 'Content-Type',
            value: 'application/json',
            enabled: true,
            _isAuto: true
          })
          this.contentTypeAuto = true
        }
      }
    
      this.current.body.type = type
    }
  }
})
