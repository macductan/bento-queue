<script setup lang="ts">
import { ref, computed } from 'vue'
import { model } from '../../../wailsjs/go/models'
import { useFlowStore } from '../../stores/flowStore'
import FlowStepCard from './FlowStepCard.vue'
import FlowBranchEditor from './FlowBranchEditor.vue'

defineOptions({
  name: 'FlowNodeList'
})

const props = withDefaults(
  defineProps<{
    nodes: model.FlowNode[]
    direction?: 'vertical' | 'horizontal'
    isBranchChild?: boolean
  }>(),
  {
    isBranchChild: false
  }
)

const emit = defineEmits<{
  (
    e: 'request-add-step',
    payload: { targetNodes: model.FlowNode[]; insertIndex?: number }
  ): void
  (e: 'request-add-parallel', payload: { nodeId: string; stepId: string }): void
  (e: 'request-change-step', payload: { stepId: string }): void
}>()

const flowStore = useFlowStore()
const draggedNodeId = ref<string | null>(null)

const effectiveDirection = computed<'vertical' | 'horizontal'>(() => {
  return props.direction || flowStore.flowDirection
})

const mainAxisClasses = computed(() => {
  return effectiveDirection.value === 'vertical'
    ? 'flex-col items-center'
    : 'flex-row items-center'
})

const crossAxisClasses = computed(() => {
  return effectiveDirection.value === 'vertical'
    ? 'flex-row items-start justify-center gap-4'
    : 'flex-col items-start justify-center gap-4'
})

const arrowSymbol = computed(() => {
  return effectiveDirection.value === 'vertical' ? '↓' : '→'
})

const handleAddSequentialAt = (insertIndex?: number) => {
  emit('request-add-step', {
    targetNodes: props.nodes,
    insertIndex
  })
}

const handleAddParallel = (nodeId: string, stepId: string) => {
  emit('request-add-parallel', { nodeId, stepId })
}

const handleChangeStepRequest = (stepId: string) => {
  emit('request-change-step', { stepId })
}

const handleAddBranch = (nodeId: string) => {
  flowStore.addBranchToNode(nodeId)
}

const handleMoveNode = (nodeId: string, dir: 'up' | 'down') => {
  flowStore.moveCanvasNode(nodeId, dir)
}

const handleDragStart = (nodeId: string, e: DragEvent) => {
  const targetEl = e.target as HTMLElement | null
  if (targetEl && typeof targetEl.closest === 'function') {
    if (targetEl.closest('input, select, textarea, button')) {
      e.preventDefault()
      return
    }
  }
  draggedNodeId.value = nodeId
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', nodeId)
  }
}

const handleDrop = (targetNodeId: string, e: DragEvent) => {
  const sourceId = e.dataTransfer?.getData('text/plain') || draggedNodeId.value || ''
  draggedNodeId.value = null
  if (sourceId && sourceId !== targetNodeId) {
    flowStore.reorderCanvasNodes(sourceId, targetNodeId)
  }
}
</script>

