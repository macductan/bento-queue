<script setup lang="ts">
import { computed } from 'vue'
import { useFlowStore, ensureFlowDirectionSync } from '../../stores/flowStore'

const flowStore = useFlowStore()

const currentFlow = computed(() => flowStore.currentFlow)
const direction = computed(() => flowStore.flowDirection)
const summary = computed(() => flowStore.lastRunSummary)

const updateName = (e: Event) => {
  if (!flowStore.currentFlow) return
  flowStore.currentFlow.name = (e.target as HTMLInputElement).value
}

const updateDescription = (e: Event) => {
  if (!flowStore.currentFlow) return
  flowStore.currentFlow.description = (e.target as HTMLInputElement).value
}

const updateTimeout = (e: Event) => {
  if (!flowStore.currentFlow) return
  const raw = parseInt((e.target as HTMLInputElement).value, 10)
  flowStore.currentFlow.timeout_ms = Number.isNaN(raw) || raw < 0 ? 0 : raw
}

const updateMaxSteps = (e: Event) => {
  if (!flowStore.currentFlow) return
  const raw = parseInt((e.target as HTMLInputElement).value, 10)
  flowStore.currentFlow.max_steps = Number.isNaN(raw) || raw <= 0 ? 100 : raw
}

const handleSetDirection = (dir: 'vertical' | 'horizontal') => {
  if (!flowStore.currentFlow) return
  ensureFlowDirectionSync(flowStore.currentFlow)
  flowStore.setFlowDirection(dir)
}

const handleToggleDirection = () => {
  if (!flowStore.currentFlow) return
  ensureFlowDirectionSync(flowStore.currentFlow)
  flowStore.toggleFlowDirection()
}

const handleSave = async () => {
  await flowStore.saveCurrentFlow()
}

const handleRun = async () => {
  await flowStore.runCurrentFlow()
}

const handleStop = async () => {
  await flowStore.stopCurrentFlow()
}
</script>

