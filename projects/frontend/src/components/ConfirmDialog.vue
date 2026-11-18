<script lang="ts" setup>
import { useUiStore } from '@/stores/uiStore'
import { useI18n } from '@/i18n'
import { storeToRefs } from 'pinia'
import { ref, watch, nextTick } from 'vue'

const { t } = useI18n()
const uiStore = useUiStore()
const { confirm } = storeToRefs(uiStore)
const cancelBtn = ref<HTMLButtonElement | null>(null)

watch(confirm, async (newVal) => {
  if (newVal) {
    await nextTick()
    cancelBtn.value?.focus()
  }
})

const handleCancel = () => {
  uiStore.resolveConfirm(false)
}

const handleConfirm = () => {
  uiStore.resolveConfirm(true)
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
      v-if="confirm"
      class="fixed inset-0 z-[1100] flex items-center justify-center bg-surface-overlay/50 backdrop-blur-sm"
      @click="handleBackdropClick"
      @keydown.esc="handleCancel"
    >
      <div 
        class="bg-surface-raised border border-border-default rounded-md shadow-lg p-5 w-full max-w-md"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <h3 id="confirm-title" class="heading-lg mb-3 text-text-primary">{{ t('common.confirm') }}</h3>
        <p class="ui-sm text-text-secondary mb-5">{{ confirm.message }}</p>
        
        <div class="flex justify-end gap-3">
          <button
            ref="cancelBtn"
            class="px-3 py-1.5 rounded ui-sm bg-surface-base hover:bg-surface-hover text-text-primary transition-colors border border-border-default"
            @click="handleCancel"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            class="px-3 py-1.5 rounded ui-sm bg-rose-600 hover:bg-rose-500 text-white min-h-[32px] focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-1 focus:ring-offset-surface-raised transition-colors"
            @click="handleConfirm"
          >
            {{ t('common.delete') }}
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
