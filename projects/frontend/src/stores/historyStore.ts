import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as AppBinding from '../../wailsjs/go/main/App'
import { useRequestStore } from './requestStore'
import { useResponseStore, type ExecuteResponse } from './responseStore'
import { useUiStore } from './uiStore'
import type { ExecuteRequest } from '../utils/buildExecuteRequest'

export interface ExecutionHistoryEntry {
  id: string
  collection_id: string
  request_id?: string
  request_name: string
  method: string
  url: string
  status_code: number
  status_text: string
  time_ms: number
  size_bytes: number
  timestamp: string
  request: ExecuteRequest
  response?: ExecuteResponse | null
  error?: string
}

export interface ChangelogEntry {
  id: string
  collection_id: string
  entity_type: string
  entity_id: string
  entity_name: string
  action: string
  summary: string
  timestamp: string
}

export const useHistoryStore = defineStore('history', () => {
  const executions = ref<ExecutionHistoryEntry[]>([])
  const changelog = ref<ChangelogEntry[]>([])
  const loading = ref(false)

  async function loadExecutions() {
    try {
      if (typeof AppBinding.ListExecutionHistory !== 'function') return
      const res = await AppBinding.ListExecutionHistory()
      if (res?.success && Array.isArray(res.data)) {
        executions.value = res.data as ExecutionHistoryEntry[]
      }
    } catch {
      // Ignore errors in headless/mocked environments
    }
  }

  async function recordExecution(entry: Omit<ExecutionHistoryEntry, 'id'> & { id?: string }) {
    try {
      if (typeof AppBinding.RecordExecutionHistory !== 'function') return
      const res = await AppBinding.RecordExecutionHistory(entry as any)
      if (res?.success && res.data) {
        const saved = res.data as ExecutionHistoryEntry
        executions.value = [saved, ...executions.value.filter(e => e.id !== saved.id)].slice(0, 100)
      }
    } catch {
      // Ignore errors in headless/mocked environments
    }
  }

  async function clearExecutions() {
    try {
      if (typeof AppBinding.ClearExecutionHistory !== 'function') return false
      const res = await AppBinding.ClearExecutionHistory()
      if (res?.success) {
        executions.value = []
        return true
      }
    } catch {
      // Ignore
    }
    return false
  }

  async function loadChangelog() {
    try {
      if (typeof AppBinding.ListChangelog !== 'function') return
      const res = await AppBinding.ListChangelog()
      if (res?.success && Array.isArray(res.data)) {
        changelog.value = res.data as ChangelogEntry[]
      }
    } catch {
      // Ignore
    }
  }

  async function clearChangelog() {
    try {
      if (typeof AppBinding.ClearChangelog !== 'function') return false
      const res = await AppBinding.ClearChangelog()
      if (res?.success) {
        changelog.value = []
        return true
      }
    } catch {
      // Ignore
    }
    return false
  }

  async function loadAll() {
    loading.value = true
    try {
      await Promise.all([loadExecutions(), loadChangelog()])
    } finally {
      loading.value = false
    }
  }

  async function restoreExecution(entry: ExecutionHistoryEntry): Promise<boolean> {
    const reqStore = useRequestStore()
    const resStore = useResponseStore()
    const uiStore = useUiStore()

    if (reqStore.current && entry.request_id && reqStore.current.id !== entry.request_id) {
      const confirmed = await uiStore.requestConfirm(
        `Lịch sử này thuộc về request "${entry.request_name || entry.request_id}". Bạn có chắc chắn muốn ghi đè lên request hiện tại ("${reqStore.current.name || reqStore.current.id}") không?`
      )
      if (!confirmed) return false
    }

    const now = new Date().toISOString()

    const bodyType = (entry.request?.body_type as any) || (entry.request?.body ? 'json' : 'none')
    const headers = Array.isArray(entry.request?.headers)
      ? entry.request.headers.map(h => ({
          key: h.key,
          value: h.value,
          enabled: h.enabled ?? true
        }))
      : []

    if (reqStore.current) {
      reqStore.current.method = entry.method || entry.request?.method || 'GET'
      reqStore.current.url = entry.url || entry.request?.url || ''
      reqStore.current.headers = headers
      reqStore.current.params = []
      reqStore.current.body = {
        type: bodyType,
        content: entry.request?.body || '',
        form_data: entry.request?.form_data?.map(f => ({
          key: f.key,
          value: f.value,
          enabled: f.enabled ?? true
        }))
      }
    } else {
      reqStore.current = {
        id: entry.request_id || `hist-${entry.id}`,
        name: entry.request_name || entry.url || 'Restored Request',
        method: entry.method || entry.request?.method || 'GET',
        url: entry.url || entry.request?.url || '',
        headers,
        params: [],
        body: {
          type: bodyType,
          content: entry.request?.body || '',
          form_data: entry.request?.form_data?.map(f => ({
            key: f.key,
            value: f.value,
            enabled: f.enabled ?? true
          }))
        },
        auth: { type: 'inherit' },
        created_at: now,
        updated_at: now
      }
    }

    if (entry.response) {
      resStore.response = entry.response
      resStore.error = null
    }

    return true
  }

  return {
    executions,
    changelog,
    loading,
    loadExecutions,
    recordExecution,
    clearExecutions,
    loadChangelog,
    clearChangelog,
    loadAll,
    restoreExecution
  }
})
