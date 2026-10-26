<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { model } from '../../../wailsjs/go/models'
import { useFlowStore, ensureFlowDirectionSync } from '../../stores/flowStore'
import FlowToolbar from './FlowToolbar.vue'
import FlowNodeList from './FlowNodeList.vue'
import StepInspectorPanel from './StepInspectorPanel.vue'
import RequestPickerModal from './RequestPickerModal.vue'
import EmptyStateFlow from './EmptyStateFlow.vue'

const flowStore = useFlowStore()

watch(
  () => flowStore.currentFlow,
  flow => {
    if (flow) {
      ensureFlowDirectionSync(flow)
    }
  },
  { immediate: true }
)

type PickerContext =
  | {
      mode: 'sequential'
      targetNodes?: model.FlowNode[]
      insertIndex?: number
    }
  | {
      mode: 'parallel'
      nodeId: string
      stepId: string
    }
  | {
      mode: 'change'
      stepId: string
    }

const pickerOpen = ref(false)
const pickerContext = ref<PickerContext | null>(null)

const pickerTitle = computed(() => {
  if (!pickerContext.value) return 'Chọn API Request'
  switch (pickerContext.value.mode) {
    case 'parallel':
      return 'Chọn API Request chạy song song (||)'
    case 'change':
      return 'Đổi API Request cho bước hiện tại'
    default:
      return 'Thêm bước API Request vào Flow'
  }
})

const pickerSelectedRequestId = computed(() => {
  if (pickerContext.value?.mode === 'change') {
    const found = flowStore.findStepInNodes(pickerContext.value.stepId)
    return found?.step.request_id || ''
  }
  return ''
})

const handleRequestAddStep = (payload: {
  targetNodes: model.FlowNode[]
  insertIndex?: number
}) => {
  pickerContext.value = {
    mode: 'sequential',
    targetNodes: payload.targetNodes,
    insertIndex: payload.insertIndex
  }
  pickerOpen.value = true
}

const handleRequestAddParallel = (payload: { nodeId: string; stepId: string }) => {
  pickerContext.value = {
    mode: 'parallel',
    nodeId: payload.nodeId,
    stepId: payload.stepId
  }
  pickerOpen.value = true
}

const handleRequestChangeStep = (payload: { stepId: string }) => {
  pickerContext.value = {
    mode: 'change',
    stepId: payload.stepId
  }
  pickerOpen.value = true
}

const handlePickerSelect = (requestId: string) => {
  const ctx = pickerContext.value
  if (!ctx || !flowStore.currentFlow) {
    pickerOpen.value = false
    pickerContext.value = null
    return
  }

  if (ctx.mode === 'sequential') {
    flowStore.addSequentialStep(requestId, ctx.insertIndex, ctx.targetNodes)
  } else if (ctx.mode === 'parallel') {
    flowStore.addParallelStep(ctx.nodeId, requestId)
  } else if (ctx.mode === 'change') {
    flowStore.changeStepRequest(ctx.stepId, requestId)
  }

  pickerOpen.value = false
  pickerContext.value = null
}

const handlePickerClose = () => {
  pickerOpen.value = false
  pickerContext.value = null
}
</script>

<template>
  <div
    v-if="flowStore.currentFlow"
    data-test="flow-editor"
    class="flex-1 h-full flex flex-col min-w-0 min-h-0 bg-zinc-900 overflow-hidden"
  >
    <!-- Top Toolbar -->
    <FlowToolbar />

    <!-- Horizontal Workspace Body: Canvas (Left) + StepInspectorPanel Right Drawer -->
    <div
      data-test="flow-workspace-body"
      class="flex-1 flex overflow-hidden relative min-h-0"
    >
      <!-- Main Orthogonal 2-Axis Canvas -->
      <div
        data-test="flow-canvas"
        :data-direction="flowStore.flowDirection"
        class="flex-1 min-h-0 min-w-0 overflow-auto p-6 flex flex-col justify-start bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:16px_16px]"
      >
        <div
          class="min-w-fit min-h-fit flex py-4 px-4 mx-auto"
          :class="
            flowStore.flowDirection === 'vertical'
              ? 'flex-col items-center'
              : 'flex-row items-center gap-2'
          "
        >
          <!-- Start Badge -->
          <div
            class="px-3 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-[11px] font-mono text-zinc-400 select-none shrink-0"
            :class="flowStore.flowDirection === 'vertical' ? 'mb-2' : ''"
          >
            ● Bắt đầu (Start)
          </div>

          <FlowNodeList
            :nodes="flowStore.currentFlow.nodes || []"
            :direction="flowStore.flowDirection"
            @request-add-step="handleRequestAddStep"
            @request-add-parallel="handleRequestAddParallel"
            @request-change-step="handleRequestChangeStep"
          />
        </div>
      </div>

      <!-- Right Drawer Step Inspector Panel -->
      <StepInspectorPanel />
    </div>

    <!-- Searchable Request Picker Modal -->
    <RequestPickerModal
      v-if="pickerOpen"
      :open="pickerOpen"
      :title="pickerTitle"
      :selected-request-id="pickerSelectedRequestId"
      @select="handlePickerSelect"
      @close="handlePickerClose"
    />
  </div>
  <EmptyStateFlow v-else />
</template>
