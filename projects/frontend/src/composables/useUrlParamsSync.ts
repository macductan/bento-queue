import { watch, nextTick, type Ref } from 'vue'
import type { Request, KVPair } from '../stores/requestStore'
import {
  parseUrl,
  updateUrlWithParams,
  reconcileParamsFromUrl,
  areParamsEqual
} from '../utils/urlParams'

export function useUrlParamsSync(req: Ref<Request | null>) {
  let isSyncing = false
  let lastSyncedUrl = ''
  let lastSyncedParams: KVPair[] = []
  let currentRequestId = ''

  let currentRequestRef: Request | null = null

  function syncInitialState() {
    currentRequestRef = req.value
    if (!req.value) {
      currentRequestId = ''
      lastSyncedUrl = ''
      lastSyncedParams = []
      isSyncing = false
      return
    }

    currentRequestId = req.value.id || ''
    const currentUrl = req.value.url || ''
    if (!req.value.params) {
      req.value.params = []
    }

    const { params: parsedFromUrl } = parseUrl(currentUrl)

    if (parsedFromUrl.length > 0) {
      const reconciled = reconcileParamsFromUrl(currentUrl, req.value.params)
      if (!areParamsEqual(req.value.params, reconciled)) {
        req.value.params = reconciled
      }
    } else {
      const enabledParams = req.value.params.filter(p => p.enabled && p.key.trim() !== '')
      if (enabledParams.length > 0) {
        const updatedUrl = updateUrlWithParams(currentUrl, req.value.params)
        if (updatedUrl !== currentUrl) {
          req.value.url = updatedUrl
        }
      }
    }

    lastSyncedUrl = req.value.url || ''
    lastSyncedParams = JSON.parse(JSON.stringify(req.value.params || []))
    isSyncing = false
  }

  // Initial synchronization on mount
  syncInitialState()

  // Watch for request reference or id switch to reset and re-synchronize state cleanly
  watch(
    () => req.value,
    (newReq) => {
      if (newReq !== currentRequestRef || (newReq?.id || '') !== currentRequestId) {
        syncInitialState()
      }
    }
  )

  // Watch URL -> Sync to Params
  watch(
    () => req.value?.url,
    (newUrl) => {
      if (!req.value || isSyncing) return
      if (newUrl === undefined || newUrl === null) return
      if (newUrl === lastSyncedUrl) return

      lastSyncedUrl = newUrl

      if (!req.value.params) {
        req.value.params = []
      }

      const newParams = reconcileParamsFromUrl(newUrl, req.value.params)
      if (!areParamsEqual(req.value.params, newParams)) {
        isSyncing = true
        lastSyncedParams = JSON.parse(JSON.stringify(newParams))
        req.value.params = newParams
        nextTick(() => {
          isSyncing = false
        })
      }
    }
  )

  // Watch Params -> Sync to URL
  watch(
    () => req.value?.params,
    (newParams) => {
      if (!req.value || isSyncing) return
      if (!newParams) return
      if (areParamsEqual(newParams, lastSyncedParams)) return

      lastSyncedParams = JSON.parse(JSON.stringify(newParams))

      const currentUrl = req.value.url || ''
      const updatedUrl = updateUrlWithParams(currentUrl, newParams)

      if (updatedUrl !== currentUrl) {
        isSyncing = true
        lastSyncedUrl = updatedUrl
        req.value.url = updatedUrl
        nextTick(() => {
          isSyncing = false
        })
      }
    },
    { deep: true }
  )

  return {
    isSyncing: () => isSyncing
  }
}
