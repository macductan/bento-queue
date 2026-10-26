<script setup lang="ts">
import { computed } from 'vue'
import { model } from '../../../wailsjs/go/models'
import { useCollectionStore } from '../../stores/collectionStore'
import {
  useFlowStore,
  findRequestInCollectionTree,
  getMethodBadgeClass
} from '../../stores/flowStore'

const props = defineProps<{
  step: model.FlowStep & { name?: string }
  nodeId: string
  parallelIndex?: number
  parallelTotal?: number
}>()

const emit = defineEmits<{
  (e: 'change-request', stepId: string): void
  (e: 'add-parallel', nodeId: string, stepId: string): void
  (e: 'delete-step', stepId: string): void
  (e: 'select-step', stepId: string): void
}>()

const collectionStore = useCollectionStore()
const flowStore = useFlowStore()

const requestInfo = computed(() => {
  return findRequestInCollectionTree(collectionStore.tree, props.step.request_id)
})

const isRequestMissing = computed(() => {
  return !requestInfo.value
})

const stepState = computed(() => {
  return flowStore.stepStates[props.step.id] || null
})

const stepStatus = computed(() => {
  return stepState.value?.status || 'idle'
})

const isSelected = computed(() => {
  return flowStore.selectedStepId === props.step.id
})

const stepTarget = computed(() => props.step)

const stepEnabled = computed({
  get: () => props.step.enabled !== false,
  set: (val: boolean) => {
    stepTarget.value.enabled = val
  }
})

const displayName = computed(() => {
  const customName = (props.step as any).name
  if (customName && String(customName).trim()) {
    return String(customName).trim()
  }
  if (requestInfo.value) {
    return requestInfo.value.name
  }
  return props.step.request_id || 'Request không xác định'
})

const displayMethod = computed(() => {
  if (requestInfo.value) return requestInfo.value.method
  if (stepState.value?.method) return stepState.value.method.toUpperCase()
  return 'REQ'
})

const passedTestsCount = computed(() => {
  const tests = stepState.value?.testResults || []
  return tests.filter(t => t.passed).length
})

const failedTestsCount = computed(() => {
  const tests = stepState.value?.testResults || []
  return tests.filter(t => !t.passed).length
})

const totalTestsCount = computed(() => {
  return (stepState.value?.testResults || []).length
})

const cardStatusClasses = computed(() => {
  const selectedRing = isSelected.value ? 'ring-2 ring-indigo-500/60' : ''
  if (isRequestMissing.value) {
    return `border-red-500 bg-red-950/20 ${selectedRing}`.trim()
  }
  switch (stepStatus.value) {
    case 'running':
      return isSelected.value
        ? 'border-blue-500 bg-blue-950/20 animate-pulse ring-2 ring-indigo-500/60'
        : 'border-blue-500 bg-blue-950/20 animate-pulse ring-1 ring-blue-500/40'
    case 'passed':
      return `border-emerald-500 bg-emerald-950/15 ${selectedRing}`.trim()
    case 'failed':
      return `border-red-500 bg-red-950/20 ${selectedRing}`.trim()
    case 'skipped':
      return `border-zinc-700 bg-zinc-900/50 opacity-60 ${selectedRing}`.trim()
    default:
      return isSelected.value
        ? 'border-indigo-500 bg-zinc-900 ring-2 ring-indigo-500/60'
        : 'border-zinc-700/90 bg-zinc-900 hover:border-zinc-600'
  }
})

const handleSelectStep = () => {
  flowStore.selectStep(props.step.id)
  emit('select-step', props.step.id)
}

const handleUpdateTimeout = (e: Event) => {
  const val = parseInt((e.target as HTMLInputElement).value, 10)
  const target = stepTarget.value as model.FlowStep & { timeout_ms?: number }
  if (Number.isNaN(val) || val <= 0) {
    delete target.timeout_ms
  } else {
    target.timeout_ms = val
  }
}

const handleUpdateStepName = (e: Event) => {
  const val = (e.target as HTMLInputElement).value
  ;(props.step as any).name = val
}

const handleDeleteStep = () => {
  flowStore.deleteStep(props.step.id)
  emit('delete-step', props.step.id)
}
</script>

