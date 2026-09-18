import { defineStore } from 'pinia'
import { GetRequest, SaveRequest } from '../../wailsjs/go/main/App'

export interface KVPair {
  key: string
  value: string
  enabled: boolean
  _isAuto?: boolean
}

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
  created_at: string
  updated_at: string
}

interface RequestState {
  original: Request | null
  current: Request | null
  loading: boolean
  saving: boolean
  error: string | null
  contentTypeAuto: boolean
}

// Helper for deep equality on objects using sorted keys
function stringifySorted(obj: any): string {
  if (obj === null || obj === undefined) return String(obj)
  if (typeof obj !== 'object') return String(obj)
  if (Array.isArray(obj)) return `[${obj.map(stringifySorted).join(',')}]`
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
    error: null,
    contentTypeAuto: false
  }),
  getters: {
    isDirty(state): boolean {
      if (!state.original || !state.current) return false
      return stringifySorted(state.original) !== stringifySorted(state.current)
    }
  },
  actions: {
    async loadRequest(id: string) {
      this.loading = true
      this.error = null
      this.contentTypeAuto = false
      try {
        const result = await GetRequest(id)
        if (result.success && result.data) {
          this.original = result.data as Request
          this.current = JSON.parse(JSON.stringify(this.original))
          
          if (this.current?.body?.type === 'json' && this.current.headers && this.current.headers.length > 0) {
            const h = this.current.headers[0]
            if (h.key.trim().toLowerCase() === 'content-type' && h.value.trim().toLowerCase() === 'application/json') {
              h._isAuto = true
              this.contentTypeAuto = true
            }
          }
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
      this.original = null
      this.current = null
      this.loading = false
      this.error = null
      this.contentTypeAuto = false
    },
    async saveCurrent() {
      if (!this.current || this.saving) return
      this.saving = true
      this.error = null
      try {
        const snapshot = JSON.parse(JSON.stringify(this.current))
        const result = await SaveRequest(this.current as any)
        if (result.success) {
          this.original = snapshot
          const { useUiStore } = await import('./uiStore')
          useUiStore().showToast('Đã lưu')
          // Trigger tree reload in collectionStore
          const { useCollectionStore } = await import('./collectionStore')
          await useCollectionStore().loadTree()
        } else {
          this.error = result.error?.message || 'Không thể lưu request'
          const { useUiStore } = await import('./uiStore')
          useUiStore().showToast(this.error)
        }
      } catch (err) {
        this.error = String(err)
        const { useUiStore } = await import('./uiStore')
        useUiStore().showToast(this.error)
      } finally {
        this.saving = false
      }
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
