import { defineStore } from 'pinia'
import { SendRequest, AbortRequest } from '../../wailsjs/go/main/App'
import { useRequestStore } from './requestStore'
import { useUiStore } from './uiStore'
import { useEnvironmentStore } from './environmentStore'
import { useCollectionStore } from './collectionStore'
import { useTabStore } from './tabStore'
import { buildExecuteRequest } from '../utils/buildExecuteRequest'
import { getInheritedHeaders } from '../utils/headers'
import { resolveHierarchyVariables } from '../utils/resolveHierarchyVariables'
import { executeScript } from '../utils/scriptRunner'
import { useHistoryStore } from './historyStore'

export interface ExecuteResponse {
  status_code: number
  status_text: string
  headers: Record<string, string[]>
  body: string
  time_ms: number
  size_bytes: number
  timestamp: string
  truncated: boolean
  is_binary: boolean
}

let seq = 0

export const useResponseStore = defineStore('response', {
  state: () => ({
    response: null as ExecuteResponse | null,
    error: null as { code: string; message: string } | null,
    loading: false,
    urlInvalid: false,
    scriptLogs: [] as string[],
    scriptError: null as string | null
  }),
  actions: {
    async send() {
      if (this.loading) return

      const reqStore = useRequestStore()
      if (!reqStore.current) return

      const req = reqStore.current
      if (!req.url || req.url.trim() === '') {
        this.urlInvalid = true
        useUiStore().showToast('Vui lòng nhập URL')
        return
      }
      this.urlInvalid = false
      this.scriptLogs = []
      this.scriptError = null

      const collectionStore = useCollectionStore()
      const envStore = useEnvironmentStore()
      const tabStore = useTabStore()
      const reqId = req.id
      const initialResponse = this.response ? JSON.parse(JSON.stringify(this.response)) : null
      let nextResponse: ExecuteResponse | null = initialResponse
      let nextError: { code: string; message: string } | null = null
      let updatedResponse = false

      const pathNodes = (collectionStore.findFolderPath(collectionStore.tree, req.id) || []).filter(n => n.type === 'folder')
      const vars = resolveHierarchyVariables({
        collectionVariables: collectionStore.activeCollection?.variables,
        activeEnvVariables: envStore.variablesMap,
        pathFolders: pathNodes,
        activeEnvId: envStore.activeEnvId
      })

      if (req.scripts?.pre_request?.trim()) {
        const preRes = executeScript(req.scripts.pre_request, { variables: vars })
        if (preRes.logs.length > 0) {
          this.scriptLogs.push(...preRes.logs.map(l => `[Pre-request] ${l}`))
        }
        if (Object.keys(preRes.envUpdates).length > 0) {
          await envStore.applyVariableUpdates(preRes.envUpdates)
        }
        if (!preRes.success) {
          this.scriptError = preRes.error || 'Lỗi thực thi Pre-request Script'
          useUiStore().showToast(`Lỗi Pre-request Script: ${this.scriptError}`)
        }
      }

      const inheritedHeaders = getInheritedHeaders(pathNodes)
      const hasEnvOrCollectionAuth = Boolean(
        (req.auth_envs && Object.keys(req.auth_envs).length > 0) ||
        pathNodes.some(n => n.auth_envs && Object.keys(n.auth_envs).length > 0) ||
        collectionStore.activeCollection?.auth ||
        (collectionStore.activeCollection?.auth_envs && Object.keys(collectionStore.activeCollection.auth_envs).length > 0)
      )
      const execReq = hasEnvOrCollectionAuth
        ? buildExecuteRequest(req, vars, inheritedHeaders, pathNodes, {
            activeEnvId: envStore.activeEnvId,
            requestAuthEnvs: req.auth_envs,
            collection: collectionStore.activeCollection as any
          })
        : buildExecuteRequest(req, vars, inheritedHeaders, pathNodes)
      this.loading = true
      this.error = null
      const mySeq = ++seq

      try {
        const result = await SendRequest(execReq as any)
        if (mySeq !== seq) return
        if (result.success) {
          nextResponse = result.data as ExecuteResponse
          updatedResponse = true
          if (req.scripts?.post_response?.trim()) {
            const postRes = executeScript(req.scripts.post_response, {
              variables: vars,
              response: nextResponse
            })
            if (postRes.logs.length > 0) {
              this.scriptLogs.push(...postRes.logs.map(l => `[Post-response] ${l}`))
            }
            if (Object.keys(postRes.envUpdates).length > 0) {
              await envStore.applyVariableUpdates(postRes.envUpdates)
            }
            if (!postRes.success) {
              this.scriptError = postRes.error || 'Lỗi thực thi Post-response Script'
              useUiStore().showToast(`Lỗi Post-response Script: ${this.scriptError}`)
            }
          }
          void useHistoryStore().recordExecution({
            collection_id: collectionStore.activeCollection?.id || 'default',
            request_id: req.id,
            request_name: req.name || execReq.url,
            method: execReq.method,
            url: execReq.url,
            status_code: nextResponse.status_code,
            status_text: nextResponse.status_text,
            time_ms: nextResponse.time_ms,
            size_bytes: nextResponse.size_bytes,
            timestamp: nextResponse.timestamp || new Date().toISOString(),
            request: execReq,
            response: nextResponse
          })
        } else {
          const code = result.error?.code || 'UNKNOWN'
          const msg = result.error?.message || 'Lỗi không xác định'
          
          if (code === 'ABORTED') {
            // Im lặng
          } else if (code === 'VALIDATION' && msg.includes('đang được gửi')) {
            // Im lặng
          } else if (code === 'CONNECTION_ERROR' || code === 'TIMEOUT') {
            nextError = { code, message: msg }
          } else {
            useUiStore().showToast(msg)
          }
        }
      } catch (err) {
        if (mySeq !== seq) return
        nextError = { code: 'UNKNOWN', message: String(err) }
      } finally {
        if (mySeq === seq) {
          const isStillActiveRequest =
            (collectionStore.activeRequestId === reqId && !collectionStore.activeFolderId) ||
            (!collectionStore.activeRequestId && !collectionStore.activeFolderId && reqStore.current?.id === reqId)

          if (isStillActiveRequest) {
            if (updatedResponse) {
              this.response = nextResponse
            }
            if (nextError) {
              this.error = nextError
            }
            this.loading = false
            if (tabStore.tabs.some(t => t.type === 'request' && t.entityId === reqId)) {
              tabStore.saveResponseToCache(reqId)
            }
          } else if (tabStore.tabs.some(t => t.type === 'request' && t.entityId === reqId)) {
            tabStore.responseCache[reqId] = {
              response: nextResponse ? JSON.parse(JSON.stringify(nextResponse)) : null,
              error: nextError ? { ...nextError } : null,
              loading: false,
              urlInvalid: false
            }
          }
        }
      }
    },
    async abort() {
      if (!this.loading) return
      try {
        await AbortRequest()
      } catch (err) {
        console.error('Lỗi khi hủy:', err)
      }
    },
    resetDisplay() {
      this.response = null
      this.error = null
      this.loading = false
      this.urlInvalid = false
    },
    clear() {
      if (this.loading) {
        void AbortRequest()
      }
      seq++
      this.response = null
      this.error = null
      this.loading = false
      this.urlInvalid = false
      this.scriptLogs = []
      this.scriptError = null
    }
  }
})
