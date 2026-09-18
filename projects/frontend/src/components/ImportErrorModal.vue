<script lang="ts" setup>
import { useUiStore } from '@/stores/uiStore'
import { storeToRefs } from 'pinia'
import { ref, watch, nextTick } from 'vue'

const uiStore = useUiStore()
const { importError } = storeToRefs(uiStore)
const tryAgainBtn = ref<HTMLButtonElement | null>(null)

const emit = defineEmits<{
  (e: 'retry'): void
}>()

watch(importError, async (newVal) => {
  if (newVal) {
    await nextTick()
    tryAgainBtn.value?.focus()
  }
})

const handleCancel = () => {
  uiStore.clearImportError()
}

const handleRetry = () => {
  uiStore.clearImportError()
  emit('retry')
}

const handleBackdropClick = (e: MouseEvent) => {
  if (e.target === e.currentTarget) {
    handleCancel()
  }
}
</script>

<template>
  <Transition name="fade" mode="out-in">
    <div
      v-if="importError"
      class="fixed inset-0 z-[1100] flex items-center justify-center bg-surface-overlay/50 backdrop-blur-sm"
      @click="handleBackdropClick"
      @keydown.esc="handleCancel"
    >
      <div 
        class="bg-surface-raised border border-border-default rounded-md shadow-lg p-5 w-full max-w-md"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="import-error-title"
      >
        <h3 id="import-error-title" class="heading-lg mb-3 text-text-primary">Lỗi Import</h3>
        <p class="ui-sm text-text-secondary mb-5">{{ importError }}</p>
        
        <div class="flex justify-end gap-3">
          <button
            class="px-3 py-1.5 rounded ui-sm bg-surface-base hover:bg-surface-hover text-text-primary transition-colors border border-border-default"
            @click="handleCancel"
          >
            Hủy
          </button>
          <button
            ref="tryAgainBtn"
            class="px-3 py-1.5 rounded ui-sm bg-blue-600 hover:bg-blue-500 text-white min-h-[32px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-surface-raised transition-colors"
            @click="handleRetry"
          >
            Thử lại
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
