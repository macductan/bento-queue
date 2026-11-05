<script lang="ts" setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from "vue"
import { useResponseStore, type ExecuteResponse, type ExecutionLogRecord } from '@/stores/responseStore'
import EmptyStateResponse from './EmptyStateResponse.vue'
import ResponseMetaBar from './ResponseMetaBar.vue'
import JsonViewer from './JsonViewer.vue'
import ResponseErrorState from './ResponseErrorState.vue'
import HeadersTable from './HeadersTable.vue'
import { formatSize } from '@/utils/responseMeta'
import { flattenHeaders } from '@/utils/responseHeaders'
import { tryParseJson, formatJsonText } from '@/utils/jsonHighlight'
import { tryParseXml, formatXmlText } from '@/utils/xmlUtils'
import { ClipboardSetText } from '../../wailsjs/runtime/runtime'
import { useUiStore } from '@/stores/uiStore'
import { useI18n } from '@/i18n'

export interface ResponseViewerOverrideData {
  response?: ExecuteResponse | null
  error?: { code: string; message: string } | string | null
  executionLogs?: ExecutionLogRecord[]
  scriptLogs?: string[]
  scriptError?: string | null
  testResults?: Array<{ name: string; passed: boolean; error?: string }>
  loading?: boolean
}

const props = defineProps<{
  overrideData?: ResponseViewerOverrideData
}>()

const responseStore = useResponseStore()
const uiStore = useUiStore()
const { t } = useI18n()
const activeTab = ref<'body' | 'headers' | 'logs' | 'tests'>('body')
const expandedLogIds = ref<Record<string, boolean>>({})

const isOverrideMode = computed(() => props.overrideData !== undefined)
const currentLoading = computed(() =>
  isOverrideMode.value ? Boolean(props.overrideData?.loading) : responseStore.loading
)
const currentResponse = computed(() =>
  isOverrideMode.value ? (props.overrideData?.response ?? null) : responseStore.response
)
const currentError = computed<{ code: string; message: string } | null>(() => {
  if (!isOverrideMode.value) return responseStore.error
  const err = props.overrideData?.error
  if (!err) return null
  if (typeof err === 'string') {
    return { code: 'EXECUTION_ERROR', message: err }
  }
  return err
})
const currentExecutionLogs = computed(() =>
  isOverrideMode.value ? (props.overrideData?.executionLogs ?? []) : responseStore.executionLogs
)
const currentScriptLogs = computed(() =>
  isOverrideMode.value ? (props.overrideData?.scriptLogs ?? []) : responseStore.scriptLogs
)
const currentScriptError = computed(() =>
  isOverrideMode.value ? (props.overrideData?.scriptError ?? null) : responseStore.scriptError
)
const currentTestResults = computed(() =>
  isOverrideMode.value ? (props.overrideData?.testResults ?? []) : []
)
const testsPassedCount = computed(() =>
  currentTestResults.value.filter(t => t.passed).length
)

const headersCount = computed(() => flattenHeaders(currentResponse.value?.headers).length)
const logsCount = computed(() =>
  currentExecutionLogs.value.length > 0
    ? currentExecutionLogs.value.length
    : currentScriptLogs.value.length
)

const isEmptyResponse = computed(() => {
  const res = currentResponse.value
  return res && (res.status_code === 204 || res.size_bytes === 0)
})

const mode = ref<'pretty' | 'raw'>('raw')
const copyStatus = ref<'idle' | 'copied'>('idle')

const PRETTY_DEFAULT_MAX_BYTES = 15 * 1024 * 1024
const isOversized = computed(() => (currentResponse.value?.size_bytes || 0) > PRETTY_DEFAULT_MAX_BYTES)
const isValidJson = computed(() => tryParseJson(currentResponse.value?.body || ''))
const isValidXml = computed(() => tryParseXml(currentResponse.value?.body || ''))
const canBePretty = computed(() => !isOversized.value && (isValidJson.value || isValidXml.value))

watch(() => currentResponse.value, (newRes: any) => {
  if (newRes && canBePretty.value) {
    mode.value = 'pretty'
  } else {
    mode.value = 'raw'
  }
}, { immediate: true })

watch(() => currentTestResults.value.length, (len) => {
  if (len === 0 && activeTab.value === 'tests') {
    activeTab.value = 'body'
  }
})

const copyBody = async () => {
  const res = currentResponse.value
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
  const res = currentResponse.value
  return res && res.is_binary
})

const canSearchResponse = computed(() =>
  Boolean(currentResponse.value && !isEmptyResponse.value && !isBinaryResponse.value)
)

