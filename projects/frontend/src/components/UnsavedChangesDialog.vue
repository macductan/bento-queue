<script lang="ts" setup>
import { useUiStore } from '@/stores/uiStore'

const store = useUiStore()

const handleResolve = (action: 'save' | 'discard' | 'cancel') => {
  store.resolveUnsavedPrompt(action)
}
</script>

<template>
  <div v-if="store.unsavedPrompt" class="fixed inset-0 z-[1100] bg-surface-base/80 flex items-center justify-center p-4">
    <div class="bg-surface-raised border border-border-default rounded-lg shadow-xl w-full max-w-md overflow-hidden">
      <div class="px-6 py-4 border-b border-border-default">
        <h3 class="text-lg font-medium text-text-primary">Thay đổi chưa lưu</h3>
      </div>
      
      <div class="px-6 py-4 text-text-secondary">
        Request hiện tại có thay đổi chưa được lưu. Bạn có muốn lưu lại trước khi chuyển sang request khác?
      </div>
      
      <div class="px-6 py-4 bg-surface-base border-t border-border-default flex justify-end gap-3">
        <button 
          @click="handleResolve('cancel')"
          class="px-4 h-9 rounded bg-surface-hover hover:bg-surface-hover/80 text-text-primary transition-colors"
        >
          Hủy
        </button>
        <button 
          @click="handleResolve('discard')"
          class="px-4 h-9 rounded bg-surface-hover hover:bg-surface-hover/80 text-text-danger transition-colors"
        >
          Không lưu
        </button>
        <button 
          @click="handleResolve('save')"
          class="px-4 h-9 rounded bg-brand-primary hover:bg-brand-secondary text-white font-medium transition-colors"
        >
          Lưu
        </button>
      </div>
    </div>
  </div>
</template>
