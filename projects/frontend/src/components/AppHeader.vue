<script lang="ts" setup>
import { onMounted, onUnmounted, ref } from 'vue'
import logoSrc from '@/assets/images/turtle_esports_mascot.jpg'
import { useUiStore } from '@/stores/uiStore'
import { useCollectionStore } from '@/stores/collectionStore'
import EnvSelector from '@/components/environment/EnvSelector.vue'
import ImportErrorModal from '@/components/ImportErrorModal.vue'

const uiStore = useUiStore()
const collectionStore = useCollectionStore()
const isImporting = ref(false)

const handleKeydown = (e: KeyboardEvent) => {
  if (e.ctrlKey && e.key.toLowerCase() === 'i') {
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

    e.preventDefault()
    void triggerImport()
  }
}

const triggerImport = async () => {
  if (isImporting.value) return
  isImporting.value = true
  try {
    await collectionStore.importPostman()
  } finally {
    isImporting.value = false
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <header class="h-header-height min-h-header-height bg-surface-raised border-b border-border-default px-3 flex items-center gap-3">
    <div class="flex items-center gap-3">
      <!-- Logo mark -->
      <img
        :src="logoSrc"
        alt="hecto-api logo"
        class="w-[32px] h-[32px] rounded-xl object-cover shrink-0"
      />
      <!-- App title & version -->
      <div class="flex items-baseline gap-2">
        <span class="heading-sm text-text-primary">hecto-api</span>
        <span class="mono-xs text-text-muted">v1.0 - offline</span>
      </div>
    </div>

    <div class="flex-1">
      <!-- Placeholder: quick actions (Story sau) -->
    </div>

    <div class="flex items-center gap-2">
      <button @click="triggerImport" :disabled="isImporting" class="text-sm text-text-primary hover:text-text-inverse hover:bg-text-primary px-3 py-1.5 rounded border border-border-default transition-colors disabled:opacity-50 flex items-center gap-2" title="Import Postman (Ctrl+I)">
        <svg v-if="isImporting" class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>{{ isImporting ? 'Đang import...' : 'Import Postman' }}</span>
      </button>
      <EnvSelector />
      <button @click="uiStore.envModalOpen = true" class="icon-btn text-text-muted hover:text-text-primary p-2 flex items-center justify-center rounded transition-colors" title="Manage Environments">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
      </button>
    </div>
    
    <ImportErrorModal @retry="triggerImport" />
  </header>
</template>
