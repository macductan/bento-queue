import { defineStore } from 'pinia'
import { GetRequest, SaveRequest } from '../../wailsjs/go/main/App'

export interface KVPair {
  key: string
  value: string
  enabled: boolean
  _isAuto?: boolean
}

import type { AuthConfig } from './collectionStore'
import { useTabStore } from './tabStore'

export type BodyType = 'none' | 'json' | 'text' | 'xml' | 'urlencoded' | 'formdata'

export const AUTO_CONTENT_TYPES: Record<string, string> = {
  json: 'application/json',
  xml: 'application/xml',
  urlencoded: 'application/x-www-form-urlencoded',
  formdata: 'multipart/form-data'
}

export interface Body {
  type: string
  content: string
  form_data?: KVPair[]
  urlencoded?: KVPair[]
}

export interface Scripts {
  pre_request?: string
  post_response?: string
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
  auth_envs?: Record<string, AuthConfig>
  scripts?: Scripts
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

import {
  parseUrl,
  updateUrlWithParams,
  reconcileParamsFromUrl,
  areParamsEqual
} from '../utils/urlParams'

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

function normalizeLoadedRequest(req: Request): void {
  if (!req.auth) {
    req.auth = { type: 'inherit' }
  }
  if (!Array.isArray(req.headers)) {
    req.headers = []
  }
  if (!Array.isArray(req.params)) {
    req.params = []
  }
  const currentUrl = req.url || ''
  const { params: parsedFromUrl } = parseUrl(currentUrl)
  if (parsedFromUrl.length > 0) {
    const reconciled = reconcileParamsFromUrl(currentUrl, req.params)
    if (!areParamsEqual(req.params, reconciled)) {
      req.params = reconciled
    }
  } else {
    const enabledParams = req.params.filter(p => p && p.enabled && typeof p.key === 'string' && p.key.trim() !== '')
    if (enabledParams.length > 0) {
      const updatedUrl = updateUrlWithParams(currentUrl, req.params)
      if (updatedUrl !== currentUrl) {
        req.url = updatedUrl
      }
    }
  }
  const expectedAutoCt = req.body?.type
    ? AUTO_CONTENT_TYPES[req.body.type]
    : undefined
  if (expectedAutoCt && req.headers) {
    const h = req.headers.find(
      item => item && typeof item.key === 'string' &&
      item.key.trim().toLowerCase() === 'content-type' &&
      item.value.trim().toLowerCase() === expectedAutoCt
    )
    if (h) {
      h._isAuto = true
    }
  }
}

let loadReqSeq = 0

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
      if (state.original.id !== state.current.id) return false
      return stringifySorted(state.original) !== stringifySorted(state.current)
    }
  },
  actions: {
    async loadRequest(id: string) {
      this.cancelAutoSave()
      const mySeq = ++loadReqSeq
      this.loading = true
      this.error = null
      try {
        const result = await GetRequest(id)
        if (mySeq !== loadReqSeq) return
        if (result.success && result.data) {
          const loaded = JSON.parse(JSON.stringify(result.data)) as Request
          normalizeLoadedRequest(loaded)
          this.contentTypeAuto = Boolean(loaded.headers?.some(h => h && h._isAuto))
          this.current = null
          this.original = loaded
          this.current = JSON.parse(JSON.stringify(this.original))
          this.saveStatus = 'saved'
          const tabStore = useTabStore()
          tabStore._ensureRequestStoreSync()
          if (this.current) {
            tabStore.updateTabMeta('request', this.current.id, {
              name: this.current.name,
              method: this.current.method
            })
            if (!this.isDirty) {
              tabStore.setTabDirty('request', this.current.id, false)
            } else {
              tabStore.setTabDirty('request', this.current.id, this.isDirty)
            }
          }
        } else {
          this.error = result.error?.message || 'Không thể tải request'
          this.original = null
          this.current = null
          this.contentTypeAuto = false
          this.saveStatus = 'saved'
          useTabStore().setTabDirty('request', id, false)
        }
      } catch (err) {
        if (mySeq !== loadReqSeq) return
        this.error = String(err)
        this.original = null
        this.current = null
        this.contentTypeAuto = false
        this.saveStatus = 'saved'
        useTabStore().setTabDirty('request', id, false)
      } finally {
        if (mySeq === loadReqSeq) {
          this.loading = false
        }
      }
    },
    clearRequest() {
      ++loadReqSeq
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
      const tabStore = useTabStore()
      tabStore._ensureRequestStoreSync()
      if (this.current) {
        tabStore.setTabDirty('request', this.current.id, this.isDirty)
      }
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
        const saveSeq = loadReqSeq
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
            const tabStore = useTabStore()
            if (saveSeq === loadReqSeq && this.current && this.current.id === toSave.id) {
              if (stringifySorted(this.current) === stringifySorted(toSave)) {
                this.original = JSON.parse(JSON.stringify(this.current))
                this.saveStatus = 'saved'
              } else {
                this.original = JSON.parse(JSON.stringify(toSave))
                this.saveStatus = 'unsaved'
              }
              tabStore.updateTabMeta('request', this.current.id, {
                name: this.current.name,
                method: this.current.method
              })
              tabStore.setTabDirty('request', this.current.id, this.isDirty)
            } else if (toSave?.id) {
              tabStore.setTabDirty('request', toSave.id, false)
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
            if (saveSeq === loadReqSeq && this.current && this.current.id === toSave?.id) {
              this.error = errorMsg
              this.saveStatus = 'error'
            }
            const { useUiStore } = await import('./uiStore')
            useUiStore().showToast(errorMsg)
            return false
          }
        } catch (err) {
          const errorMsg = String(err)
          if (saveSeq === loadReqSeq && this.current && this.current.id === toSave?.id) {
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
    setBodyType(type: BodyType) {
      if (!this.current) return
      if (!this.current.body) {
        this.current.body = { type: 'none', content: '' }
      }
      if (type === 'urlencoded' && !Array.isArray(this.current.body.urlencoded)) {
        this.current.body.urlencoded = []
      }
      if (type === 'formdata' && !Array.isArray(this.current.body.form_data)) {
        this.current.body.form_data = []
      }
      
      const hs = this.current.headers || []
      if (!this.current.headers) this.current.headers = hs

      const targetCt = AUTO_CONTENT_TYPES[type]

      if (this.contentTypeAuto || hs.some(h => h._isAuto)) {
        const autoIndex = hs.findIndex(h => h._isAuto)
        if (autoIndex >= 0) {
          hs.splice(autoIndex, 1)
        }
        this.contentTypeAuto = false
      }

      if (targetCt) {
        const hasContentType = hs.some(h => h.key.trim().toLowerCase() === 'content-type')
        if (!hasContentType) {
          hs.unshift({
            key: 'Content-Type',
            value: targetCt,
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
