<script setup lang="ts">
import { computed, watch } from 'vue'
import { model } from '../../../wailsjs/go/models'
import { useFlowStore } from '../../stores/flowStore'
import CustomSelect, { type SelectOption } from '../CustomSelect.vue'
import FlowNodeList from './FlowNodeList.vue'

const CONDITION_TYPE_OPTIONS: SelectOption[] = [
  { value: 'success', label: '✅ Thành công (Success)' },
  { value: 'error', label: '❌ Khi Lỗi (Error / Catch)' },
  { value: 'custom', label: '⚡ Điều kiện tùy chỉnh (Custom)' }
]

const CONDITION_SOURCE_OPTIONS: SelectOption[] = [
  { value: 'status_code', label: 'Status Code' },
  { value: 'body_json', label: 'Body JSON path' },
  { value: 'variable', label: 'Biến (Variable)' }
]

const CONDITION_OPERATOR_OPTIONS: SelectOption[] = [
  { value: '==', label: '==' },
  { value: '!=', label: '!=' },
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '>=', label: '>=' },
  { value: '<=', label: '<=' },
  { value: 'contains', label: 'contains' },
  { value: 'matches', label: 'matches' },
  { value: 'exists', label: 'exists' }
]

const props = defineProps<{
  node?: model.FlowNode
  branches?: model.FlowBranch[]
  nodeId?: string
  direction?: 'vertical' | 'horizontal'
}>()

const emit = defineEmits<{
  (
    e: 'request-add-step',
    payload: { targetNodes: model.FlowNode[]; insertIndex?: number }
  ): void
  (e: 'request-add-parallel', payload: { nodeId: string; stepId: string }): void
  (e: 'request-change-step', payload: { stepId: string }): void
}>()

const flowStore = useFlowStore()

const effectiveDirection = computed<'vertical' | 'horizontal'>(() => {
  return props.direction || flowStore.flowDirection
})

const effectiveNodeId = computed(() => {
  return props.nodeId || props.node?.id || ''
})

const branchList = computed<model.FlowBranch[]>(() => {
  if (Array.isArray(props.branches)) return props.branches
  if (props.node && Array.isArray(props.node.branches)) return props.node.branches
  return []
})

const crossAxisClasses = computed(() => {
  return effectiveDirection.value === 'vertical'
    ? 'flex-row items-start justify-center gap-4'
    : 'flex-col items-start justify-center gap-4'
})

const getBranchStatus = (branchId: string): string => {
  return flowStore.branchStates[branchId] || 'idle'
}

const ensureCondition = (branch: model.FlowBranch) => {
  if (!branch.condition) {
    branch.condition = {
      type: 'success'
    } as model.FlowBranchCondition
  }
  if (branch.condition.type === 'custom') {
    if (!branch.condition.source) branch.condition.source = 'status_code'
    if (!branch.condition.operator) branch.condition.operator = '=='
    if (branch.condition.path === undefined) branch.condition.path = ''
    if (branch.condition.value === undefined) branch.condition.value = '200'
  }
  return branch.condition
}

watch(
  branchList,
  list => {
    for (const b of list) {
      if (b?.condition?.type === 'custom') {
        ensureCondition(b)
      }
    }
  },
  { immediate: true }
)

const setBranchConditionType = (
  branch: model.FlowBranch,
  type: 'success' | 'error' | 'custom'
) => {
  const cond = ensureCondition(branch)
  cond.type = type
  if (type === 'success') {
    branch.name = 'Thành công'
  } else if (type === 'error') {
    branch.name = 'Khi Lỗi'
  } else if (type === 'custom') {
    branch.name = 'Điều kiện tùy chỉnh'
    if (!cond.source) cond.source = 'status_code'
    if (!cond.operator) cond.operator = '=='
    if (cond.value === undefined) cond.value = '200'
    if (cond.path === undefined) cond.path = ''
  }
}

const handleTypeSelectChange = (branch: model.FlowBranch, valOrEvent: string | Event) => {
  const val = (
    typeof valOrEvent === 'string'
      ? valOrEvent
      : (valOrEvent.target as HTMLSelectElement).value
  ) as 'success' | 'error' | 'custom'
  setBranchConditionType(branch, val)
}

const handleSourceChange = (branch: model.FlowBranch, valOrEvent: string | Event) => {
  const cond = ensureCondition(branch)
  const val =
    typeof valOrEvent === 'string'
      ? valOrEvent
      : (valOrEvent.target as HTMLSelectElement).value
  cond.source = val
  cond.path = ''
  delete (cond as any).json_path
  delete (cond as any).variable
  delete (cond as any).variable_name
}

