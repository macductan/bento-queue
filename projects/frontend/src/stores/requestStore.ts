import { defineStore } from 'pinia'
import { GetRequest, SaveRequest } from '../../wailsjs/go/main/App'

export interface KVPair {
  key: string
  value: string
  enabled: boolean
  description?: string
  type?: string
  options?: string[]
  _isAuto?: boolean
}

import type { AuthConfig } from './collectionStore'
import { useTabStore } from './tabStore'
import { useUiStore } from './uiStore'
import {
  normalizeSyncFlags,
  cloneRequestToExample,
  duplicateExample as duplicateExampleSnapshot,
  resolveEffectiveRequest,
  applyProjectionEditsToExample,
  syncExampleFromDefault,
  syncAllExamplesFromDefault,
  detachExampleToRequestPayload,
  type ExampleSyncFlagKey,
  type ExampleSyncFlags,
  type RequestExample
} from '../utils/requestExamples'

export type { RequestExample, ExampleSyncFlags, ExampleSyncFlagKey }

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
  path_params?: KVPair[]
  variables?: KVPair[]
  body: Body
  auth?: AuthConfig
  auth_envs?: Record<string, AuthConfig>
  scripts?: Scripts
  examples?: RequestExample[]
  created_at: string
  updated_at: string
}

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error'

interface RequestState {
  original: Request | null
  draft: Request | null
  current: Request | null
  activeExampleId: string | null
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
  reconcilePathParamsFromUrl,
  areParamsEqual
} from '../utils/urlParams'

const ACTIVE_EXAMPLE_STORAGE_PREFIX = 'hecto:activeExample:'

function loadActiveExampleIdLocal(reqId: string): string | null {
  if (!reqId || typeof window === 'undefined' || !window.localStorage) return null
  try {
    const val = window.localStorage.getItem(`${ACTIVE_EXAMPLE_STORAGE_PREFIX}${reqId}`)
    return val && val.trim() ? val.trim() : null
  } catch {
    return null
  }
}

function saveActiveExampleIdLocal(reqId: string, exampleId: string | null): void {
  if (!reqId || typeof window === 'undefined' || !window.localStorage) return
  try {
    const key = `${ACTIVE_EXAMPLE_STORAGE_PREFIX}${reqId}`
    if (exampleId && exampleId.trim()) {
      window.localStorage.setItem(key, exampleId.trim())
    } else {
      window.localStorage.removeItem(key)
    }
  } catch {
    // ignore storage quota errors
  }
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
    if (
      (key === 'path_params' || key === 'variables' || key === 'examples') &&
      (!obj[key] || (Array.isArray(obj[key]) && obj[key].length === 0))
    ) {
      continue
    }
    sortedObj[key] = stringifySorted(obj[key])
  }
  return JSON.stringify(sortedObj)
}

function markAutoContentTypeHeader(headers: KVPair[] | undefined, bodyType?: string): boolean {
  const expectedAutoCt = bodyType ? AUTO_CONTENT_TYPES[bodyType] : undefined
  if (expectedAutoCt && Array.isArray(headers)) {
    const h = headers.find(
      item =>
        item &&
        typeof item.key === 'string' &&
        item.key.trim().toLowerCase() === 'content-type' &&
        item.value.trim().toLowerCase() === expectedAutoCt
    )
    if (h) {
      h._isAuto = true
      return true
    }
  }
  return false
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
  if (!Array.isArray(req.path_params)) {
    req.path_params = []
  }
  const currentUrl = req.url || ''
  const reconciledPathParams = reconcilePathParamsFromUrl(currentUrl, req.path_params)
  if (!areParamsEqual(req.path_params, reconciledPathParams)) {
    req.path_params = reconciledPathParams
  }
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
  markAutoContentTypeHeader(req.headers, req.body?.type)
  if (Array.isArray(req.examples)) {
    req.examples = req.examples.map(ex => {
      const normalized: RequestExample = {
        ...ex,
        sync_flags: normalizeSyncFlags(ex.sync_flags),
        auth: ex.auth || { type: 'inherit' },
        headers: Array.isArray(ex.headers) ? ex.headers : [],
        params: Array.isArray(ex.params) ? ex.params : [],
        path_params: Array.isArray(ex.path_params) ? ex.path_params : [],
        variables: Array.isArray(ex.variables) ? ex.variables : []
      }
      markAutoContentTypeHeader(normalized.headers, normalized.body?.type)
      return normalized
    })
  }
}