<template>
  <div
    v-if="currentFlow"
    data-test="flow-toolbar"
    class="border-b border-zinc-800 bg-zinc-900/95 px-4 py-2.5 flex flex-col gap-2 shrink-0"
  >
    <!-- Top row: Name, Layout Toggle, Timeout/MaxSteps, Save & Run/Stop -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <!-- Flow Name & Description -->
      <div class="flex items-center gap-2 min-w-[240px] flex-1">
        <div class="relative flex items-center flex-1 max-w-xs">
          <input
            type="text"
            data-test="flow-name-input"
            :value="currentFlow.name"
            placeholder="Tên Flow..."
            class="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded px-2.5 py-1 text-xs font-semibold text-zinc-100 outline-none transition-colors"
            @input="updateName"
          />
          <span
            v-if="flowStore.isDirty"
            data-test="flow-dirty-indicator"
            class="w-2 h-2 rounded-full bg-amber-400 ml-1.5 shrink-0"
            title="Có thay đổi chưa lưu"
          ></span>
        </div>

        <input
          type="text"
          data-test="flow-description-input"
          :value="currentFlow.description || ''"
          placeholder="Mô tả ngắn kịch bản..."
          class="hidden md:block flex-1 max-w-sm bg-zinc-950/60 border border-zinc-800/80 focus:border-indigo-500 rounded px-2.5 py-1 text-xs text-zinc-300 placeholder-zinc-500 outline-none transition-colors"
          @input="updateDescription"
        />
      </div>

      <!-- Controls: Layout Toggle, Timeout, MaxSteps, Save, Run/Stop -->
      <div class="flex flex-wrap items-center gap-2.5">
        <!-- Layout Toggle: Bố cục: [ ↕ Dọc | ↔ Ngang ] -->
        <div class="flex items-center gap-1.5 text-xs text-zinc-400">
          <span class="hidden sm:inline text-[11px] text-zinc-400">Bố cục:</span>
          <div
            data-test="flow-layout-toggle"
            :data-layout="direction"
            role="group"
            aria-label="Bố cục sơ đồ"
            class="inline-flex items-center bg-zinc-950 border border-zinc-800 rounded p-0.5 cursor-pointer select-none"
            @click="handleToggleDirection"
          >
            <button
              type="button"
              data-test="flow-layout-vertical"
              class="px-2 py-0.5 text-[11px] font-medium rounded transition-colors"
              :class="
                direction === 'vertical'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              "
              @click.stop="handleSetDirection('vertical')"
            >
              ↕ Dọc
            </button>
            <button
              type="button"
              data-test="flow-layout-horizontal"
              class="px-2 py-0.5 text-[11px] font-medium rounded transition-colors"
              :class="
                direction === 'horizontal'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              "
              @click.stop="handleSetDirection('horizontal')"
            >
              ↔ Ngang
            </button>
          </div>
        </div>

        <!-- Default Timeout (ms) -->
        <label class="flex items-center gap-1 text-[11px] text-zinc-400" title="Timeout mặc định (ms)">
          <span>Timeout (ms):</span>
          <input
            type="number"
            min="0"
            step="100"
            data-test="flow-timeout-input"
            :value="currentFlow.timeout_ms ?? 30000"
            class="w-20 bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded px-1.5 py-0.5 text-xs text-zinc-200 font-mono outline-none"
            @input="updateTimeout"
          />
        </label>

        <!-- Max Steps -->
        <label class="flex items-center gap-1 text-[11px] text-zinc-400" title="Số bước tối đa (max_steps)">
          <span>Max steps:</span>
          <input
            type="number"
            min="1"
            max="1000"
            data-test="flow-max-steps-input"
            :value="currentFlow.max_steps ?? 100"
            class="w-16 bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded px-1.5 py-0.5 text-xs text-zinc-200 font-mono outline-none"
            @input="updateMaxSteps"
          />
        </label>

        <!-- Save Button -->
        <button
          type="button"
          data-test="flow-save-btn"
          class="px-2.5 py-1 rounded border text-xs font-medium transition-colors flex items-center gap-1.5"
          :class="
            flowStore.isDirty
              ? 'border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
              : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
          "
          title="Lưu Flow (Ctrl+S)"
          @click="handleSave"
        >
          <span>Lưu</span>
          <span v-if="flowStore.isDirty" class="text-[10px] text-amber-400">●</span>
        </button>

        <!-- Run / Stop Button -->
        <button
          v-if="!flowStore.isRunning"
          type="button"
          data-test="flow-run-btn"
          class="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors shadow-sm flex items-center gap-1.5"
          @click="handleRun"
        >
          <span>▶ Chạy Flow</span>
        </button>
        <button
          v-else
          type="button"
          data-test="flow-stop-btn"
          class="px-3 py-1 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-colors shadow-sm flex items-center gap-1.5"
          @click="handleStop"
        >
          <span>⏹ Dừng</span>
        </button>
      </div>
    </div>

    <!-- Run Summary Bar -->
    <div
      v-if="summary || flowStore.isRunning"
      data-test="flow-run-summary"
      class="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded bg-zinc-950/80 border border-zinc-800/80 text-xs"
    >
      <div class="flex flex-wrap items-center gap-3">
        <span
          v-if="flowStore.isRunning"
          class="inline-flex items-center gap-1.5 text-blue-400 font-medium"
        >
          <span class="w-2 h-2 rounded-full bg-blue-400 animate-ping"></span>
          Đang chạy Flow...
        </span>
        <span
          v-else-if="summary"
          data-test="flow-summary-status"
          class="px-2 py-0.5 rounded text-[11px] font-bold uppercase"
          :class="
            summary.status === 'passed'
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              : 'bg-red-500/15 text-red-400 border border-red-500/30'
          "
        >
          {{ summary.status === 'passed' ? 'PASSED' : 'FAILED' }}
        </span>

        <template v-if="summary">
          <span data-test="flow-summary-passed" class="text-emerald-400 font-medium">
            Passed: {{ summary.stepsPassed }}
          </span>
          <span data-test="flow-summary-failed" class="text-red-400 font-medium">
            Failed: {{ summary.stepsFailed }}
          </span>
          <span data-test="flow-summary-skipped" class="text-zinc-400 font-medium">
            Skipped: {{ summary.stepsSkipped }}
          </span>
          <span data-test="flow-summary-duration" class="text-zinc-300 font-mono">
            {{ summary.durationMs }} ms
          </span>
        </template>
      </div>

      <div
        v-if="summary?.haltedError"
        data-test="flow-summary-error"
        class="text-red-400 text-[11px] truncate max-w-md"
      >
        {{ summary.haltedError }}
      </div>
    </div>
  </div>
</template>