<template>
  <div
    data-test="flow-node-list"
    :data-direction="effectiveDirection"
    class="flex gap-2"
    :class="mainAxisClasses"
  >
    <template v-for="(node, nIdx) in props.nodes" :key="node.id">
      <!-- Insert button before node (except at very start of nested branch to keep UI clean) -->
      <div
        v-if="nIdx > 0"
        class="flex items-center justify-center gap-1 text-zinc-500"
        :class="effectiveDirection === 'vertical' ? 'flex-col my-0.5' : 'flex-row mx-0.5'"
      >
        <span data-test="flow-axis-arrow" class="text-sm font-bold text-zinc-500 select-none">
          {{ arrowSymbol }}
        </span>
        <button
          type="button"
          data-test="flow-insert-step-between-btn"
          class="px-1.5 py-0.5 rounded-full bg-zinc-900 hover:bg-blue-950/60 border border-zinc-700 hover:border-blue-500/60 text-[10px] text-zinc-400 hover:text-blue-300 transition-colors"
          title="Chèn bước vào vị trí này"
          @click="handleAddSequentialAt(nIdx)"
        >
          +
        </button>
        <span class="text-sm font-bold text-zinc-500 select-none">
          {{ arrowSymbol }}
        </span>
      </div>

      <!-- FlowNode Block -->
      <div
        data-test="flow-node-item"
        :data-node-id="node.id"
        :data-node-status="flowStore.nodeStates[node.id] || 'idle'"
        draggable="true"
        class="flex flex-col items-center gap-2 p-2.5 rounded-xl border border-zinc-800/80 bg-zinc-950/40"
        @dragstart.stop="handleDragStart(node.id, $event)"
        @dragover.prevent.stop
        @dragend.stop="draggedNodeId = null"
        @drop.stop="handleDrop(node.id, $event)"
      >
        <!-- Node Header Controls: Parallel indicator, Reorder Up/Down, + Rẽ nhánh -->
        <div class="w-full flex items-center justify-between gap-2 px-1 text-[10px] text-zinc-400">
          <div class="flex items-center gap-1.5">
            <span class="font-mono text-zinc-500">Bước #{{ nIdx + 1 }}</span>
            <span
              v-if="Array.isArray(node.steps) && node.steps.length > 1"
              data-test="flow-parallel-badge"
              class="px-1.5 py-0.5 rounded bg-blue-500/15 border border-blue-500/30 text-blue-300 font-semibold"
            >
              || Song song ({{ node.steps.length }})
            </span>
          </div>

          <div class="flex items-center gap-1">
            <button
              type="button"
              data-test="flow-move-node-up-btn"
              :disabled="nIdx === 0"
              class="px-1.5 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-zinc-300 transition-colors"
              title="Di chuyển lên / sang trái"
              @click="handleMoveNode(node.id, 'up')"
            >
              {{ effectiveDirection === 'vertical' ? '↑' : '←' }}
            </button>
            <button
              type="button"
              data-test="flow-move-node-down-btn"
              :disabled="nIdx === props.nodes.length - 1"
              class="px-1.5 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-zinc-300 transition-colors"
              title="Di chuyển xuống / sang phải"
              @click="handleMoveNode(node.id, 'down')"
            >
              {{ effectiveDirection === 'vertical' ? '↓' : '→' }}
            </button>
            <button
              type="button"
              data-test="flow-add-branch-btn"
              class="px-2 py-0.5 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-medium transition-colors"
              title="Thêm nhánh điều kiện (Success / Error / Custom)"
              @click="handleAddBranch(node.id)"
            >
              + Rẽ nhánh
            </button>
          </div>
        </div>

        <!-- Cross-Axis Row/Col of FlowSteps in this FlowNode -->
        <div
          data-test="flow-node-steps-row"
          :data-cross-axis="effectiveDirection === 'vertical' ? 'horizontal' : 'vertical'"
          class="flex"
          :class="crossAxisClasses"
        >
          <FlowStepCard
            v-for="(step, sIdx) in node.steps"
            :key="step.id"
            :step="step"
            :node-id="node.id"
            :parallel-index="sIdx"
            :parallel-total="node.steps.length"
            @change-request="handleChangeStepRequest"
            @add-parallel="handleAddParallel"
          />
        </div>

        <!-- Branches attached to this FlowNode (Cross-Axis) -->
        <FlowBranchEditor
          v-if="Array.isArray(node.branches) && node.branches.length > 0"
          :node="node"
          :branches="node.branches"
          :node-id="node.id"
          :direction="effectiveDirection"
          @request-add-step="emit('request-add-step', $event)"
          @request-add-parallel="emit('request-add-parallel', $event)"
          @request-change-step="emit('request-change-step', $event)"
        />
      </div>
    </template>

    <!-- Connector arrow before final "+ Thêm bước" button when list is non-empty -->
    <span
      v-if="props.nodes.length > 0 && !props.isBranchChild"
      data-test="flow-axis-arrow"
      class="text-sm font-bold text-zinc-500 select-none"
    >
      {{ arrowSymbol }}
    </span>

    <!-- Append Step Button at the end of Main Axis -->
    <button
      v-if="!props.isBranchChild"
      type="button"
      data-test="flow-add-step-btn"
      class="px-3.5 py-1.5 rounded-lg border border-dashed border-zinc-700 hover:border-blue-500 bg-zinc-900/80 hover:bg-blue-950/30 text-zinc-300 hover:text-blue-300 text-xs font-medium transition-colors flex items-center gap-1.5 shadow-sm"
      @click="handleAddSequentialAt(props.nodes.length)"
    >
      <span>+ Thêm bước</span>
    </button>
  </div>
</template>
