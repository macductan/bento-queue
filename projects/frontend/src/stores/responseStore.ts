import { defineStore } from 'pinia'
import { SendRequest, AbortRequest } from '../../wailsjs/go/main/App'
import { useRequestStore, type Request } from './requestStore'
import { useUiStore } from './uiStore'
import { useEnvironmentStore } from './environmentStore'
import { useCollectionStore } from './collectionStore'
import { useTabStore } from './tabStore'
import { buildExecuteRequest, type ExecuteRequest } from '../utils/buildExecuteRequest'
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

export interface ExecutionLogRecord {
  id: string
  timestamp: string
  phase: 'pre-request' | 'http' | 'post-response'
  level: 'log' | 'info' | 'warn' | 'error'
  message: string
  detail?: {
    method?: string
    url?: string
    requestHeaders?: Array<{ key: string; value: string }>
    requestBody?: string
    statusCode?: number
    statusText?: string
    timeMs?: number
    sizeBytes?: number
    responseHeaders?: Record<string, string[]>
    responseBodyPreview?: string
  }
}

let seq = 0
let logIdSeq = 0

export const useResponseStore = defineStore('response', {
  state: () => ({
    response: null as ExecuteResponse | null,
    error: null as { code: string; message: string } | null,
    loading: false,
    urlInvalid: false,
    scriptLogs: [] as string[],
    scriptError: null as string | null,
    executionLogs: [] as ExecutionLogRecord[]
  }),
  actions: {
    appendExecutionLog(entry: Omit<ExecutionLogRecord, 'id'>) {
      this.executionLogs.push({
        id: `log-${Date.now()}-${++logIdSeq}`,
        ...entry
      })
    },
    clearLogs() {
      this.scriptLogs = []
      this.scriptError = null
      this.executionLogs = []
    },
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
      this.executionLogs = []

      const collectionStore = useCollectionStore()
      const envStore = useEnvironmentStore()
      const tabStore = useTabStore()
      const reqId = req.id
      const initialResponse = this.response ? JSON.parse(JSON.stringify(this.response)) : null
      let nextResponse: ExecuteResponse | null = initialResponse
      let nextError: { code: string; message: string } | null = null
      let updatedResponse = false

      const pathNodes = (collectionStore.findFolderPath(collectionStore.tree, req.id) || []).filter(n => n.type === 'folder')
      const allFolders: any[] = []
      const walkFolders = (items: any[]) => {
        for (const item of items || []) {
          if (item && item.type === 'folder') {
            allFolders.push(item)
            if (Array.isArray(item.children)) walkFolders(item.children)
          }
        }
      }
      walkFolders(collectionStore.tree)
      const vars = resolveHierarchyVariables({
        collectionVariables: collectionStore.activeCollection?.variables,
        activeEnvVariables: envStore.variablesMap,
        pathFolders: pathNodes,
        activeEnvId: envStore.activeEnvId
      })

      // Clone request for execution so script mutations apply cleanly
      const effectiveReq: Request = JSON.parse(JSON.stringify(req))

      if (req.scripts?.pre_request?.trim()) {
        const preRes = executeScript(req.scripts.pre_request, {
          variables: vars,
          request: effectiveReq,
          collectionVariables: collectionStore.activeCollection?.variables,
          collectionAuth: collectionStore.activeCollection?.auth,
          collectionAuthEnvs: collectionStore.activeCollection?.auth_envs,
          environments: envStore.environments as any,
          activeEnvId: envStore.activeEnvId,
          pathFolders: pathNodes,
          allFolders
        })
        if (preRes.logs.length > 0) {
          this.scriptLogs.push(...preRes.logs.map(l => `[Pre-request] ${l}`))
        }
        for (const entry of preRes.logEntries) {
          this.appendExecutionLog({
            timestamp: entry.timestamp,
            phase: 'pre-request',
            level: entry.level,
            message: entry.message
          })
        }
        if (Object.keys(preRes.envUpdates).length > 0) {
          await envStore.applyVariableUpdates(preRes.envUpdates)
        }
        await envStore.applyScopedVariableUpdates(preRes.scopedEnvUpdates, pathNodes)
        if (preRes.scopedAuthUpdates) {
          await envStore.applyScopedAuthUpdates(preRes.scopedAuthUpdates, pathNodes)
        }

        // Apply request mutations from pre-request script
        const mut = preRes.requestMutations
        if (mut.url !== undefined) {
          effectiveReq.url = mut.url
          req.url = mut.url
        }
        if (mut.method !== undefined) {
          effectiveReq.method = mut.method
          req.method = mut.method
        }
        if (mut.params !== undefined) {
          effectiveReq.params = mut.params
          req.params = mut.params.map(p => ({ ...p }))
        }
        if (mut.path_params !== undefined) {
          effectiveReq.path_params = mut.path_params
          req.path_params = mut.path_params.map(p => ({ ...p }))
        }
        if (mut.headers !== undefined) {
          effectiveReq.headers = mut.headers
          req.headers = mut.headers.map(h => ({ ...h }))
        }
        if (mut.body !== undefined) {
          if (!effectiveReq.body) effectiveReq.body = { type: 'none', content: '' }
          if (!req.body) req.body = { type: 'none', content: '' }
          if (mut.body.type !== undefined) {
            effectiveReq.body.type = mut.body.type
            req.body.type = mut.body.type
          }
          if (mut.body.content !== undefined) {
            effectiveReq.body.content = mut.body.content
            req.body.content = mut.body.content
          }
        }
        if (mut.auth !== undefined) {
          effectiveReq.auth = mut.auth
          req.auth = mut.auth
        }

        if (!preRes.success) {
          this.scriptError = preRes.error || 'Lỗi thực thi Pre-request Script'
          useUiStore().showToast(`Lỗi Pre-request Script: ${this.scriptError}`)
        }
      }

      const inheritedHeaders = getInheritedHeaders(pathNodes)
      const hasEnvOrCollectionAuth = Boolean(
        (effectiveReq.auth_envs && Object.keys(effectiveReq.auth_envs).length > 0) ||
        pathNodes.some(n => n.auth_envs && Object.keys(n.auth_envs).length > 0) ||
        collectionStore.activeCollection?.auth ||
        (collectionStore.activeCollection?.auth_envs && Object.keys(collectionStore.activeCollection.auth_envs).length > 0)
      )
      const execReq: ExecuteRequest = hasEnvOrCollectionAuth
        ? buildExecuteRequest(effectiveReq, vars, inheritedHeaders, pathNodes, {
            activeEnvId: envStore.activeEnvId,
            requestAuthEnvs: effectiveReq.auth_envs,
            collection: collectionStore.activeCollection as any
          })
        : buildExecuteRequest(effectiveReq, vars, inheritedHeaders, pathNodes)
      this.loading = true
      this.error = null
      const mySeq = ++seq

      try {
        const result = await SendRequest(execReq as any)
        if (mySeq !== seq) return
        if (result.success) {
          nextResponse = result.data as ExecuteResponse
          updatedResponse = true
          useUiStore().setResponsePaneCollapsed(false)

          this.appendExecutionLog({
            timestamp: nextResponse.timestamp || new Date().toISOString(),
            phase: 'http',
            level: nextResponse.status_code >= 400 ? 'warn' : 'info',
            message: `${execReq.method} ${execReq.url} → ${nextResponse.status_code} ${nextResponse.status_text} (${nextResponse.time_ms}ms)`,
            detail: {
              method: execReq.method,
              url: execReq.url,
              requestHeaders: (execReq.headers || []).map(h => ({ key: h.key, value: h.value })),
              requestBody: execReq.body || '',
              statusCode: nextResponse.status_code,
              statusText: nextResponse.status_text,
              timeMs: nextResponse.time_ms,
              sizeBytes: nextResponse.size_bytes,
              responseHeaders: nextResponse.headers,
              responseBodyPreview: (nextResponse.body || '').slice(0, 1000)
            }
          })

          if (req.scripts?.post_response?.trim()) {
            const postRes = executeScript(req.scripts.post_response, {
              variables: vars,
              response: nextResponse,
              request: effectiveReq,
              collectionVariables: collectionStore.activeCollection?.variables,
              collectionAuth: collectionStore.activeCollection?.auth,
              collectionAuthEnvs: collectionStore.activeCollection?.auth_envs,
              environments: envStore.environments as any,
              activeEnvId: envStore.activeEnvId,
              pathFolders: pathNodes,
              allFolders
            })
            if (postRes.logs.length > 0) {
              this.scriptLogs.push(...postRes.logs.map(l => `[Post-response] ${l}`))
            }
            for (const entry of postRes.logEntries) {
              this.appendExecutionLog({
                timestamp: entry.timestamp,
                phase: 'post-response',
                level: entry.level,
                message: entry.message
              })
            }
            if (Object.keys(postRes.envUpdates).length > 0) {
              await envStore.applyVariableUpdates(postRes.envUpdates)
            }
            await envStore.applyScopedVariableUpdates(postRes.scopedEnvUpdates, pathNodes)
            if (postRes.scopedAuthUpdates) {
              await envStore.applyScopedAuthUpdates(postRes.scopedAuthUpdates, pathNodes)
            }
            const pMut = postRes.requestMutations
            if (pMut.url !== undefined) req.url = pMut.url
            if (pMut.method !== undefined) req.method = pMut.method
            if (pMut.params !== undefined) req.params = pMut.params.map(p => ({ ...p }))
            if (pMut.path_params !== undefined) req.path_params = pMut.path_params.map(p => ({ ...p }))
            if (pMut.headers !== undefined) req.headers = pMut.headers.map(h => ({ ...h }))
            if (pMut.body !== undefined) {
              if (!req.body) req.body = { type: 'none', content: '' }
              if (pMut.body.type !== undefined) req.body.type = pMut.body.type
              if (pMut.body.content !== undefined) req.body.content = pMut.body.content
            }
            if (pMut.auth !== undefined) {
              req.auth = pMut.auth
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
          useUiStore().setResponsePaneCollapsed(false)
          const code = result.error?.code || 'UNKNOWN'
          const msg = result.error?.message || 'Lỗi không xác định'

          this.appendExecutionLog({
            timestamp: new Date().toISOString(),
            phase: 'http',
            level: 'error',
            message: `${execReq.method} ${execReq.url} → LỖI [${code}]: ${msg}`,
            detail: {
              method: execReq.method,
              url: execReq.url,
              requestHeaders: (execReq.headers || []).map(h => ({ key: h.key, value: h.value })),
              requestBody: execReq.body || ''
            }
          })
          
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
        this.appendExecutionLog({
          timestamp: new Date().toISOString(),
          phase: 'http',
          level: 'error',
          message: `${execReq.method} ${execReq.url} → ${String(err)}`
        })
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
      this.executionLogs = []
    }
  }
})