function buildCommittedDraftSnapshot(state: {
  draft: Request | null
  current: Request | null
  activeExampleId: string | null
}): Request | null {
  if (!state.current) return null
  if (!state.draft || !state.activeExampleId) {
    return JSON.parse(JSON.stringify(state.current))
  }
  const nextDraft = JSON.parse(JSON.stringify(state.draft)) as Request
  const examples = Array.isArray(nextDraft.examples) ? [...nextDraft.examples] : []
  const idx = examples.findIndex(ex => ex.id === state.activeExampleId)
  if (idx >= 0) {
    examples[idx] = applyProjectionEditsToExample(examples[idx], state.current, {
      now: examples[idx].updated_at
    })
    nextDraft.examples = examples
  }
  return nextDraft
}

let loadReqSeq = 0

export const useRequestStore = defineStore('request', {
  state: (): RequestState => ({
    original: null,
    draft: null,
    current: null,
    activeExampleId: null,
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
      const effectiveDraft = buildCommittedDraftSnapshot(state)
      return stringifySorted(state.original) !== stringifySorted(effectiveDraft)
    },
    examples(state): RequestExample[] {
      const src = state.draft || state.current
      return Array.isArray(src?.examples) ? src.examples : []
    },
    activeExample(state): RequestExample | null {
      if (!state.activeExampleId) return null
      const src = state.draft || state.current
      const list = Array.isArray(src?.examples) ? src.examples : []
      return list.find(ex => ex.id === state.activeExampleId) || null
    },
    activeSyncFlags(state): ExampleSyncFlags | null {
      if (!state.activeExampleId) return null
      const src = state.draft || state.current
      const list = Array.isArray(src?.examples) ? src.examples : []
      const ex = list.find(item => item.id === state.activeExampleId)
      return ex ? normalizeSyncFlags(ex.sync_flags) : null
    },
    showGetBodyWarning(state): boolean {
      return Boolean(
        state.current &&
        state.current.method === 'GET' &&
        state.current.body &&
        state.current.body.type &&
        state.current.body.type !== 'none'
      )
    }
  },
  actions: {
    getSavedActiveExampleId(requestId: string): string | null {
      return loadActiveExampleIdLocal(requestId)
    },
    _commitProjectionToDraft(options?: { touchTimestamp?: boolean }) {
      if (!this.current) return
      let draft = this.draft
      if (!draft) {
        draft = JSON.parse(JSON.stringify(this.current)) as Request
        this.draft = draft
      }
      if (!this.activeExampleId) {
        if (this.current !== draft) {
          draft = JSON.parse(JSON.stringify(this.current)) as Request
          this.draft = draft
        }
        if (options?.touchTimestamp && Array.isArray(draft.examples) && draft.examples.length > 0) {
          draft.examples = syncAllExamplesFromDefault(draft, undefined, {
            now: new Date().toISOString()
          })
        }
        return
      }
      const examples = Array.isArray(draft.examples) ? [...draft.examples] : []
      const idx = examples.findIndex(ex => ex.id === this.activeExampleId)
      if (idx >= 0) {
        examples[idx] = applyProjectionEditsToExample(examples[idx], this.current, {
          now: options?.touchTimestamp ? new Date().toISOString() : examples[idx].updated_at
        })
        draft.examples = examples
      }
      if (options?.touchTimestamp && Array.isArray(draft.examples) && draft.examples.length > 0) {
        draft.examples = syncAllExamplesFromDefault(draft, undefined, {
          now: new Date().toISOString()
        })
      }
    },
    _refreshCurrentProjection() {
      if (!this.draft) {
        this.current = null
        this.contentTypeAuto = false
        return
      }
      if (!this.activeExampleId) {
        this.current = this.draft
      } else {
        const ex = (this.draft.examples || []).find(item => item.id === this.activeExampleId) || null
        if (!ex) {
          this.activeExampleId = null
          saveActiveExampleIdLocal(this.draft.id, null)
          this.current = this.draft
        } else {
          const eff = resolveEffectiveRequest(this.draft, ex)
          markAutoContentTypeHeader(eff.headers, eff.body?.type)
          this.current = eff
        }
      }
      this.contentTypeAuto = Boolean(this.current?.headers?.some(h => h && h._isAuto))
    },
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
          this.current = null
          this.draft = null
          this.original = loaded
          const loadedDraft = JSON.parse(JSON.stringify(this.original)) as Request
          this.draft = loadedDraft
          const savedExId = loadActiveExampleIdLocal(id)
          const matchedEx = savedExId
            ? (loadedDraft.examples || []).find(ex => ex.id === savedExId) || null
            : null
          if (savedExId && !matchedEx) {
            saveActiveExampleIdLocal(id, null)
          }
          this.activeExampleId = matchedEx ? matchedEx.id : null
          this._refreshCurrentProjection()
          this.saveStatus = 'saved'
          const tabStore = useTabStore()
          tabStore._ensureRequestStoreSync()
          const metaSource = this.draft || this.current
          if (metaSource) {
            tabStore.updateTabMeta('request', metaSource.id, {
              name: metaSource.name,
              method: metaSource.method
            })
            tabStore.setTabDirty('request', metaSource.id, this.isDirty)
          }
        } else {
          this.error = result.error?.message || 'Không thể tải request'
          this.original = null
          this.draft = null
          this.current = null
          this.activeExampleId = null
          this.contentTypeAuto = false
          this.saveStatus = 'saved'
          useTabStore().setTabDirty('request', id, false)
        }
      } catch (err) {
        if (mySeq !== loadReqSeq) return
        this.error = String(err)
        this.original = null
        this.draft = null
        this.current = null
        this.activeExampleId = null
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
      this.draft = null
      this.current = null
      this.activeExampleId = null
      this.loading = false
      this.saving = false
      this.saveStatus = 'saved'
      this.error = null
      this.contentTypeAuto = false
    },
    scheduleAutoSave(delay: number = 800) {
      this.cancelAutoSave()
      const tabStore = useTabStore()
      const uiStore = useUiStore()
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
      if (!uiStore.autoSaveEnabled) {
        return
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
          this._commitProjectionToDraft({ touchTimestamp: true })
          toSave = JSON.parse(JSON.stringify(this.draft || this.current))
          const cleanHeaders = (hs: any[]) =>
            hs
              .filter((h: any) => !(h._isAuto && h.enabled))
              .map(({ _isAuto, ...rest }: any) => rest)
          if (toSave.headers) {
            toSave.headers = cleanHeaders(toSave.headers)
          }
          if (Array.isArray(toSave.examples)) {
            toSave.examples = toSave.examples.map((ex: any) => ({
              ...ex,
              ...(Array.isArray(ex.headers) ? { headers: cleanHeaders(ex.headers) } : {})
            }))
            if (toSave.examples.length === 0 && (!this.original || !this.original.examples)) {
              delete toSave.examples
            }
          }
          const result = await SaveRequest(toSave as any)
          if (result.success) {
            const tabStore = useTabStore()
            if (saveSeq === loadReqSeq && this.current && this.current.id === toSave.id) {
              const latestDraft = buildCommittedDraftSnapshot(this)
              if (stringifySorted(latestDraft) === stringifySorted(toSave)) {
                this.original = JSON.parse(JSON.stringify(toSave))
                if (this.activeExampleId) {
                  this.draft = JSON.parse(JSON.stringify(toSave))
                  this._refreshCurrentProjection()
                } else {
                  this.draft = this.current
                }
                this.saveStatus = 'saved'
              } else {
                this.original = JSON.parse(JSON.stringify(toSave))
                this.saveStatus = 'unsaved'
              }
              const metaSource = this.draft || this.current
              tabStore.updateTabMeta('request', metaSource.id, {
                name: metaSource.name,
                method: metaSource.method
              })
              tabStore.setTabDirty('request', metaSource.id, this.isDirty)
            } else if (toSave?.id) {
              tabStore.setTabDirty('request', toSave.id, false)
            }
            if (!options?.silent) {
              const { useUiStore } = await import('./uiStore')
              useUiStore().showToast('Đã lưu')
            }
            // Trigger tree reload in collectionStore
            const { useCollectionStore } = await import('./collectionStore')
            const collectionStore = useCollectionStore()
            await collectionStore.loadTree()
            collectionStore.scheduleAutoPush()
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
    },
    selectExample(exampleId: string | null) {
      if (!this.draft) return
      const reqId = this.draft.id
      const targetId = exampleId && exampleId.trim() ? exampleId.trim() : null
      if (targetId && !(this.draft.examples || []).some(ex => ex.id === targetId)) {
        return
      }
      if ((this.activeExampleId ?? null) === targetId) return

      this._commitProjectionToDraft({ touchTimestamp: false })
      const tabStore = useTabStore()
      tabStore.saveResponseToCache(reqId, this.activeExampleId)

      this.activeExampleId = targetId
      saveActiveExampleIdLocal(reqId, targetId)
      this._refreshCurrentProjection()
      tabStore.restoreResponseFromCache(reqId, this.activeExampleId)
    },
    createExample(options?: { name?: string; fromExampleId?: string | null }): RequestExample | null {
      if (!this.draft) return null
      this._commitProjectionToDraft({ touchTimestamp: true })
      const source =
        options?.fromExampleId
          ? resolveEffectiveRequest(
              this.draft,
              (this.draft.examples || []).find(ex => ex.id === options.fromExampleId) || null
            )
          : this.draft
      const created = cloneRequestToExample(source, {
        name: options?.name,
        syncFlags: undefined
      })
      if (!Array.isArray(this.draft.examples)) {
        this.draft.examples = []
      }
      this.draft.examples.push(created)
      const tabStore = useTabStore()
      tabStore.saveResponseToCache(this.draft.id, this.activeExampleId)
      this.activeExampleId = created.id
      saveActiveExampleIdLocal(this.draft.id, created.id)
      this._refreshCurrentProjection()
      tabStore.restoreResponseFromCache(this.draft.id, created.id)
      this.scheduleAutoSave()
      return created
    },
    renameExample(exampleId: string, newName: string): boolean {
      if (!this.draft || !Array.isArray(this.draft.examples)) return false
      const trimmed = newName.trim()
      if (!trimmed) return false
      const idx = this.draft.examples.findIndex(ex => ex.id === exampleId)
      if (idx < 0) return false
      this.draft.examples[idx] = {
        ...this.draft.examples[idx],
        name: trimmed,
        updated_at: new Date().toISOString()
      }
      this.scheduleAutoSave()
      return true
    },
    duplicateExample(exampleId: string): RequestExample | null {
      if (!this.draft || !Array.isArray(this.draft.examples)) return null
      this._commitProjectionToDraft({ touchTimestamp: false })
      const src = this.draft.examples.find(ex => ex.id === exampleId)
      if (!src) return null
      const dup = duplicateExampleSnapshot(src, this.draft.examples)
      this.draft.examples.push(dup)
      const tabStore = useTabStore()
      tabStore.saveResponseToCache(this.draft.id, this.activeExampleId)
      this.activeExampleId = dup.id
      saveActiveExampleIdLocal(this.draft.id, dup.id)
      this._refreshCurrentProjection()
      tabStore.restoreResponseFromCache(this.draft.id, dup.id)
      this.scheduleAutoSave()
      return dup
    },
    deleteExample(exampleId: string): boolean {
      if (!this.draft || !Array.isArray(this.draft.examples)) return false
      const idx = this.draft.examples.findIndex(ex => ex.id === exampleId)
      if (idx < 0) return false
      const wasActive = this.activeExampleId === exampleId
      this.draft.examples.splice(idx, 1)
      const tabStore = useTabStore()
      tabStore.clearResponseCacheForRequest(this.draft.id, exampleId)
      if (wasActive) {
        this.activeExampleId = null
        saveActiveExampleIdLocal(this.draft.id, null)
        this._refreshCurrentProjection()
        tabStore.restoreResponseFromCache(this.draft.id, null)
      }
      this.scheduleAutoSave()
      return true
    },
    setExampleSyncFlag(exampleId: string, key: ExampleSyncFlagKey, linked: boolean): boolean {
      if (!this.draft || !Array.isArray(this.draft.examples)) return false
      if (this.activeExampleId === exampleId) {
        this._commitProjectionToDraft({ touchTimestamp: false })
      }
      const idx = this.draft.examples.findIndex(ex => ex.id === exampleId)
      if (idx < 0) return false
      const target = this.draft.examples[idx]
      const nextFlags = normalizeSyncFlags({
        ...target.sync_flags,
        [key]: linked
      })
      // Materialize currently displayed Default group onto the snapshot before unlinking so visible edits do not snap back
      let updated: RequestExample = syncExampleFromDefault(this.draft, target, [key])
      updated = {
        ...updated,
        sync_flags: nextFlags,
        updated_at: new Date().toISOString()
      }
      this.draft.examples[idx] = updated
      if (this.activeExampleId === exampleId) {
        this._refreshCurrentProjection()
      }
      this.scheduleAutoSave()
      return true
    },
    syncActiveExampleFromDefault(groups?: ExampleSyncFlagKey[]): boolean {
      if (!this.draft || !this.activeExampleId || !Array.isArray(this.draft.examples)) return false
      this._commitProjectionToDraft({ touchTimestamp: false })
      const idx = this.draft.examples.findIndex(ex => ex.id === this.activeExampleId)
      if (idx < 0) return false
      this.draft.examples[idx] = syncExampleFromDefault(
        this.draft,
        this.draft.examples[idx],
        groups
      )
      this._refreshCurrentProjection()
      this.scheduleAutoSave()
      return true
    },
    syncAllExamples(groups?: ExampleSyncFlagKey[]): boolean {
      if (!this.draft || !Array.isArray(this.draft.examples) || this.draft.examples.length === 0) {
        return false
      }
      this._commitProjectionToDraft({ touchTimestamp: false })
      this.draft.examples = syncAllExamplesFromDefault(this.draft, groups)
      if (this.activeExampleId) {
        this._refreshCurrentProjection()
      }
      this.scheduleAutoSave()
      return true
    },
    async detachExample(
      exampleId: string,
      options?: { newName?: string; openNewRequest?: boolean }
    ): Promise<string | null> {
      if (!this.draft || !Array.isArray(this.draft.examples)) return null
      this._commitProjectionToDraft({ touchTimestamp: false })
      const ex = this.draft.examples.find(item => item.id === exampleId)
      if (!ex) return null

      const payload = detachExampleToRequestPayload(this.draft, ex.id, {
        newName: options?.newName
      })
      if (!payload) return null

      const { useCollectionStore } = await import('./collectionStore')
      const { useUiStore } = await import('./uiStore')
      const colStore = useCollectionStore()
      const uiStore = useUiStore()
      const pathNodes = colStore.findFolderPath(colStore.tree, this.draft.id) || []
      const folderNodes = pathNodes.filter(n => n.type === 'folder')
      const parentFolderId = folderNodes.length > 0 ? folderNodes[folderNodes.length - 1].id : ''

      const appMod = await import('../../wailsjs/go/main/App')
      if (!appMod.CreateRequest) {
        uiStore.showToast('Không thể tạo request mới')
        return null
      }
      const createRes = await appMod.CreateRequest(parentFolderId)
      if (!createRes?.success || !createRes.data) {
        uiStore.showToast(createRes?.error?.message || 'Không thể tách Example')
        return null
      }
      const createdNode = createRes.data as { id: string; created_at?: string }
      const newReq: Request = {
        ...payload.detachedFields,
        id: createdNode.id,
        created_at: createdNode.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      const saveNewRes = await SaveRequest(newReq as any)
      if (!saveNewRes?.success) {
        uiStore.showToast(saveNewRes?.error?.message || 'Không thể lưu request vừa tách')
        return null
      }

      const sourceReqId = this.draft.id
      const prevExamples = [...this.draft.examples]
      const prevActiveExampleId = this.activeExampleId
      const wasActive = this.activeExampleId === exampleId
      this.draft.examples = this.draft.examples.filter(item => item.id !== exampleId)
      const tabStore = useTabStore()
      tabStore.clearResponseCacheForRequest(sourceReqId, exampleId)
      if (wasActive) {
        this.activeExampleId = null
        saveActiveExampleIdLocal(sourceReqId, null)
        this._refreshCurrentProjection()
        tabStore.restoreResponseFromCache(sourceReqId, null)
      }
      const savedSource = await this.saveCurrent({ silent: true })
      if (!savedSource) {
        this.draft.examples = prevExamples
        this.activeExampleId = prevActiveExampleId
        saveActiveExampleIdLocal(sourceReqId, prevActiveExampleId)
        this._refreshCurrentProjection()
        if (typeof (appMod as any).DeleteRequest === 'function') {
          await (appMod as any).DeleteRequest(newReq.id)
        }
        uiStore.showToast('Không thể cập nhật Request gốc khi tách Example')
        return null
      }
      await colStore.loadTree()
      colStore.scheduleAutoPush()
      uiStore.showToast(`Đã tách thành Request "${newReq.name}"`)
      if (options?.openNewRequest) {
        await colStore.selectRequest(newReq.id)
      }
      return newReq.id
    }
  }
})