const handlePathInput = (branch: model.FlowBranch, e: Event) => {
  const cond = ensureCondition(branch)
  const val = (e.target as HTMLInputElement).value
  cond.path = val
  delete (cond as any).variable_name
  if (cond.source === 'body_json') {
    if (val) {
      ;(cond as any).json_path = val
    } else {
      delete (cond as any).json_path
    }
    delete (cond as any).variable
  } else if (cond.source === 'variable') {
    if (val) {
      ;(cond as any).variable = val
    } else {
      delete (cond as any).variable
    }
    delete (cond as any).json_path
  } else {
    delete (cond as any).json_path
    delete (cond as any).variable
  }
}

const handleOperatorChange = (branch: model.FlowBranch, valOrEvent: string | Event) => {
  const cond = ensureCondition(branch)
  cond.operator =
    typeof valOrEvent === 'string'
      ? valOrEvent
      : (valOrEvent.target as HTMLSelectElement).value
}

const handleValueInput = (branch: model.FlowBranch, e: Event) => {
  const cond = ensureCondition(branch)
  cond.value = (e.target as HTMLInputElement).value
}

const handleDeleteBranch = (branchId: string) => {
  if (effectiveNodeId.value) {
    flowStore.deleteBranchFromNode(effectiveNodeId.value, branchId)
  } else if (Array.isArray(props.branches)) {
    const idx = props.branches.findIndex(b => b.id === branchId)
    if (idx !== -1) props.branches.splice(idx, 1)
  }
}

const handleAddStepToBranch = (branch: model.FlowBranch) => {
  if (!Array.isArray(branch.nodes)) {
    branch.nodes = []
  }
  emit('request-add-step', { targetNodes: branch.nodes })
}
</script>

