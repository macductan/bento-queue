<script lang="ts" setup>
import { useUiStore } from '@/stores/uiStore'
import { storeToRefs } from 'pinia'

const uiStore = useUiStore()
const { toast } = storeToRefs(uiStore)
</script>

<template>
  <Transition name="toast" mode="out-in">
    <div
      v-if="toast"
      :key="toast.id"
      class="fixed bottom-4 right-4 z-[1000] px-4 py-2 bg-surface-overlay border border-border-default rounded-md text-text-primary pointer-events-none"
      role="status"
      aria-live="polite"
    >
      <span class="ui-sm whitespace-nowrap">{{ toast.text }}</span>
    </div>
  </Transition>
</template>

<style scoped>
/* Transition: slide up + fade */
.toast-enter-active {
  transition: all 0.2s ease-out;
}

.toast-leave-active {
  transition: all 0.15s ease-in;
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
