import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as AppBinding from '../../wailsjs/go/main/App'
import type { KVPair } from './requestStore'
import { useUiStore } from './uiStore'

export interface MockRoute {
  id: string
  method: string
  path: string
  status_code: number
  headers: KVPair[]
  body: string
  delay_ms?: number
  enabled: boolean
  description?: string
}

export interface MockServerStatus {
  running: boolean
  port: number
  base_url: string
  routes: MockRoute[]
}

export const useMockServerStore = defineStore('mockServer', () => {
  const running = ref(false)
  const port = ref(4010)
  const baseUrl = ref('http://127.0.0.1:4010')
  const routes = ref<MockRoute[]>([])
  const loading = ref(false)
  const uiStore = useUiStore()

  function applyStatus(status: MockServerStatus) {
    running.value = Boolean(status.running)
    port.value = status.port || 4010
    baseUrl.value = status.base_url || `http://127.0.0.1:${port.value}`
    routes.value = Array.isArray(status.routes)
      ? status.routes.map(r => ({
          id: r.id,
          method: r.method || 'GET',
          path: r.path || '/',
          status_code: r.status_code || 200,
          headers: Array.isArray(r.headers) ? r.headers : [],
          body: r.body ?? '',
          delay_ms: r.delay_ms ?? 0,
          enabled: r.enabled ?? true,
          description: r.description ?? ''
        }))
      : []
  }

  async function loadStatus() {
    loading.value = true
    try {
      if (typeof AppBinding.GetMockServerStatus !== 'function') return
      const res = await AppBinding.GetMockServerStatus()
      if (res?.success && res.data) {
        applyStatus(res.data as MockServerStatus)
      }
    } catch {
      // Ignore in mocked environments
    } finally {
      loading.value = false
    }
  }

  async function saveConfig() {
    try {
      if (typeof AppBinding.SaveMockServerConfig !== 'function') return false
      const res = await AppBinding.SaveMockServerConfig({
        port: Number(port.value) || 4010,
        routes: routes.value
      } as any)
      if (res?.success && res.data) {
        applyStatus(res.data as MockServerStatus)
        uiStore.showToast('Đã lưu cấu hình Mock Server')
        return true
      } else if (res?.error?.message) {
        uiStore.showToast(res.error.message)
      }
    } catch (e: any) {
      uiStore.showToast(`Lỗi lưu cấu hình Mock Server: ${e.message}`)
    }
    return false
  }

  async function startServer() {
    try {
      await saveConfig()
      if (typeof AppBinding.StartMockServer !== 'function') return false
      const res = await AppBinding.StartMockServer(Number(port.value) || 4010)
      if (res?.success && res.data) {
        applyStatus(res.data as MockServerStatus)
        uiStore.showToast(`Mock Server đang chạy tại ${baseUrl.value}`)
        return true
      } else if (res?.error?.message) {
        uiStore.showToast(res.error.message)
      }
    } catch (e: any) {
      uiStore.showToast(`Không thể khởi động Mock Server: ${e.message}`)
    }
    return false
  }

  async function stopServer() {
    try {
      if (typeof AppBinding.StopMockServer !== 'function') return false
      const res = await AppBinding.StopMockServer()
      if (res?.success && res.data) {
        applyStatus(res.data as MockServerStatus)
        uiStore.showToast('Đã dừng Mock Server')
        return true
      }
    } catch (e: any) {
      uiStore.showToast(`Lỗi dừng Mock Server: ${e.message}`)
    }
    return false
  }

  function addRoute() {
    const newRoute: MockRoute = {
      id: `route-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      method: 'GET',
      path: '/api/mock',
      status_code: 200,
      headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }],
      body: '{\n  "message": "Hello from Hecto Local Mock Server"\n}',
      delay_ms: 0,
      enabled: true,
      description: ''
    }
    routes.value.push(newRoute)
    return newRoute
  }

  function removeRoute(id: string) {
    routes.value = routes.value.filter(r => r.id !== id)
  }

  return {
    running,
    port,
    baseUrl,
    routes,
    loading,
    loadStatus,
    saveConfig,
    startServer,
    stopServer,
    addRoute,
    removeRoute
  }
})