const isSearchOpen = ref(false)
const searchQuery = ref('')
const searchCaseSensitive = ref(false)
const activeMatchIndex = ref(0)
const totalMatches = ref(0)
const searchInputRef = ref<HTMLInputElement | null>(null)
const jsonViewerRef = ref<InstanceType<typeof JsonViewer> | null>(null)
const viewerRootRef = ref<HTMLElement | null>(null)
const panelBodyRef = ref<HTMLElement | null>(null)

watch([searchQuery, searchCaseSensitive], () => {
  activeMatchIndex.value = 0
})

watch(() => currentResponse.value, () => {
  activeMatchIndex.value = 0
})

watch(canSearchResponse, (canSearch) => {
  if (!canSearch) {
    isSearchOpen.value = false
    totalMatches.value = 0
    activeMatchIndex.value = 0
  }
})

const openSearch = () => {
  if (!canSearchResponse.value) return
  if (activeTab.value !== 'body') {
    activeTab.value = 'body'
  }
  isSearchOpen.value = true
  nextTick(() => {
    searchInputRef.value?.focus()
    searchInputRef.value?.select()
  })
}

const closeSearch = () => {
  const wasInputFocused = document.activeElement === searchInputRef.value
  isSearchOpen.value = false
  if (wasInputFocused) {
    nextTick(() => {
      panelBodyRef.value?.focus()
    })
  }
}

const toggleSearch = () => {
  if (isSearchOpen.value) {
    closeSearch()
  } else {
    openSearch()
  }
}

const toggleCaseSensitive = () => {
  searchCaseSensitive.value = !searchCaseSensitive.value
}

const handleMatchCountUpdate = (count: number) => {
  totalMatches.value = count
  if (count === 0 || activeMatchIndex.value >= count) {
    activeMatchIndex.value = 0
  }
}

const nextMatch = () => {
  if (totalMatches.value <= 0) return
  const nextIdx = (activeMatchIndex.value + 1) % totalMatches.value
  if (nextIdx === activeMatchIndex.value) {
    jsonViewerRef.value?.scrollToActiveMatch()
  } else {
    activeMatchIndex.value = nextIdx
  }
}

const prevMatch = () => {
  if (totalMatches.value <= 0) return
  const prevIdx = (activeMatchIndex.value - 1 + totalMatches.value) % totalMatches.value
  if (prevIdx === activeMatchIndex.value) {
    jsonViewerRef.value?.scrollToActiveMatch()
  } else {
    activeMatchIndex.value = prevIdx
  }
}

const handleSearchInputKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    if (e.shiftKey) {
      prevMatch()
    } else {
      nextMatch()
    }
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    closeSearch()
  }
}

const handleShortcutKeydown = (e: KeyboardEvent): boolean => {
  if (e.defaultPrevented || currentLoading.value) return false
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
    if (canSearchResponse.value) {
      e.preventDefault()
      openSearch()
      return true
    }
  } else if (e.key === 'Escape' && isSearchOpen.value && activeTab.value === 'body' && canSearchResponse.value) {
    e.preventDefault()
    closeSearch()
    return true
  }
  return false
}

const hasActiveGlobalOverlay = () =>
  Boolean(
    uiStore.confirm ||
      uiStore.unsavedPrompt ||
      uiStore.contextMenu ||
      uiStore.envModalOpen ||
      uiStore.settingsModalOpen ||
      uiStore.gitSyncModalOpen ||
      uiStore.gitConflictModalOpen ||
      uiStore.historyModalOpen ||
      uiStore.mockServerModalOpen ||
      uiStore.importError
  )

const isExternalEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false
  if (viewerRootRef.value?.contains(target)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}

const handleWindowKeydown = (e: KeyboardEvent) => {
  if (e.defaultPrevented || currentLoading.value) return
  if (!viewerRootRef.value?.isConnected) return
  if (!isOverrideMode.value && uiStore.responsePaneCollapsed) return
  if (hasActiveGlobalOverlay()) return
  if (isExternalEditableTarget(e.target)) return
  handleShortcutKeydown(e)
}

onMounted(() => {
  window.addEventListener('keydown', handleWindowKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWindowKeydown)
})

