<script setup lang="ts">
import { useFlowStore } from '../../stores/flowStore'

const flowStore = useFlowStore()

const handleCreateFlow = async () => {
  await flowStore.createFlow()
}
</script>

<template>
  <div
    data-test="empty-state-flow"
    class="flex-1 h-full flex flex-col items-center justify-center p-8 text-center select-none bg-zinc-900 text-zinc-400"
  >
    <div class="w-14 h-14 rounded-2xl bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center mb-4 text-blue-400">
      <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
          d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
        />
      </svg>
    </div>

    <h3 class="text-sm font-semibold text-zinc-200 mb-1">Chưa chọn kịch bản API Flow</h3>
    <p class="text-xs text-zinc-500 max-w-sm mb-5 leading-relaxed">
      Chọn một Flow từ thanh bên trái hoặc tạo kịch bản API Flow mới để thiết kế luồng chạy tuần tự, song song và rẽ nhánh.
    </p>

    <button
      type="button"
      data-test="empty-state-create-flow-btn"
      class="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors shadow-sm flex items-center gap-1.5"
      @click="handleCreateFlow"
    >
      <span>+ Tạo Flow mới</span>
    </button>
  </div>
</template>