<template>
  <div
    v-if="branchList.length > 0"
    data-test="flow-branch-container"
    :data-cross-axis="effectiveDirection === 'vertical' ? 'horizontal' : 'vertical'"
    class="flex p-2 rounded-lg"
    :class="crossAxisClasses"
  >
    <div
      v-for="branch in branchList"
      :key="branch.id"
      data-test="flow-branch-item"
      :data-branch-id="branch.id"
      :data-branch-status="getBranchStatus(branch.id)"
      class="min-w-[290px] rounded-lg border p-3 flex flex-col gap-2.5 transition-all bg-zinc-950/70"
      :class="[
        getBranchStatus(branch.id) === 'skipped'
          ? 'border-zinc-800 opacity-60'
          : getBranchStatus(branch.id) === 'active'
            ? 'border-blue-500/70 bg-blue-950/10 ring-1 ring-blue-500/30'
            : branch.condition?.type === 'success'
              ? 'border-emerald-500/40'
              : branch.condition?.type === 'error'
                ? 'border-red-500/40'
                : 'border-amber-500/40'
      ]"
    >
      <!-- Branch Header: Mode Selector + Delete Branch -->
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-1.5 flex-1 min-w-0">
          <span class="text-xs text-zinc-400 shrink-0">
            {{ effectiveDirection === 'vertical' ? '↙' : '↳' }}
          </span>

          <CustomSelect
            data-test="branch-condition-type"
            :model-value="branch.condition?.type || 'success'"
            :options="CONDITION_TYPE_OPTIONS"
            size="xs"
            full-width
            container-class="flex-1 min-w-0"
            @change="handleTypeSelectChange(branch, $event)"
          />
        </div>

        <button
          type="button"
          data-test="flow-delete-branch-btn"
          class="px-1.5 py-0.5 rounded bg-zinc-900 hover:bg-red-900/50 text-zinc-400 hover:text-red-300 text-xs transition-colors shrink-0"
          title="Xóa nhánh này"
          @click="handleDeleteBranch(branch.id)"
        >
          ✕
        </button>
      </div>

      <!-- Quick Mode Switcher Pills -->
      <div class="flex items-center gap-1 text-[10px]">
        <button
          type="button"
          data-test="branch-type-success"
          class="px-2 py-0.5 rounded border transition-colors"
          :class="
            branch.condition?.type === 'success'
              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-semibold'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
          "
          @click="setBranchConditionType(branch, 'success')"
        >
          ✅ Success
        </button>
        <button
          type="button"
          data-test="branch-type-error"
          class="px-2 py-0.5 rounded border transition-colors"
          :class="
            branch.condition?.type === 'error'
              ? 'bg-red-500/20 border-red-500/50 text-red-300 font-semibold'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
          "
          @click="setBranchConditionType(branch, 'error')"
        >
          ❌ Error
        </button>
        <button
          type="button"
          data-test="branch-type-custom"
          class="px-2 py-0.5 rounded border transition-colors"
          :class="
            branch.condition?.type === 'custom'
              ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-semibold'
              : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
          "
          @click="setBranchConditionType(branch, 'custom')"
        >
          ⚡ Custom
        </button>

        <span
          v-if="getBranchStatus(branch.id) === 'skipped'"
          class="ml-auto text-[10px] text-zinc-400 italic"
        >
          Đã bỏ qua
        </span>
      </div>

      <!-- Custom 3-Field Condition Builder -->
      <div
        v-if="branch.condition?.type === 'custom'"
        data-test="flow-custom-condition-row"
        class="flex flex-wrap items-center gap-1.5 p-2 rounded bg-zinc-900/90 border border-zinc-800"
      >
        <!-- Field 1: Source -->
        <CustomSelect
          data-test="branch-condition-source"
          :model-value="branch.condition?.source || 'status_code'"
          :options="CONDITION_SOURCE_OPTIONS"
          size="xs"
          @change="handleSourceChange(branch, $event)"
        />

        <!-- Sub-field for JSON path -->
        <input
          v-if="branch.condition?.source === 'body_json'"
          type="text"
          data-test="branch-condition-json-path"
          :value="branch.condition?.path || (branch.condition as any)?.json_path || ''"
          placeholder="data.status"
          class="w-28 bg-zinc-950 border border-zinc-700 focus:border-amber-500 rounded px-2 py-1 text-[11px] text-zinc-100 font-mono outline-none"
          @input="handlePathInput(branch, $event)"
        />

        <!-- Sub-field for Variable name -->
        <input
          v-if="branch.condition?.source === 'variable'"
          type="text"
          data-test="branch-condition-variable"
          :value="branch.condition?.path || (branch.condition as any)?.variable || ''"
          placeholder="ten_bien"
          class="w-28 bg-zinc-950 border border-zinc-700 focus:border-amber-500 rounded px-2 py-1 text-[11px] text-zinc-100 font-mono outline-none"
          @input="handlePathInput(branch, $event)"
        />

        <!-- Field 2: Operator -->
        <CustomSelect
          data-test="branch-condition-operator"
          :model-value="branch.condition?.operator || '=='"
          :options="CONDITION_OPERATOR_OPTIONS"
          size="xs"
          button-class="font-mono"
          @change="handleOperatorChange(branch, $event)"
        />

        <!-- Field 3: Value (hidden when operator === 'exists') -->
        <input
          v-if="branch.condition?.operator !== 'exists'"
          type="text"
          data-test="branch-condition-value"
          :value="branch.condition?.value ?? ''"
          placeholder="Giá trị..."
          class="w-24 flex-1 min-w-[72px] bg-zinc-950 border border-zinc-700 focus:border-amber-500 rounded px-2 py-1 text-[11px] text-zinc-100 font-mono outline-none"
          @input="handleValueInput(branch, $event)"
        />
      </div>

      <!-- Nested FlowNodeList inside this Branch -->
      <div
        class="pt-2 border-t border-zinc-800/70 flex gap-2"
        :class="effectiveDirection === 'vertical' ? 'flex-col items-center' : 'flex-row items-center'"
      >
        <FlowNodeList
          v-if="Array.isArray(branch.nodes) && branch.nodes.length > 0"
          :nodes="branch.nodes"
          :direction="effectiveDirection"
          :is-branch-child="true"
          @request-add-step="emit('request-add-step', $event)"
          @request-add-parallel="emit('request-add-parallel', $event)"
          @request-change-step="emit('request-change-step', $event)"
        />

        <button
          type="button"
          data-test="flow-branch-add-step-btn"
          class="px-2.5 py-1 rounded border border-dashed border-zinc-700 hover:border-blue-500/60 bg-zinc-900/60 hover:bg-blue-950/20 text-zinc-400 hover:text-blue-300 text-[11px] font-medium transition-colors"
          @click="handleAddStepToBranch(branch)"
        >
          + Thêm bước vào nhánh
        </button>
      </div>
    </div>
  </div>
</template>
