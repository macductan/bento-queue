<script lang="ts" setup>
import { ref, computed, watch } from 'vue'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useUiStore } from '@/stores/uiStore'

const envStore = useEnvironmentStore()
const uiStore = useUiStore()

const selectRef = ref<HTMLSelectElement | null>(null)

const selectedEnvId = computed<string | null>({
  get: () => envStore.activeEnvId,
  set: (val) => {
    void envStore.setActive(val || null)
  }
})

watch(() => uiStore.focusEnvRequested, () => {
  if (selectRef.value) {
    selectRef.value.focus()
  }
})
</script>

<template>
  <div class="relative flex items-center">
    <select
      ref="selectRef"
      v-model="selectedEnvId"
      class="peer appearance-none bg-surface-overlay border border-border-default rounded-md h-[32px] pl-2 pr-6 ui-xs font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-brand-primary"
      aria-label="Select environment"
      title="Select environment (Ctrl+E)"
    >
      <option :value="null">Không dùng env</option>
      <option v-for="env in envStore.environments" :key="env.id" :value="env.id">
        {{ env.name }}
      </option>
    </select>
    <div class="absolute right-2 pointer-events-none text-text-muted peer-focus:text-brand-primary flex items-center justify-center">
      <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m6 9 6 6 6-6"/>
      </svg>
    </div>
  </div>
</template>
