<script setup lang="ts">
import { computed } from 'vue'
import { useFlowStore, findRequestInCollectionTree, getMethodBadgeClass } from '../../stores/flowStore'
import { useCollectionStore } from '../../stores/collectionStore'
import { useUiStore } from '../../stores/uiStore'
import ResponseViewer, { type ResponseViewerOverrideData } from '../ResponseViewer.vue'

const flowStore = useFlowStore()
const collectionStore = useCollectionStore()
const uiStore = useUiStore()

const selectedStepLookup = computed(() => {
  if (!flowStore.selectedStepId || !flowStore.currentFlow) return null
  return flowStore.findStepInNodes(flowStore.selectedStepId)
})

const selectedStep = computed(() => {
  return selectedStepLookup.value?.step || null
})

const requestInfo = computed(() => {
  if (!selectedStep.value) return null
  return findRequestInCollectionTree(collectionStore.tree, selectedStep.value.request_id)
})

const stepState = computed(() => {
  if (!selectedStep.value) return null
  return flowStore.stepStates[selectedStep.value.id] || null
})

const isStepStateMatchingCurrentRequest = computed(() => {
  if (!stepState.value || !selectedStep.value) return false
  return !stepState.value.requestId || stepState.value.requestId === selectedStep.value.request_id
})

const displayStepName = computed(() => {
  if (!selectedStep.value) return ''
  const custom = (selectedStep.value as any).name
  if (custom && String(custom).trim()) return String(custom).trim()
  if (requestInfo.value) return requestInfo.value.name
  if (isStepStateMatchingCurrentRequest.value && stepState.value?.requestName) {
    return stepState.value.requestName
  }
  return selectedStep.value.request_id || 'Bước không xác định'
})

const displayMethod = computed(() => {
  if (isStepStateMatchingCurrentRequest.value && stepState.value?.method) {
    return stepState.value.method.toUpperCase()
  }
  if (requestInfo.value) return requestInfo.value.method
  if (stepState.value?.method) return stepState.value.method.toUpperCase()
  return 'GET'
})

const displayUrl = computed(() => {
  if (isStepStateMatchingCurrentRequest.value && stepState.value?.url) {
    return stepState.value.url
  }
  if (requestInfo.value) return requestInfo.value.url
  if (stepState.value?.url) return stepState.value.url
  return ''
})

const effectiveStatusCode = computed<number | null>(() => {
  const code = stepState.value?.statusCode ?? stepState.value?.status_code ?? null
  return typeof code === 'number' && code > 0 ? code : null
})

const effectiveDurationMs = computed<number | null>(() => {
  const dur = stepState.value?.durationMs ?? stepState.value?.duration_ms
  return typeof dur === 'number' ? dur : null
})

const httpStatusCodeBadgeClass = computed(() => {
  const code = effectiveStatusCode.value
  if (!code) return 'bg-zinc-800 text-zinc-400'
  if (code >= 200 && code < 300) return 'bg-emerald-500/15 text-emerald-400'
  if (code >= 300 && code < 400) return 'bg-blue-500/15 text-blue-400'
  if (code >= 400 && code < 500) return 'bg-amber-500/15 text-amber-400'
  return 'bg-red-500/15 text-red-400'
})

const statusLabel = computed(() => {
  const st = stepState.value?.status || 'idle'
  switch (st) {
    case 'passed':
      return 'Passed'
    case 'failed':
      return 'Failed'
    case 'skipped':
      return 'Skipped'
    case 'running':
      return 'Running'
    default:
      return 'Chưa chạy'
  }
})

const statusBadgeClasses = computed(() => {
  const st = stepState.value?.status || 'idle'
  switch (st) {
    case 'passed':
      return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
    case 'failed':
      return 'bg-red-500/20 text-red-400 border-red-500/40'
    case 'skipped':
      return 'bg-zinc-700/50 text-zinc-400 border-zinc-600/50'
    case 'running':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/40'
    default:
      return 'bg-zinc-800 text-zinc-400 border-zinc-700'
  }
})

const testResults = computed(() => {
  return stepState.value?.testResults || []
})

const passedTestsCount = computed(() => {
  return testResults.value.filter(t => t.passed).length
})

const selectedStepViewerData = computed<ResponseViewerOverrideData>(() => {
  const st = stepState.value
  return {
    response: st?.response ?? null,
    error: st?.error ?? null,
    executionLogs: st?.executionLogs ?? [],
    scriptLogs: st?.scriptLogs ?? [],
    scriptError: st?.scriptError ?? null,
    testResults: st?.testResults ?? [],
    loading: st?.status === 'running'
  }
})

