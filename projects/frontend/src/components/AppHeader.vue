<script lang="ts" setup>
import { onMounted, onUnmounted, ref } from 'vue'
import pkg from '../../package.json'
import logoSrc from '@/assets/images/turtle_esports_mascot.jpg'
import { useUiStore } from '@/stores/uiStore'
import { useCollectionStore } from '@/stores/collectionStore'
import { useMockServerStore } from '@/stores/mockServerStore'
import EnvSelector from '@/components/environment/EnvSelector.vue'
import CollectionSwitcher from '@/components/CollectionSwitcher.vue'
import ImportErrorModal from '@/components/ImportErrorModal.vue'
import SettingsModal from '@/components/SettingsModal.vue'

const uiStore = useUiStore()
const collectionStore = useCollectionStore()
const mockStore = useMockServerStore()
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
  void mockStore.loadStatus()
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
        <span class="mono-xs text-text-muted">v{{ pkg.version }} - offline</span>
      </div>
    </div>

    <div class="flex-1">
      <!-- Placeholder: quick actions (Story sau) -->
    </div>

    <div class="flex items-center gap-2">
      <div class="flex items-center gap-1">
        <CollectionSwitcher />
        <button
          type="button"
          data-test="git-config-btn"
          title="Đồng bộ Git / Cấu hình Remote"
          aria-label="Đồng bộ Git / Cấu hình Remote"
          class="relative p-1.5 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
          :class="(collectionStore.gitConflictError || collectionStore.gitSyncStatus?.has_conflicts) ? 'text-red-400' : (collectionStore.activeCollection?.git_remote_url ? 'text-emerald-400' : '')"
          @click="uiStore.gitSyncModalOpen = true"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="18" cy="18" r="3"></circle>
            <circle cx="6" cy="6" r="3"></circle>
            <path d="M13 6h3a2 2 0 0 1 2 2v7"></path>
            <line x1="6" y1="9" x2="6" y2="21"></line>
          </svg>
          <span
            v-if="collectionStore.gitConflictError || collectionStore.gitSyncStatus?.has_conflicts"
            data-test="git-status-badge-conflict"
            class="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 ring-2 ring-surface-raised"
          />
          <span
            v-else-if="collectionStore.activeCollection?.git_remote_url"
            data-test="git-status-badge-configured"
            class="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-surface-raised"
          />
        </button>
      </div>
      <button @click="triggerImport" :disabled="isImporting" class="text-sm text-text-primary hover:text-text-inverse hover:bg-text-primary px-3 py-1.5 rounded border border-border-default transition-colors disabled:opacity-50 flex items-center gap-2" title="Import Postman (Ctrl+I)">
        <svg v-if="isImporting" class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>{{ collectionStore.importProgress ? collectionStore.importProgress : (isImporting ? 'Đang import...' : 'Import Postman') }}</span>
      </button>
      <EnvSelector />
      <button
        type="button"
        data-test="open-history-modal-btn"
        @click="uiStore.openHistoryModal()"
        class="icon-btn text-text-muted hover:text-text-primary p-2 flex items-center justify-center rounded transition-colors"
        title="History & Changelog"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
          <path d="M3 3v5h5"></path>
          <path d="M12 7v5l4 2"></path>
        </svg>
      </button>
      <button
        type="button"
        data-test="open-mock-server-btn"
        @click="uiStore.openMockServerModal()"
        class="icon-btn relative p-2 flex items-center justify-center rounded transition-colors"
        :class="mockStore.running ? 'text-status-2xx hover:text-status-2xx' : 'text-text-muted hover:text-text-primary'"
        :title="mockStore.running ? `Local Mock Server (Đang chạy tại :${mockStore.port})` : 'Local Mock Server'"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect width="20" height="8" x="2" y="2" rx="2" ry="2"></rect>
          <rect width="20" height="8" x="2" y="14" rx="2" ry="2"></rect>
          <line x1="6" x2="6.01" y1="6" y2="6"></line>
          <line x1="6" x2="6.01" y1="18" y2="18"></line>
        </svg>
        <span
          v-if="mockStore.running"
          data-test="mock-server-running-indicator"
          class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-status-2xx ring-2 ring-surface-raised"
        />
      </button>
      <button @click="uiStore.envModalOpen = true" class="icon-btn text-text-muted hover:text-text-primary p-2 flex items-center justify-center rounded transition-colors" title="Manage Environments">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
          <polyline points="2 17 12 22 22 17"></polyline>
          <polyline points="2 12 12 17 22 12"></polyline>
        </svg>
      </button>
      <button @click="uiStore.settingsModalOpen = true" class="icon-btn text-text-muted hover:text-text-primary p-2 flex items-center justify-center rounded transition-colors" title="Settings">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
      </button>
    </div>
    
    <ImportErrorModal @retry="triggerImport" />
    <SettingsModal v-model="uiStore.settingsModalOpen" />
  </header>
</template>

