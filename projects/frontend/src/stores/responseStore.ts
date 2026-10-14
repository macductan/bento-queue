import { defineStore } from 'pinia'
import { SendRequest, AbortRequest } from '../../wailsjs/go/main/App'
import { useRequestStore } from './requestStore'
import { useUiStore } from './uiStore'
import { useEnvironmentStore } from './environmentStore'
import { useCollectionStore } from './collectionStore'
import { buildExecuteRequest } from '../utils/buildExecuteRequest'
import { getInheritedHeaders } from '../utils/headers'
import { resolveHierarchyVariables } from '../utils/resolveHierarchyVariables'

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
    urlInvalid: false
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

      const collectionStore = useCollectionStore()
      const envStore = useEnvironmentStore()
      const pathNodes = (collectionStore.findFolderPath(collectionStore.tree, req.id) || []).filter(n => n.type === 'folder')
      const vars = resolveHierarchyVariables({
        collectionVariables: collectionStore.activeCollection?.variables,
        activeEnvVariables: envStore.variablesMap,
        pathFolders: pathNodes,
        activeEnvId: envStore.activeEnvId
      })

      const inheritedHeaders = getInheritedHeaders(pathNodes)
      const execReq = buildExecuteRequest(req, vars, inheritedHeaders, pathNodes)
      this.loading = true
      this.error = null
      const mySeq = ++seq

      try {
        const result = await SendRequest(execReq as any)
        if (mySeq !== seq) return
        if (result.success) {
          this.response = result.data as ExecuteResponse
        } else {
          const code = result.error?.code || 'UNKNOWN'
          const msg = result.error?.message || 'Lỗi không xác định'
          
          if (code === 'ABORTED') {
            // Im lặng
          } else if (code === 'VALIDATION' && msg.includes('đang được gửi')) {
            // Im lặng
          } else if (code === 'CONNECTION_ERROR' || code === 'TIMEOUT') {
            this.error = { code, message: msg }
          } else {
            useUiStore().showToast(msg)
          }
        }
      } catch (err) {
        if (mySeq === seq) this.error = { code: 'UNKNOWN', message: String(err) }
      } finally {
        if (mySeq === seq) this.loading = false
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
    clear() {
      if (this.loading) {
        void AbortRequest()
      }
      seq++
      this.response = null
      this.error = null
      this.loading = false
      this.urlInvalid = false
    }
  }
})