const handleOpenOriginalRequest = async () => {
  if (!selectedStep.value) return
  const reqId = selectedStep.value.request_id
  const exists = findRequestInCollectionTree(collectionStore.tree, reqId)
  if (!exists) {
    uiStore.showToast('Request gốc đã bị xóa khỏi Collection')
    return
  }
  uiStore.setWorkspaceMode('apis')
  if (typeof (collectionStore as any).expandPathToNode === 'function') {
    ;(collectionStore as any).expandPathToNode(reqId)
  }
  await collectionStore.selectRequest(reqId)
}

const handleCloseInspector = () => {
  flowStore.selectStep(null)
}
</script>

<template>
  <div
    v-if="selectedStep"
    data-test="step-inspector-panel"
    class="w-96 border-l border-zinc-800 bg-bg-surface flex flex-col shrink-0 h-full overflow-hidden z-20 shadow-2xl"
  >
    <!-- Inspector Header -->
    <div class="px-3 py-2.5 border-b border-zinc-800 bg-zinc-900/90 flex items-center justify-between gap-2 shrink-0">
      <div class="flex items-center gap-1.5 min-w-0 flex-1">
        <span
          data-test="step-inspector-status"
          class="px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase shrink-0"
          :class="statusBadgeClasses"
        >
          {{ statusLabel }}
        </span>

        <span
          data-test="step-inspector-method"
          class="px-1.5 py-0.5 text-[10px] font-bold font-mono rounded shrink-0 uppercase"
          :class="getMethodBadgeClass(displayMethod)"
        >
          {{ displayMethod }}
        </span>

        <span
          data-test="step-inspector-name"
          class="text-xs font-semibold text-zinc-100 truncate min-w-0 flex-1"
          :title="displayStepName"
        >
          {{ displayStepName }}
        </span>
      </div>

      <div class="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          data-test="open-original-request-btn"
          class="px-2 py-1 rounded bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 hover:text-indigo-200 text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer"
          @click="handleOpenOriginalRequest"
        >
          <span>Mở Request gốc ↗</span>
        </button>

        <button
          type="button"
          data-test="close-step-inspector-btn"
          class="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 text-xs transition-colors cursor-pointer"
          title="Đóng bảng chi tiết bước"
          @click="handleCloseInspector"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- Inspector Subheader: URL, HTTP status/duration & ha.test() summary -->
    <div
      v-if="displayUrl || testResults.length > 0 || effectiveStatusCode !== null || effectiveDurationMs !== null"
      class="px-3 py-2 border-b border-zinc-800/80 bg-zinc-900/40 flex flex-col gap-1.5 shrink-0"
    >
      <div
        v-if="displayUrl"
        data-test="step-inspector-url"
        class="text-[11px] text-zinc-400 font-mono truncate"
        :title="displayUrl"
      >
        {{ displayUrl }}
      </div>

      <div
        v-if="effectiveStatusCode !== null || effectiveDurationMs !== null || testResults.length > 0"
        class="flex items-center justify-between gap-2 flex-wrap"
      >
        <div
          v-if="effectiveStatusCode !== null || effectiveDurationMs !== null"
          class="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400"
        >
          <span
            v-if="effectiveStatusCode !== null"
            data-test="step-inspector-http-status"
            class="px-1.5 py-0.5 rounded font-bold text-[10px]"
            :class="httpStatusCodeBadgeClass"
          >
            HTTP {{ effectiveStatusCode }}
          </span>
          <span v-if="effectiveDurationMs !== null" class="text-[10px] text-zinc-400">
            {{ effectiveDurationMs }} ms
          </span>
        </div>

        <!-- ha.test() summary pill -->
        <span
          v-if="testResults.length > 0"
          data-test="step-inspector-tests-summary"
          class="px-2 py-0.5 rounded text-[10px] font-mono shrink-0"
          :class="
            passedTestsCount === testResults.length
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              : 'bg-red-500/15 text-red-400 border border-red-500/30'
          "
        >
          ha.test: {{ passedTestsCount }}/{{ testResults.length }} Passed
        </span>
      </div>
    </div>

    <!-- Embedded ResponseViewer with overrideData -->
    <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
      <ResponseViewer
        :key="selectedStep.id"
        :override-data="selectedStepViewerData"
        class="flex-1 min-h-0"
      />
    </div>
  </div>
</template>
