<script lang="ts" setup>
import { ref, computed, watch } from "vue"
import { useResponseStore } from '@/stores/responseStore'
import EmptyStateResponse from './EmptyStateResponse.vue'
import ResponseMetaBar from './ResponseMetaBar.vue'
import JsonViewer from './JsonViewer.vue'
import ResponseErrorState from './ResponseErrorState.vue'
import HeadersTable from './HeadersTable.vue'
import { formatSize } from '@/utils/responseMeta'
import { flattenHeaders } from '@/utils/responseHeaders'
import { isJsonContentType, tryParseJson, formatJsonText } from '@/utils/jsonHighlight'
import { isXmlContentType, tryParseXml, formatXmlText } from '@/utils/xmlUtils'
import { ClipboardSetText } from '../../wailsjs/runtime/runtime'
import { useUiStore } from '@/stores/uiStore'

const responseStore = useResponseStore()
const uiStore = useUiStore()
const activeTab = ref<'body' | 'headers' | 'logs'>('body')
const expandedLogIds = ref<Record<string, boolean>>({})

const headersCount = computed(() => flattenHeaders(responseStore.response?.headers).length)
const logsCount = computed(() =>
  responseStore.executionLogs.length > 0
    ? responseStore.executionLogs.length
    : responseStore.scriptLogs.length
)

const isEmptyResponse = computed(() => {
  const res = responseStore.response
  return res && (res.status_code === 204 || res.size_bytes === 0)
})

const mode = ref<'pretty' | 'raw'>('raw')
const copyStatus = ref<'idle' | 'copied'>('idle')

const PRETTY_DEFAULT_MAX_BYTES = 15 * 1024 * 1024
const isOversized = computed(() => (responseStore.response?.size_bytes || 0) > PRETTY_DEFAULT_MAX_BYTES)
const isValidJson = computed(() => tryParseJson(responseStore.response?.body || ''))
const isValidXml = computed(() => tryParseXml(responseStore.response?.body || ''))
const canBePretty = computed(() => !isOversized.value && (isValidJson.value || isValidXml.value))

watch(() => responseStore.response, (newRes: any) => {
  if (newRes && canBePretty.value) {
    mode.value = 'pretty'
  } else {
    mode.value = 'raw'
  }
}, { immediate: true })

const copyBody = async () => {
  const res = responseStore.response
  if (!res) return
  try {
    let textToCopy = res.body
    if (mode.value === 'pretty') {
      if (isValidJson.value) {
        textToCopy = formatJsonText(res.body)
      } else if (isValidXml.value) {
        textToCopy = formatXmlText(res.body)
      }
    }
    const success = await ClipboardSetText(textToCopy)
    if (success) {
      copyStatus.value = 'copied'
      uiStore.showToast('Đã sao chép', 2000)
      setTimeout(() => { copyStatus.value = 'idle' }, 1500)
    } else {
      uiStore.showToast('Không thể sao chép')
    }
  } catch {
    uiStore.showToast('Không thể sao chép')
  }
}

const isBinaryResponse = computed(() => {
  const res = responseStore.response
  return res && res.is_binary
})

const handleBodyKeydown = async (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
    const selection = window.getSelection()?.toString()
    if (selection && selection.length > 0) return

    const body = responseStore.response?.body
    if (body) {
      e.preventDefault()
      try {
        const success = await ClipboardSetText(body)
        if (success) {
          uiStore.showToast('Đã sao chép')
        }
      } catch {
        // ignore
      }
    }
  }
}

const toggleLogDetail = (id: string) => {
  expandedLogIds.value[id] = !expandedLogIds.value[id]
}

const formatLogTime = (iso: string) => {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleTimeString('vi-VN', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0')
  } catch {
    return iso
  }
}

const phaseLabel = (phase: string) => {
  if (phase === 'pre-request') return 'PRE-SCRIPT'
  if (phase === 'post-response') return 'POST-SCRIPT'
  return 'HTTP'
}

const phaseBadgeClass = (phase: string) => {
  if (phase === 'pre-request') return 'bg-amber-500/15 text-amber-300 border-amber-500/30'
  if (phase === 'post-response') return 'bg-purple-500/15 text-purple-300 border-purple-500/30'
  return 'bg-sky-500/15 text-sky-300 border-sky-500/30'
}

