<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useUiStore } from '@/stores/uiStore'
import { useHistoryStore, type ExecutionHistoryEntry } from '@/stores/historyStore'

const uiStore = useUiStore()
const historyStore = useHistoryStore()

const activeTab = ref<'executions' | 'changelog'>('executions')
const searchQuery = ref('')
const selectedExecutionId = ref<string | null>(null)

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && uiStore.historyModalOpen) {
    e.preventDefault()
    e.stopPropagation()
    uiStore.closeHistoryModal()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

watch(
  () => uiStore.historyModalOpen,
  async isOpen => {
    if (isOpen) {
      await historyStore.loadAll()
      if (historyStore.executions.length > 0 && !selectedExecutionId.value) {
        selectedExecutionId.value = historyStore.executions[0]!.id
      }
    }
  },
  { immediate: true }
)

const filteredExecutions = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return historyStore.executions
  return historyStore.executions.filter(
    e =>
      e.url.toLowerCase().includes(q) ||
      e.method.toLowerCase().includes(q) ||
      (e.request_name || '').toLowerCase().includes(q) ||
      String(e.status_code).includes(q)
  )
})

const selectedExecution = computed<ExecutionHistoryEntry | null>(() => {
  if (!filteredExecutions.value.length) return null
  return (
    filteredExecutions.value.find(e => e.id === selectedExecutionId.value) ??
    filteredExecutions.value[0] ??
    null
  )
})

const filteredChangelog = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return historyStore.changelog
  return historyStore.changelog.filter(
    c =>
      c.summary.toLowerCase().includes(q) ||
      c.entity_name.toLowerCase().includes(q) ||
      c.entity_type.toLowerCase().includes(q) ||
      c.action.toLowerCase().includes(q)
  )
})

async function handleRestore(entry: ExecutionHistoryEntry) {
  const ok = await historyStore.restoreExecution(entry)
  if (!ok) return
  uiStore.showToast(`Đã khôi phục request: ${entry.request_name || entry.url}`)
  uiStore.closeHistoryModal()
}

async function handleClearExecutions() {
  const confirmed = await uiStore.requestConfirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử gọi API không?')
  if (!confirmed) return

  const ok = await historyStore.clearExecutions()
  if (ok) {
    selectedExecutionId.value = null
    uiStore.showToast('Đã xóa lịch sử gọi API')
  }
}

async function handleClearChangelog() {
  const confirmed = await uiStore.requestConfirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử thay đổi collection không?')
  if (!confirmed) return

  const ok = await historyStore.clearChangelog()
  if (ok) {
    uiStore.showToast('Đã xóa lịch sử thay đổi')
  }
}

function statusBadgeClass(code: number): string {
  if (code >= 200 && code < 300) return 'text-emerald-400 bg-emerald-500/15'
  if (code >= 300 && code < 400) return 'text-sky-400 bg-sky-500/15'
  if (code >= 400 && code < 500) return 'text-amber-400 bg-amber-500/15'
  if (code >= 500) return 'text-red-400 bg-red-500/15'
  return 'text-text-secondary bg-surface-base'
}