<template>
  <div
    data-test="flow-step-card"
    :data-step-id="step.id"
    :data-step-status="stepStatus"
    class="w-72 rounded-lg border p-3 transition-all cursor-pointer select-none shadow-sm flex flex-col gap-2"
    :class="[cardStatusClasses, !stepEnabled ? 'opacity-60' : '']"
    @click="handleSelectStep"
  >
    <!-- Top Row: Method Badge, Name, Enabled Checkbox & Actions -->
    <div class="flex items-start justify-between gap-2">
      <div class="flex items-center gap-2 min-w-0 flex-1">
        <input
          v-model="stepEnabled"
          type="checkbox"
          data-test="flow-step-toggle-enabled"
          class="rounded border-zinc-600 bg-zinc-950 text-indigo-500 focus:ring-0 cursor-pointer shrink-0"
          title="Bật/tắt bước này"
          @click.stop
        />

        <span
          v-if="!isRequestMissing"
          data-test="flow-step-method"
          class="px-1.5 py-0.5 text-[10px] font-bold font-mono rounded shrink-0 uppercase"
          :class="getMethodBadgeClass(displayMethod)"
        >
          {{ displayMethod }}
        </span>

        <span
          data-test="flow-step-name"
          class="text-xs font-semibold text-zinc-100 truncate"
          :title="displayName"
        >
          {{ displayName }}
        </span>
      </div>

      <!-- Quick Action Buttons -->
      <div class="flex items-center gap-1 shrink-0" @click.stop>
        <button
          type="button"
          data-test="flow-step-change-request-btn"
          class="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] transition-colors"
          title="Đổi Request khác"
          @click.stop="emit('change-request', step.id)"
        >
          Đổi
        </button>

        <button
          type="button"
          data-test="flow-add-parallel-step-btn"
          class="px-1.5 py-0.5 rounded bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 text-[10px] font-medium transition-colors"
          title="Thêm bước chạy song song cùng hàng (Promise.all)"
          @click.stop="emit('add-parallel', nodeId, step.id)"
        >
          || Song song
        </button>

        <button
          type="button"
          data-test="flow-delete-step-btn"
          class="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-red-900/50 text-zinc-400 hover:text-red-300 text-[10px] transition-colors"
          title="Xóa bước này"
          @click.stop="handleDeleteStep"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- Folder Path or Missing Request Warning -->
    <div v-if="isRequestMissing" class="flex flex-col gap-1.5">
      <div
        data-test="flow-step-missing-warning"
        class="px-2 py-1 rounded bg-red-950/60 border border-red-500/50 text-red-300 text-[11px] font-medium flex items-center justify-between gap-2"
      >
        <span>⚠ Request gốc đã bị xóa</span>
        <button
          type="button"
          class="underline text-[10px] text-red-200 hover:text-white shrink-0"
          @click.stop="emit('change-request', step.id)"
        >
          Chọn lại
        </button>
      </div>
    </div>
    <div v-else class="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
      <span
        data-test="flow-step-folder-path"
        class="truncate font-mono text-[10px] text-zinc-400 bg-zinc-950/60 px-1.5 py-0.5 rounded"
      >
        {{ requestInfo?.breadcrumbPath || 'Root' }}
      </span>
      <span
        v-if="parallelTotal && parallelTotal > 1"
        class="text-[10px] text-indigo-400 font-mono shrink-0"
      >
        #{{ (parallelIndex ?? 0) + 1 }}/{{ parallelTotal }}
      </span>
    </div>

    <!-- Custom step name & timeout overrides -->
    <div class="flex items-center gap-1.5 pt-1 border-t border-zinc-800/80" @click.stop>
      <input
        type="text"
        data-test="flow-step-name-input"
        :value="(step as any).name || ''"
        placeholder="Nhãn bước (tùy chọn)..."
        class="flex-1 min-w-0 bg-zinc-950/70 border border-zinc-800 focus:border-indigo-500 rounded px-1.5 py-0.5 text-[10px] text-zinc-300 placeholder-zinc-600 outline-none"
        @input="handleUpdateStepName"
      />
      <input
        type="number"
        min="0"
        step="100"
        data-test="flow-step-timeout-input"
        :value="step.timeout_ms || ''"
        placeholder="Timeout ms"
        title="Timeout riêng của bước (ms)"
        class="w-20 bg-zinc-950/70 border border-zinc-800 focus:border-indigo-500 rounded px-1.5 py-0.5 text-[10px] text-zinc-300 placeholder-zinc-600 font-mono outline-none"
        @input="handleUpdateTimeout"
      />
    </div>

    <!-- Real-time Execution Status Row -->
    <div
      v-if="stepStatus !== 'idle'"
      data-test="flow-step-execution-badge"
      class="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-zinc-800/80 text-[11px]"
    >
      <!-- Running -->
      <template v-if="stepStatus === 'running'">
        <span class="inline-flex items-center gap-1.5 text-blue-400 font-medium">
          <span class="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></span>
          Đang chạy...
        </span>
      </template>

      <!-- Passed -->
      <template v-else-if="stepStatus === 'passed'">
        <div class="flex items-center gap-1.5">
          <span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold text-[10px]">
            {{ stepState?.statusCode ?? 200 }}
          </span>
          <span class="text-zinc-400 font-mono text-[10px]">
            {{ stepState?.durationMs ?? 0 }} ms
          </span>
        </div>
        <span
          v-if="totalTestsCount > 0"
          data-test="flow-step-tests-passed"
          class="text-emerald-400 font-medium text-[10px]"
        >
          {{ passedTestsCount }}/{{ totalTestsCount }} Tests Passed
        </span>
        <span v-else class="text-emerald-400 font-medium text-[10px]">✓ Passed</span>
      </template>

      <!-- Failed -->
      <template v-else-if="stepStatus === 'failed'">
        <div class="flex items-center gap-1.5 min-w-0">
          <span class="px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 font-mono font-bold text-[10px] shrink-0">
            {{ stepState?.statusCode ? stepState.statusCode : 'ERR' }}
          </span>
          <span
            v-if="stepState?.durationMs !== undefined"
            class="text-zinc-400 font-mono text-[10px] shrink-0"
          >
            {{ stepState.durationMs }} ms
          </span>
        </div>
        <span
          v-if="failedTestsCount > 0"
          data-test="flow-step-tests-failed"
          class="text-red-400 font-medium text-[10px]"
        >
          {{ failedTestsCount }}/{{ totalTestsCount }} Tests Failed
        </span>
        <span
          v-else
          class="text-red-400 font-medium text-[10px] truncate max-w-[140px]"
          :title="stepState?.failureReason || stepState?.error?.message"
        >
          ✗ {{ stepState?.failureReason || stepState?.error?.message || 'Failed' }}
        </span>
      </template>

      <!-- Skipped -->
      <template v-else-if="stepStatus === 'skipped'">
        <span class="text-zinc-400 italic text-[10px]">Đã bỏ qua (Skipped)</span>
      </template>
    </div>
  </div>
</template>