const handleBodyKeydown = async (e: KeyboardEvent) => {
  if (handleShortcutKeydown(e)) {
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
    const selection = window.getSelection()?.toString()
    if (selection && selection.length > 0) return

    const body = currentResponse.value?.body
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
  <div ref="viewerRootRef" class="h-full flex flex-col overflow-hidden" @keydown="handleShortcutKeydown">
    <div v-if="currentLoading" class="flex-1 flex flex-col items-center justify-center gap-3 p-4" aria-live="polite">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary"></div>
      <div class="text-text-secondary text-sm">Đang tải...</div>
    </div>
    
    <div v-else-if="currentResponse || currentError || logsCount > 0 || currentScriptError || currentTestResults.length > 0" class="flex-1 flex flex-col overflow-hidden">
      
      <div
        class="flex border-b border-border-default shrink-0"
        :class="isOverrideMode ? 'flex-col items-stretch' : 'h-10 pr-4 items-center justify-between'"
      >
        <!-- Left: Tabs -->
        <div class="flex items-center" :class="isOverrideMode ? 'h-9 px-1 overflow-x-auto' : 'h-full'">
          <div class="flex h-full items-center" role="tablist" aria-label="Response tabs">
            <button
              role="tab"
              :aria-selected="activeTab === 'body'"
              aria-controls="panel-body"
              id="tab-body"
              @click="activeTab = 'body'"
              class="flex items-center gap-1.5 h-full border-b-2 outline-none font-medium whitespace-nowrap shrink-0"
              :class="[
                isOverrideMode ? 'px-2.5 text-xs' : 'px-4 ui-sm',
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
              class="flex items-center gap-1.5 h-full border-b-2 outline-none font-medium whitespace-nowrap shrink-0"
              :class="[
                isOverrideMode ? 'px-2.5 text-xs' : 'px-4 ui-sm',
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
              v-if="currentTestResults.length > 0"
              role="tab"
              data-test="response-tab-tests"
              :aria-selected="activeTab === 'tests'"
              aria-controls="panel-tests"
              id="tab-tests"
              @click="activeTab = 'tests'"
              class="flex items-center gap-1.5 h-full border-b-2 outline-none font-medium whitespace-nowrap shrink-0"
              :class="[
                isOverrideMode ? 'px-2.5 text-xs' : 'px-4 ui-sm',
                activeTab === 'tests' 
                  ? 'border-emerald-500 text-emerald-400' 
                  : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border-subtle'
              ]"
            >
              Tests ({{ testsPassedCount }}/{{ currentTestResults.length }})
              <span
                class="flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[9px] font-bold"
                :class="testsPassedCount === currentTestResults.length ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'"
              >
                {{ testsPassedCount }}/{{ currentTestResults.length }}
              </span>
            </button>
            <button
              role="tab"
              data-test="response-tab-logs"
              :aria-selected="activeTab === 'logs'"
              aria-controls="panel-logs"
              id="tab-logs"
              @click="activeTab = 'logs'"
              class="flex items-center gap-1.5 h-full border-b-2 outline-none font-medium whitespace-nowrap shrink-0"
              :class="[
                isOverrideMode ? 'px-2.5 text-xs' : 'px-4 ui-sm',
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

        <!-- Right: Meta & Actions -->
        <div
          v-if="currentResponse || !isOverrideMode"
          class="flex items-center gap-2"
          :class="isOverrideMode ? 'px-3 py-1.5 border-t border-border-default/60 bg-surface-base/40 justify-between' : ''"
        >
          <ResponseMetaBar v-if="currentResponse" :response="currentResponse" />
          <button
            v-if="!isOverrideMode"
            type="button"
            data-test="collapse-response-btn"
            @click="uiStore.setResponsePaneCollapsed(true)"
            :title="t('responseViewer.collapseResponse')"
            :aria-label="t('responseViewer.collapseResponse')"
            class="flex items-center justify-center p-1.5 rounded hover:bg-surface-raised text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Sub-toolbar for Body Tab: Pretty/Raw & Copy -->
      <div 
        v-if="activeTab === 'body' && currentResponse && !isEmptyResponse && !isBinaryResponse" 
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
              :title="!canBePretty ? t('responseViewer.invalidJsonOrXml') : ''"
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

        <!-- Right: Search & Copy -->
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            data-test="toggle-response-search-btn"
            :aria-pressed="isSearchOpen"
            :title="t('responseViewer.searchShortcut')"
            @click="toggleSearch"
            class="flex items-center gap-1.5 ui-xs transition-colors px-2 py-1 rounded border outline-none cursor-pointer"
            :class="
              isSearchOpen
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover border-transparent'
            "
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            {{ t('common.search') }}
          </button>

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
            {{ copyStatus === 'idle' ? t('common.copy') : t('common.copied') }}
          </button>
        </div>
      </div>

      <!-- Search Bar for Body Tab -->
      <div
        v-if="activeTab === 'body' && isSearchOpen && canSearchResponse"
        data-test="response-search-bar"
        class="flex items-center gap-2 px-4 py-1.5 border-b border-border-default bg-surface-raised/80 shrink-0"
      >
        <div class="relative flex items-center flex-1 max-w-xs">
          <svg class="w-3.5 h-3.5 text-text-muted absolute left-2.5 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            data-test="response-search-input"
            :placeholder="t('responseViewer.searchPlaceholder')"
            :aria-label="t('responseViewer.searchPlaceholder')"
            @keydown="handleSearchInputKeydown"
            class="w-full pl-8 pr-8 py-1 text-xs font-mono bg-surface-input border border-border-default rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:border-emerald-500/60"
          />
          <button
            type="button"
            data-test="response-search-case-btn"
            :aria-pressed="searchCaseSensitive"
            :title="t('responseViewer.matchCase')"
            @click="toggleCaseSensitive"
            class="absolute right-1.5 px-1 py-0.5 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer"
            :class="
              searchCaseSensitive
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-text-muted hover:text-text-primary hover:bg-surface-hover border border-transparent'
            "
          >
            Aa
          </button>
        </div>

        <span
          data-test="response-search-count"
          class="text-xs font-mono min-w-[44px] text-center select-none"
          :class="searchQuery && totalMatches === 0 ? 'text-rose-400' : 'text-text-secondary'"
        >
          {{ totalMatches > 0 ? `${activeMatchIndex + 1}/${totalMatches}` : '0/0' }}
        </span>

        <div class="flex items-center gap-0.5">
          <button
            type="button"
            data-test="response-search-prev-btn"
            :title="t('responseViewer.prevResultShortcut')"
            :aria-label="t('responseViewer.prevResult')"
            :disabled="totalMatches === 0"
            @click="prevMatch"
            class="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
          <button
            type="button"
            data-test="response-search-next-btn"
            :title="t('responseViewer.nextResultShortcut')"
            :aria-label="t('responseViewer.nextResult')"
            :disabled="totalMatches === 0"
            @click="nextMatch"
            class="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>

        <button
          type="button"
          data-test="response-search-close-btn"
          :title="t('responseViewer.closeSearchShortcut')"
          :aria-label="t('responseViewer.closeSearch')"
          @click="closeSearch"
          class="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div class="flex-1 flex flex-col min-h-0 relative">
        <div 
          ref="panelBodyRef"
          v-show="activeTab === 'body'" 
          class="absolute inset-0 flex flex-col focus:outline-none" 
          id="panel-body" 
          role="tabpanel" 
          aria-labelledby="tab-body"
          tabindex="0"
          @keydown="handleBodyKeydown"
        >
          <ResponseErrorState v-if="currentError && !currentResponse" :error="currentError" />
          <EmptyStateResponse v-else-if="!currentResponse" />
          <template v-else>
            <div v-if="currentResponse.truncated" class="mx-4 mt-4 mb-3 p-3 bg-warning-bg border border-warning-border rounded text-warning-text text-sm shrink-0">
              {{ t('responseViewer.truncatedWarning') }}
            </div>
            
            <div v-if="isEmptyResponse" class="flex-1 flex items-center justify-center text-text-secondary ui-sm">
              {{ t('responseViewer.noBody') }}
            </div>
            <div v-else-if="isBinaryResponse" class="flex-1 flex flex-col items-center justify-center text-text-secondary gap-2 p-4">
              <svg class="w-12 h-12 text-text-muted" viewBox="0 0 256 256" fill="currentColor">
                <path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Z"/>
                <path d="M96,128a8,8,0,0,1,8-8h48a8,8,0,0,1,0,16H104A8,8,0,0,1,96,128Zm0,32a8,8,0,0,1,8-8h48a8,8,0,0,1,0,16H104A8,8,0,0,1,96,160Zm0,32a8,8,0,0,1,8-8h24a8,8,0,0,1,0,16H104A8,8,0,0,1,96,192Z" opacity="0.2"/>
              </svg>
              <div class="ui-sm font-medium">{{ t('responseViewer.binaryResponse', { size: formatSize(currentResponse?.size_bytes ?? 0) }) }}</div>
            </div>
            <JsonViewer
              v-else
              ref="jsonViewerRef"
              :response="currentResponse"
              :mode="mode"
              :search-query="isSearchOpen && activeTab === 'body' ? searchQuery : ''"
              :search-case-sensitive="searchCaseSensitive"
              :active-match-index="activeMatchIndex"
              @update:match-count="handleMatchCountUpdate"
            />
          </template>
        </div>
        <div v-show="activeTab === 'headers'" class="absolute inset-0" id="panel-headers" role="tabpanel" aria-labelledby="tab-headers">
          <HeadersTable v-if="currentResponse" :headers="currentResponse.headers" />
          <div v-else class="flex items-center justify-center h-full text-text-muted text-xs">{{ t('responseViewer.noHttpResponse') }}</div>
        </div>
        <div
          v-if="currentTestResults.length > 0"
          v-show="activeTab === 'tests'"
          class="absolute inset-0 overflow-y-auto p-4 space-y-2"
          id="panel-tests"
          data-test="response-tests-panel"
          role="tabpanel"
          aria-labelledby="tab-tests"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              {{ t('responseViewer.testResults', { passed: testsPassedCount, total: currentTestResults.length }) }}
            </span>
          </div>
          <div
            v-for="(test, idx) in currentTestResults"
            :key="idx"
            data-test="response-test-item"
            class="flex items-start gap-2.5 p-2.5 rounded border text-xs font-mono"
            :class="test.passed ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200' : 'bg-rose-950/30 border-rose-500/40 text-rose-200'"
          >
            <span
              class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0"
              :class="test.passed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'"
            >
              {{ test.passed ? 'PASS' : 'FAIL' }}
            </span>
            <div class="flex-1 min-w-0">
              <div class="font-medium break-words">{{ test.name }}</div>
              <div v-if="test.error" class="mt-1 text-rose-300/90 text-[11px] break-words">
                {{ test.error }}
              </div>
            </div>
          </div>
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
              {{ t('responseViewer.executionLogsTitle') }}
            </span>
            <button
              v-if="!isOverrideMode && (logsCount > 0 || currentScriptError)"
              type="button"
              data-test="clear-response-logs-btn"
              class="text-xs text-text-muted hover:text-text-primary px-2 py-1 rounded hover:bg-surface-hover cursor-pointer"
              @click="responseStore.clearLogs()"
            >
              {{ t('responseViewer.clearLogs') }}
            </button>
          </div>

          <div
            v-if="currentScriptError"
            class="rounded bg-red-950/50 border border-red-500/40 px-3 py-2 font-mono text-xs text-red-300"
          >
            {{ currentScriptError }}
          </div>

          <div v-if="currentExecutionLogs.length > 0" class="border border-border-default rounded-md overflow-hidden bg-surface-base">
            <table class="w-full text-left border-collapse font-mono text-xs" data-test="execution-logs-table">
              <thead>
                <tr class="border-b border-border-default bg-surface-raised text-text-muted text-[11px]">
                  <th class="py-2 px-3 w-28">{{ t('responseViewer.logTime') }}</th>
                  <th class="py-2 px-3 w-28">{{ t('responseViewer.logPhase') }}</th>
                  <th class="py-2 px-3 w-20">{{ t('responseViewer.logLevel') }}</th>
                  <th class="py-2 px-3">{{ t('responseViewer.logDetail') }}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border-subtle">
                <template v-for="item in currentExecutionLogs" :key="item.id">
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
                          {{ expandedLogIds[item.id] ? t('responseViewer.hideDetail') : t('responseViewer.httpDetail') }}
                        </button>
                      </div>
                      <div
                        v-if="item.detail && expandedLogIds[item.id]"
                        class="mt-2 p-2.5 rounded bg-surface-input border border-border-default space-y-2 text-[11px]"
                        data-test="http-log-detail-box"
                      >
                        <div>
                          <div class="font-semibold text-sky-400 mb-1">{{ t('responseViewer.outgoingRequest') }}</div>
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
                            {{ t('responseViewer.incomingResponse') }} {{ item.detail.statusCode }} {{ item.detail.statusText }} ({{ item.detail.timeMs }}ms)
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
            v-else-if="currentScriptLogs.length > 0"
            class="rounded border border-border-default bg-surface-base p-3 font-mono text-xs space-y-1 text-emerald-300"
          >
            <div v-for="(line, idx) in currentScriptLogs" :key="idx">{{ line }}</div>
          </div>

          <div v-else class="text-xs text-text-muted font-mono py-6 text-center">
            {{ t('responseViewer.noLogsHint') }}
          </div>
        </div>
      </div>
    </div>
    
    <div v-else class="flex-1 p-4 relative">
      <button
        v-if="!isOverrideMode"
        type="button"
        data-test="collapse-response-btn"
        @click="uiStore.setResponsePaneCollapsed(true)"
        :title="t('responseViewer.collapseResponse')"
        :aria-label="t('responseViewer.collapseResponse')"
        class="absolute top-2 right-2 p-1.5 rounded hover:bg-surface-raised text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <EmptyStateResponse />
    </div>
  </div>
</template>