const levelBadgeClass = (level: string) => {
  if (level === 'error') return 'bg-red-500/20 text-red-300 border-red-500/40'
  if (level === 'warn') return 'bg-amber-500/20 text-amber-300 border-amber-500/40'
  if (level === 'info') return 'bg-sky-500/20 text-sky-300 border-sky-500/40'
  return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
}
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden">
    <div v-if="responseStore.loading" class="flex-1 flex flex-col items-center justify-center gap-3 p-4" aria-live="polite">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
      <div class="text-text-secondary text-sm">Đang tải...</div>
    </div>
    
    <div v-else-if="responseStore.response || responseStore.error || logsCount > 0 || responseStore.scriptError" class="flex-1 flex flex-col overflow-hidden">
      
      <div class="flex items-center justify-between border-b border-border-default shrink-0 h-10 pr-4">
        <!-- Left: Tabs -->
        <div class="flex items-center h-full">
          <div class="flex h-full" role="tablist" aria-label="Response tabs">
            <button
              role="tab"
              :aria-selected="activeTab === 'body'"
              aria-controls="panel-body"
              id="tab-body"
              @click="activeTab = 'body'"
              class="flex items-center gap-2 px-4 h-10 border-b-2 outline-none font-medium ui-sm"
              :class="[
                activeTab === 'body' 
                  ? 'border-emerald-500 text-emerald-400' 
                  : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border-subtle'
              ]"
            >
              Body
            </button>
            <button
              role="tab"
              :aria-selected="activeTab === 'headers'"
              aria-controls="panel-headers"
              id="tab-headers"
              @click="activeTab = 'headers'"
              class="flex items-center gap-2 px-4 h-10 border-b-2 outline-none font-medium ui-sm"
              :class="[
                activeTab === 'headers' 
                  ? 'border-emerald-500 text-emerald-400' 
                  : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border-subtle'
              ]"
            >
              Headers
              <span 
                v-if="headersCount > 0" 
                class="flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[9px] font-bold"
                :class="activeTab === 'headers' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-surface-raised text-text-secondary'"
              >
                {{ headersCount }}
              </span>
            </button>
            <button
              role="tab"
              data-test="response-tab-logs"
              :aria-selected="activeTab === 'logs'"
              aria-controls="panel-logs"
              id="tab-logs"
              @click="activeTab = 'logs'"
              class="flex items-center gap-2 px-4 h-10 border-b-2 outline-none font-medium ui-sm"
              :class="[
                activeTab === 'logs' 
                  ? 'border-emerald-500 text-emerald-400' 
                  : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border-subtle'
              ]"
            >
              Console / Logs
              <span 
                v-if="logsCount > 0" 
                class="flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[9px] font-bold"
                :class="activeTab === 'logs' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-surface-raised text-text-secondary'"
              >
                {{ logsCount }}
              </span>
            </button>
          </div>
        </div>

        <!-- Right: Meta -->
        <div v-if="responseStore.response" class="flex items-center">
          <ResponseMetaBar :response="responseStore.response" />
        </div>
      </div>

      <!-- Sub-toolbar for Body Tab: Pretty/Raw & Copy -->
      <div 
        v-if="activeTab === 'body' && responseStore.response && !isEmptyResponse && !isBinaryResponse" 
        data-test="response-body-subtoolbar"
        class="flex items-center justify-between px-4 py-1.5 border-b border-border-default bg-surface-base/60 shrink-0 min-h-[36px]"
      >
        <!-- Left: Pretty | Raw -->
        <div class="flex items-center gap-2">
          <div class="flex bg-surface-base border border-border-default rounded-md overflow-hidden" role="radiogroup" aria-label="View mode">
            <button 
              role="radio" 
              :aria-checked="mode === 'pretty'"
              @click="canBePretty && (mode = 'pretty')"
              class="ui-xs px-[10px] py-[4px] min-h-[26px] min-w-[56px] transition-colors outline-none"
              :class="[
                mode === 'pretty' ? 'bg-surface-overlay text-white' : 'text-text-secondary hover:text-text-primary',
                !canBePretty ? 'opacity-50 cursor-not-allowed' : ''
              ]"
              :disabled="!canBePretty"
              :title="!canBePretty ? 'Không phải JSON hoặc XML hợp lệ' : ''"
            >
              Pretty
            </button>
            <div class="w-px bg-border-default"></div>
            <button 
              role="radio" 
              :aria-checked="mode === 'raw'"
              @click="mode = 'raw'"
              class="ui-xs px-[10px] py-[4px] min-h-[26px] min-w-[56px] transition-colors outline-none"
              :class="mode === 'raw' ? 'bg-surface-overlay text-white' : 'text-text-secondary hover:text-text-primary'"
            >
              Raw
            </button>
          </div>
        </div>

        <!-- Right: Copy -->
        <button 
          data-test="copy-response-btn"
          @click="copyBody" 
          class="flex items-center gap-1.5 ui-xs text-text-secondary hover:text-text-primary transition-colors px-2 py-1 rounded hover:bg-surface-hover outline-none"
        >
          <svg v-if="copyStatus === 'idle'" class="w-3.5 h-3.5" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
            <path d="M216,32H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z" />
          </svg>
          <svg v-else class="w-3.5 h-3.5 text-status-2xx" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
            <path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z" />
          </svg>
          Sao chép
        </button>
      </div>

      <div class="flex-1 flex flex-col min-h-0 relative">
        <div 
          v-show="activeTab === 'body'" 
          class="absolute inset-0 flex flex-col focus:outline-none" 
          id="panel-body" 
          role="tabpanel" 
          aria-labelledby="tab-body"
          tabindex="0"
          @keydown="handleBodyKeydown"
        >
          <ResponseErrorState v-if="responseStore.error && !responseStore.response" :error="responseStore.error" />
          <EmptyStateResponse v-else-if="!responseStore.response" />
          <template v-else>
            <div v-if="responseStore.response.truncated" class="mx-4 mt-4 mb-3 p-3 bg-warning-bg border border-warning-border rounded text-warning-text text-sm shrink-0">
              Phản hồi quá lớn và đã bị cắt bớt (tối đa 10MB).
            </div>
            
            <div v-if="isEmptyResponse" class="flex-1 flex items-center justify-center text-text-secondary ui-sm">
              Response không có body.
            </div>
            <div v-else-if="isBinaryResponse" class="flex-1 flex flex-col items-center justify-center text-text-secondary gap-2 p-4">
              <svg class="w-12 h-12 text-text-muted" viewBox="0 0 256 256" fill="currentColor">
                <path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Z"/>
                <path d="M96,128a8,8,0,0,1,8-8h48a8,8,0,0,1,0,16H104A8,8,0,0,1,96,128Zm0,32a8,8,0,0,1,8-8h48a8,8,0,0,1,0,16H104A8,8,0,0,1,96,160Zm0,32a8,8,0,0,1,8-8h24a8,8,0,0,1,0,16H104A8,8,0,0,1,96,192Z" opacity="0.2"/>
              </svg>
              <div class="ui-sm font-medium">Response dạng nhị phân ({{ formatSize(responseStore.response?.size_bytes ?? 0) }}) — không hiển thị nội dung.</div>
            </div>
            <JsonViewer v-else :response="responseStore.response" :mode="mode" />
          </template>
        </div>
        <div v-show="activeTab === 'headers'" class="absolute inset-0" id="panel-headers" role="tabpanel" aria-labelledby="tab-headers">
          <HeadersTable v-if="responseStore.response" :headers="responseStore.response.headers" />
          <div v-else class="flex items-center justify-center h-full text-text-muted text-xs">Chưa có phản hồi HTTP.</div>
        </div>
        <div
          v-show="activeTab === 'logs'"
          class="absolute inset-0 overflow-y-auto p-4 space-y-3"
          id="panel-logs"
          data-test="response-logs-panel"
          role="tabpanel"
          aria-labelledby="tab-logs"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Bảng nhật ký thực thi Request &amp; Script (Execution &amp; Console Logs)
            </span>
            <button
              v-if="logsCount > 0 || responseStore.scriptError"
              type="button"
              data-test="clear-response-logs-btn"
              class="text-xs text-text-muted hover:text-text-primary px-2 py-1 rounded hover:bg-surface-hover cursor-pointer"
              @click="responseStore.clearLogs()"
            >
              Xóa log
            </button>
          </div>

          <div
            v-if="responseStore.scriptError"
            class="rounded bg-red-950/50 border border-red-500/40 px-3 py-2 font-mono text-xs text-red-300"
          >
            {{ responseStore.scriptError }}
          </div>

          <div v-if="responseStore.executionLogs.length > 0" class="border border-border-default rounded-md overflow-hidden bg-surface-base">
            <table class="w-full text-left border-collapse font-mono text-xs" data-test="execution-logs-table">
              <thead>
                <tr class="border-b border-border-default bg-surface-raised text-text-muted text-[11px]">
                  <th class="py-2 px-3 w-28">Thời gian</th>
                  <th class="py-2 px-3 w-28">Giai đoạn</th>
                  <th class="py-2 px-3 w-20">Mức độ</th>
                  <th class="py-2 px-3">Nội dung chi tiết</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border-subtle">
                <template v-for="item in responseStore.executionLogs" :key="item.id">
                  <tr class="hover:bg-surface-hover/50">
                    <td class="py-2 px-3 text-text-muted whitespace-nowrap align-top">
                      {{ formatLogTime(item.timestamp) }}
                    </td>
                    <td class="py-2 px-3 align-top">
                      <span
                        class="inline-block px-1.5 py-0.5 rounded border text-[10px] font-semibold"
                        :class="phaseBadgeClass(item.phase)"
                      >
                        {{ phaseLabel(item.phase) }}
                      </span>
                    </td>
                    <td class="py-2 px-3 align-top">
                      <span
                        class="inline-block px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase"
                        :class="levelBadgeClass(item.level)"
                      >
                        {{ item.level }}
                      </span>
                    </td>
                    <td class="py-2 px-3 text-text-primary break-all align-top">
                      <div class="flex items-start justify-between gap-2">
                        <span>{{ item.message }}</span>
                        <button
                          v-if="item.detail"
                          type="button"
                          data-test="toggle-http-log-detail-btn"
                          class="text-[11px] text-brand-primary hover:underline shrink-0 cursor-pointer"
                          @click="toggleLogDetail(item.id)"
                        >
                          {{ expandedLogIds[item.id] ? 'Ẩn chi tiết' : 'Chi tiết HTTP' }}
                        </button>
                      </div>
                      <div
                        v-if="item.detail && expandedLogIds[item.id]"
                        class="mt-2 p-2.5 rounded bg-surface-input border border-border-default space-y-2 text-[11px]"
                        data-test="http-log-detail-box"
                      >
                        <div>
                          <div class="font-semibold text-sky-400 mb-1">Request gửi đi:</div>
                          <div class="text-text-secondary">{{ item.detail.method }} {{ item.detail.url }}</div>
                          <div v-if="item.detail.requestHeaders?.length" class="mt-1 space-y-0.5">
                            <div v-for="(h, hIdx) in item.detail.requestHeaders" :key="hIdx" class="text-text-muted">
                              <span class="text-text-secondary">{{ h.key }}:</span> {{ h.value }}
                            </div>
                          </div>
                          <pre v-if="item.detail.requestBody" class="mt-1 p-1.5 rounded bg-surface-base text-amber-200 overflow-x-auto whitespace-pre-wrap">{{ item.detail.requestBody }}</pre>
                        </div>
                        <div v-if="item.detail.statusCode !== undefined" class="pt-2 border-t border-border-subtle">
                          <div class="font-semibold text-emerald-400 mb-1">
                            Response nhận về: {{ item.detail.statusCode }} {{ item.detail.statusText }} ({{ item.detail.timeMs }}ms)
                          </div>
                          <pre v-if="item.detail.responseBodyPreview" class="mt-1 p-1.5 rounded bg-surface-base text-emerald-200 overflow-x-auto whitespace-pre-wrap">{{ item.detail.responseBodyPreview }}</pre>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>

          <div
            v-else-if="responseStore.scriptLogs.length > 0"
            class="rounded border border-border-default bg-surface-base p-3 font-mono text-xs space-y-1 text-emerald-300"
          >
            <div v-for="(line, idx) in responseStore.scriptLogs" :key="idx">{{ line }}</div>
          </div>

          <div v-else class="text-xs text-text-muted font-mono py-6 text-center">
            Chưa có log thực thi. Hãy gửi request hoặc dùng console.log(...) trong Script để debug.
          </div>
        </div>
      </div>
    </div>
    
    <div v-else class="flex-1 p-4">
      <EmptyStateResponse />
    </div>
  </div>
</template>