function formatTime(ts: string): string {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleString('vi-VN')
  } catch {
    return ts
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="uiStore.historyModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      data-test="history-modal"
      @click.self="uiStore.closeHistoryModal()"
    >
      <div
        class="flex h-[80vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border-default bg-surface-overlay shadow-2xl"
      >
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-border-default bg-surface-raised px-5 py-3.5">
          <div class="flex items-center gap-4">
            <h2 class="text-sm font-semibold text-text-primary m-0">
              Lịch sử &amp; Nhật ký thay đổi
            </h2>
            <div class="flex items-center rounded bg-surface-base p-0.5 border border-border-default">
              <button
                type="button"
                data-test="history-tab-executions"
                class="rounded px-3 py-1 text-xs font-medium transition-colors cursor-pointer"
                :class="
                  activeTab === 'executions'
                    ? 'bg-brand-primary text-white'
                    : 'text-text-secondary hover:text-text-primary'
                "
                @click="activeTab = 'executions'"
              >
                Lịch sử gọi API ({{ historyStore.executions.length }})
              </button>
              <button
                type="button"
                data-test="history-tab-changelog"
                class="rounded px-3 py-1 text-xs font-medium transition-colors cursor-pointer"
                :class="
                  activeTab === 'changelog'
                    ? 'bg-brand-primary text-white'
                    : 'text-text-secondary hover:text-text-primary'
                "
                @click="activeTab = 'changelog'"
              >
                Nhật ký thay đổi ({{ historyStore.changelog.length }})
              </button>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <input
              v-model="searchQuery"
              type="text"
              data-test="history-search-input"
              placeholder="Tìm theo URL, Method, Tên..."
              class="w-56 rounded border border-border-default bg-surface-input px-2.5 py-1 text-xs text-text-primary focus:border-brand-primary focus:outline-none"
            />
            <button
              v-if="activeTab === 'executions' && historyStore.executions.length > 0"
              type="button"
              data-test="clear-executions-btn"
              class="rounded border border-border-default bg-surface-base px-2.5 py-1 text-xs text-red-400 hover:bg-surface-hover cursor-pointer"
              @click="handleClearExecutions"
            >
              Xóa lịch sử gọi API
            </button>
            <button
              v-if="activeTab === 'changelog' && historyStore.changelog.length > 0"
              type="button"
              data-test="clear-changelog-btn"
              class="rounded border border-border-default bg-surface-base px-2.5 py-1 text-xs text-red-400 hover:bg-surface-hover cursor-pointer"
              @click="handleClearChangelog"
            >
              Xóa lịch sử thay đổi
            </button>
            <button
              type="button"
              data-test="close-history-modal-btn"
              class="rounded px-2 py-1 text-text-muted hover:bg-surface-hover hover:text-text-primary cursor-pointer"
              @click="uiStore.closeHistoryModal()"
            >
              ✕
            </button>
          </div>
        </div>

        <!-- Tab 1: Request Execution History -->
        <div v-if="activeTab === 'executions'" class="flex flex-1 overflow-hidden">
          <div
            v-if="filteredExecutions.length === 0"
            class="flex flex-1 items-center justify-center text-xs text-text-muted"
            data-test="executions-empty-state"
          >
            Chưa có lịch sử gọi API nào trong Collection này.
          </div>

          <template v-else>
            <!-- Left list -->
            <div class="w-2/5 overflow-y-auto border-r border-border-default bg-surface-base">
              <div
                v-for="item in filteredExecutions"
                :key="item.id"
                data-test="execution-entry-row"
                class="cursor-pointer border-b border-border-default px-4 py-2.5 transition-colors hover:bg-surface-hover"
                :class="
                  selectedExecution?.id === item.id
                    ? 'bg-surface-raised border-l-2 border-l-brand-primary'
                    : ''
                "
                @click="selectedExecutionId = item.id"
              >
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2 truncate">
                    <span class="font-mono text-[11px] font-bold text-brand-primary">
                      {{ item.method }}
                    </span>
                    <span class="truncate text-xs font-medium text-text-primary">
                      {{ item.request_name || item.url }}
                    </span>
                  </div>
                  <span
                    class="rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold"
                    :class="statusBadgeClass(item.status_code)"
                  >
                    {{ item.status_code || 'ERR' }}
                  </span>
                </div>
                <div class="mt-1 flex items-center justify-between text-[11px] text-text-muted">
                  <span class="truncate font-mono">{{ item.url }}</span>
                  <span class="shrink-0">{{ item.time_ms }} ms</span>
                </div>
                <div class="mt-0.5 text-[10px] text-text-muted">
                  {{ formatTime(item.timestamp) }}
                </div>
              </div>
            </div>

            <!-- Right detail -->
            <div v-if="selectedExecution" class="flex flex-1 flex-col overflow-y-auto p-4 bg-surface-overlay">
              <div class="mb-3 flex items-center justify-between border-b border-border-default pb-3">
                <div class="min-w-0 flex-1 pr-3">
                  <div class="flex items-center gap-2">
                    <span class="rounded bg-surface-base border border-border-default px-2 py-0.5 font-mono text-xs font-bold text-brand-primary">
                      {{ selectedExecution.method }}
                    </span>
                    <span class="truncate font-mono text-xs text-text-primary">
                      {{ selectedExecution.url }}
                    </span>
                  </div>
                  <div class="mt-1.5 flex items-center gap-4 text-[11px] text-text-secondary">
                    <span>Status: <strong class="text-emerald-400">{{ selectedExecution.status_text || selectedExecution.status_code }}</strong></span>
                    <span>Thời gian: <strong class="text-text-primary">{{ selectedExecution.time_ms }} ms</strong></span>
                    <span>Kích thước: <strong class="text-text-primary">{{ selectedExecution.size_bytes }} B</strong></span>
                  </div>
                </div>
                <button
                  type="button"
                  data-test="restore-execution-btn"
                  class="shrink-0 rounded bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 cursor-pointer"
                  @click="handleRestore(selectedExecution)"
                >
                  Khôi phục Request
                </button>
              </div>

              <div class="space-y-3 text-xs">
                <div>
                  <h4 class="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                    Request Payload
                  </h4>
                  <pre
                    class="max-h-36 overflow-auto rounded border border-border-default bg-surface-base p-3 font-mono text-[11px] text-text-primary m-0"
                  >{{ selectedExecution.request?.body || '(Không có body)' }}</pre>
                </div>

                <div>
                  <h4 class="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                    Response Body
                  </h4>
                  <pre
                    data-test="execution-detail-response-body"
                    class="max-h-60 overflow-auto rounded border border-border-default bg-surface-base p-3 font-mono text-[11px] text-emerald-300 m-0"
                  >{{ selectedExecution.response?.body || '(Trống)' }}</pre>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- Tab 2: Collection Changelog -->
        <div v-else class="flex-1 overflow-y-auto p-4 bg-surface-overlay">
          <div
            v-if="filteredChangelog.length === 0"
            class="flex h-full items-center justify-center text-xs text-text-muted"
            data-test="changelog-empty-state"
          >
            Chưa có nhật ký thay đổi nào trong Collection này.
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="entry in filteredChangelog"
              :key="entry.id"
              data-test="changelog-entry-row"
              class="flex items-center justify-between rounded border border-border-default bg-surface-base px-4 py-2.5"
            >
              <div class="flex items-center gap-3">
                <span
                  class="rounded bg-brand-primary/15 border border-brand-primary/30 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase text-brand-primary"
                >
                  {{ entry.action }}
                </span>
                <div>
                  <div class="text-xs font-medium text-text-primary">
                    {{ entry.summary }}
                  </div>
                  <div class="text-[11px] text-text-muted">
                    Loại: {{ entry.entity_type }} • Tên: {{ entry.entity_name }}
                  </div>
                </div>
              </div>
              <div class="font-mono text-[11px] text-text-muted">
                {{ formatTime(entry.timestamp) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
