<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useUiStore } from '@/stores/uiStore'
import { useMockServerStore, type MockRoute } from '@/stores/mockServerStore'
import KvpEditor from '@/components/KvpEditor.vue'
import CustomSelect, { type SelectOption } from '@/components/CustomSelect.vue'

const uiStore = useUiStore()
const mockStore = useMockServerStore()

const selectedRouteId = ref<string | null>(null)
const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD', 'ANY']
const methodOptions: SelectOption[] = methods.map(m => ({ value: m, label: m }))

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && uiStore.mockServerModalOpen) {
    e.preventDefault()
    e.stopPropagation()
    uiStore.closeMockServerModal()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

watch(
  () => uiStore.mockServerModalOpen,
  async isOpen => {
    if (isOpen) {
      await mockStore.loadStatus()
      if (mockStore.routes.length > 0 && !selectedRouteId.value) {
        selectedRouteId.value = mockStore.routes[0]!.id
      }
    }
  },
  { immediate: true }
)

const selectedRoute = computed<MockRoute | null>(() => {
  if (!mockStore.routes.length) return null
  const route = (
    mockStore.routes.find(r => r.id === selectedRouteId.value) ??
    mockStore.routes[0] ??
    null
  )
  if (route && !route.headers) {
    route.headers = []
  }
  return route
})

function handleAddRoute() {
  const created = mockStore.addRoute()
  selectedRouteId.value = created.id
}

function handleRemoveRoute(id: string) {
  mockStore.removeRoute(id)
  if (selectedRouteId.value === id) {
    selectedRouteId.value = mockStore.routes[0]?.id ?? null
  }
}

async function handleToggleServer() {
  if (mockStore.running) {
    await mockStore.stopServer()
  } else {
    await mockStore.startServer()
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="uiStore.mockServerModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      data-test="mock-server-modal"
      @click.self="uiStore.closeMockServerModal()"
    >
      <div
        class="flex h-[82vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border-default bg-surface-overlay shadow-2xl"
      >
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-border-default bg-surface-raised px-5 py-3.5">
          <div class="flex items-center gap-3">
            <h2 class="text-sm font-semibold text-text-primary m-0">
              Local Mock HTTP Server
            </h2>
            <span
              data-test="mock-server-status-badge"
              class="rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold"
              :class="
                mockStore.running
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-surface-base text-text-muted border border-border-default'
              "
            >
              {{ mockStore.running ? `RUNNING • ${mockStore.baseUrl}` : 'STOPPED' }}
            </span>
          </div>

          <div class="flex items-center gap-2">
            <label class="flex items-center gap-1.5 text-xs text-text-secondary">
              <span>Port:</span>
              <input
                v-model.number="mockStore.port"
                type="number"
                min="1024"
                max="65535"
                data-test="mock-port-input"
                class="w-24 rounded border border-border-default bg-surface-input px-2 py-1 font-mono text-xs text-text-primary focus:border-brand-primary focus:outline-none"
              />
            </label>

            <button
              type="button"
              data-test="save-mock-config-btn"
              class="rounded border border-border-default bg-surface-base px-3 py-1 text-xs font-medium text-text-primary hover:bg-surface-hover cursor-pointer"
              @click="mockStore.saveConfig()"
            >
              Lưu cấu hình
            </button>

            <button
              type="button"
              data-test="mock-toggle-server-btn"
              class="rounded px-3 py-1 text-xs font-semibold text-white transition-colors cursor-pointer"
              :class="
                mockStore.running
                  ? 'bg-red-600 hover:bg-red-500'
                  : 'bg-emerald-600 hover:bg-emerald-500'
              "
              @click="handleToggleServer"
            >
              {{ mockStore.running ? 'Dừng Server' : 'Khởi động Server' }}
            </button>

            <button
              type="button"
              data-test="close-mock-server-btn"
              class="rounded px-2 py-1 text-text-muted hover:bg-surface-hover hover:text-text-primary cursor-pointer"
              @click="uiStore.closeMockServerModal()"
            >
              ✕
            </button>
          </div>
        </div>

        <!-- Body -->
        <div class="flex flex-1 overflow-hidden">
          <!-- Left: Route List -->
          <div class="flex w-2/5 flex-col border-r border-border-default bg-surface-base">
            <div class="flex items-center justify-between border-b border-border-default px-4 py-2.5">
              <span class="text-xs font-semibold text-text-secondary">
                Mock Routes ({{ mockStore.routes.length }})
              </span>
              <button
                type="button"
                data-test="add-mock-route-btn"
                class="rounded bg-brand-primary px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90 cursor-pointer"
                @click="handleAddRoute"
              >
                + Thêm Route
              </button>
            </div>

            <div
              v-if="mockStore.routes.length === 0"
              class="flex flex-1 items-center justify-center p-4 text-center text-xs text-text-muted"
              data-test="mock-routes-empty"
            >
              Chưa có route nào. Nhấn "+ Thêm Route" để tạo mock endpoint.
            </div>

            <div v-else class="flex-1 overflow-y-auto">
              <div
                v-for="rt in mockStore.routes"
                :key="rt.id"
                data-test="mock-route-row"
                class="flex cursor-pointer items-center justify-between border-b border-border-default px-4 py-2.5 transition-colors hover:bg-surface-hover"
                :class="selectedRoute?.id === rt.id ? 'bg-surface-raised border-l-2 border-l-brand-primary' : ''"
                @click="selectedRouteId = rt.id"
              >
                <div class="flex min-w-0 items-center gap-2">
                  <input
                    v-model="rt.enabled"
                    type="checkbox"
                    class="rounded border-border-default"
                    @click.stop
                  />
                  <span class="font-mono text-[11px] font-bold text-brand-primary">
                    {{ rt.method }}
                  </span>
                  <span class="truncate font-mono text-xs text-text-primary">
                    {{ rt.path }}
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-emerald-400">
                    {{ rt.status_code }}
                  </span>
                  <button
                    type="button"
                    data-test="delete-mock-route-btn"
                    class="text-[11px] text-text-muted hover:text-red-400 cursor-pointer"
                    @click.stop="handleRemoveRoute(rt.id)"
                  >
                    Xóa
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Right: Route Editor -->
          <div v-if="selectedRoute" class="flex flex-1 flex-col overflow-y-auto p-4 space-y-3 bg-surface-overlay">
            <div class="grid grid-cols-12 gap-3">
              <div class="col-span-3">
                <label class="mb-1 block text-[11px] font-medium text-text-secondary">
                  Method
                </label>
                <CustomSelect
                  v-model="selectedRoute.method"
                  data-test="mock-route-method-select"
                  :options="methodOptions"
                  full-width
                  size="sm"
                  button-class="font-mono text-xs bg-surface-input"
                />
              </div>

              <div class="col-span-5">
                <label class="mb-1 block text-[11px] font-medium text-text-secondary">
                  Path (hỗ trợ `:param`, ví dụ `/api/users/:id`)
                </label>
                <input
                  v-model="selectedRoute.path"
                  type="text"
                  data-test="mock-route-path-input"
                  class="w-full rounded border border-border-default bg-surface-input px-2.5 py-1.5 font-mono text-xs text-text-primary focus:border-brand-primary focus:outline-none"
                  placeholder="/api/users/:id"
                />
              </div>

              <div class="col-span-2">
                <label class="mb-1 block text-[11px] font-medium text-text-secondary">
                  Status Code
                </label>
                <input
                  v-model.number="selectedRoute.status_code"
                  type="number"
                  min="100"
                  max="599"
                  data-test="mock-route-status-input"
                  class="w-full rounded border border-border-default bg-surface-input px-2.5 py-1.5 font-mono text-xs text-text-primary focus:border-brand-primary focus:outline-none"
                />
              </div>

              <div class="col-span-2">
                <label class="mb-1 block text-[11px] font-medium text-text-secondary">
                  Delay (ms)
                </label>
                <input
                  v-model.number="selectedRoute.delay_ms"
                  type="number"
                  min="0"
                  max="30000"
                  data-test="mock-route-delay-input"
                  class="w-full rounded border border-border-default bg-surface-input px-2.5 py-1.5 font-mono text-xs text-text-primary focus:border-brand-primary focus:outline-none"
                />
              </div>
            </div>

            <!-- Custom Route Headers -->
            <div class="flex flex-col space-y-1.5" data-test="mock-route-headers-section">
              <label class="block text-[11px] font-medium text-text-secondary">
                Route Headers (Custom response headers)
              </label>
              <div class="border border-border-default rounded bg-surface-base max-h-48 overflow-y-auto">
                <KvpEditor v-model="selectedRoute.headers" />
              </div>
            </div>

            <div class="flex flex-1 flex-col">
              <label class="mb-1 block text-[11px] font-medium text-text-secondary">
                Response Body (JSON / Text)
              </label>
              <textarea
                v-model="selectedRoute.body"
                data-test="mock-route-body-input"
                rows="12"
                spellcheck="false"
                class="w-full flex-1 resize-y rounded border border-border-default bg-surface-input p-3 font-mono text-xs leading-relaxed text-text-primary focus:border-brand-primary focus:outline-none"
                placeholder='{"status":"ok"}'
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
