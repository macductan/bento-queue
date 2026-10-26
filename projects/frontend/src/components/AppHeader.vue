<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
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

const hasGitConflict = computed(() => {
  return Boolean(collectionStore.gitConflictError || collectionStore.gitSyncStatus?.has_conflicts)
})

const gitConflictCount = computed(() => {
  const fromError = collectionStore.gitConflictError?.files?.length ?? 0
  const fromStatus = Math.max(
    collectionStore.gitSyncStatus?.conflict_files?.length ?? 0,
    collectionStore.gitSyncStatus?.conflicts?.length ?? 0
  )
  const count = Math.max(fromError, fromStatus)
  return count > 0 ? count : 1
})

const isGitConfigured = computed(() => {
  return Boolean(
    collectionStore.activeCollection?.git_remote_url?.trim() ||
      collectionStore.gitSyncStatus?.remote_url?.trim()
  )
})

const gitBranchName = computed(() => {
  return collectionStore.gitSyncStatus?.branch?.trim() || 'main'
})

const gitButtonLabel = computed(() => {
  if (hasGitConflict.value) {
    return `Xung đột Git (${gitConflictCount.value})`
  }
  if (isGitConfigured.value) {
    return `Git: ${gitBranchName.value}`
  }
  return 'Git Sync'
})

const isMockRunning = computed(() => {
  return Boolean((mockStore as any).status?.running ?? mockStore.running)
})

const mockPort = computed(() => {
  const p = Number((mockStore as any).status?.port || mockStore.port)
  return Number.isFinite(p) && p > 0 ? p : 4010
})

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
  <header class="h-header-height min-h-header-height bg-surface-raised border-b border-border-default px-3 flex items-center justify-between gap-3">
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
      <div class="h-5 w-px bg-zinc-800"></div>
      <CollectionSwitcher />
    </div>

    <div class="flex-1">
      <!-- Spacer -->
    </div>

    <div class="flex items-center gap-2">
      <!-- Git Sync Status Pill -->
      <button
        type="button"
        data-test="git-config-btn"
        title="Đồng bộ Git / Cấu hình Remote"
        aria-label="Đồng bộ Git / Cấu hình Remote"
        class="px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 border transition-colors cursor-pointer"
        :class="
          hasGitConflict
            ? 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
            : isGitConfigured
              ? 'border-zinc-700/80 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-200'
              : 'border-zinc-700/80 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300'
        "
        @click="uiStore.gitSyncModalOpen = true"
      >
        <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="18" cy="18" r="3"></circle>
          <circle cx="6" cy="6" r="3"></circle>
          <path d="M13 6h3a2 2 0 0 1 2 2v7"></path>
          <line x1="6" y1="9" x2="6" y2="21"></line>
        </svg>
        <span
          v-if="hasGitConflict"
          data-test="git-status-badge-conflict"
          class="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0"
        />
        <span
          v-else-if="isGitConfigured"
          data-test="git-status-badge-configured"
          class="w-2 h-2 rounded-full bg-emerald-400 shrink-0"
        />
        <span
          v-else
          data-test="git-status-badge-unconfigured"
          class="w-2 h-2 rounded-full bg-zinc-600 shrink-0"
        />
        <span>{{ gitButtonLabel }}</span>
      </button>

      <!-- Mock Server Status Pill -->
      <button
        type="button"
        data-test="open-mock-server-btn"
        @click="uiStore.openMockServerModal()"
        class="px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 border transition-colors cursor-pointer"
        :class="
          isMockRunning
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
            : 'border-zinc-700/80 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300'
        "
        :title="isMockRunning ? `Local Mock Server (Đang chạy tại :${mockPort})` : 'Local Mock Server'"
      >
        <span
          v-if="isMockRunning"
          data-test="mock-server-running-indicator"
          class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"
        />
        <span
          v-else
          class="w-2 h-2 rounded-full bg-zinc-600 shrink-0"
        />
        <span>{{ isMockRunning ? `Mock :${mockPort}` : 'Mock Server' }}</span>
      </button>

      <!-- Import Postman Button -->
      <button
        type="button"
        data-test="import-collection-btn"
        @click="triggerImport"
        :disabled="isImporting"
        class="px-2.5 py-1.5 rounded-md text-xs font-medium bg-zinc-800/70 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/80 transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
        title="Import Postman (Ctrl+I)"
      >
        <svg v-if="isImporting" class="animate-spin h-3.5 w-3.5 text-amber-400 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <svg v-else class="w-3.5 h-3.5 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="17 8 12 3 7 8"></polyline>
          <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>
        <span>{{ collectionStore.importProgress ? collectionStore.importProgress : (isImporting ? 'Đang import...' : 'Import Postman') }}</span>
        <kbd class="text-[10px] text-zinc-500 bg-zinc-800 px-1 rounded">^I</kbd>
      </button>

      <div class="h-5 w-px bg-zinc-800 mx-0.5"></div>

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
        data-test="manage-env-btn"
        @click="uiStore.envModalOpen = true"
        class="icon-btn text-text-muted hover:text-text-primary p-2 flex items-center justify-center rounded transition-colors"
        title="Manage Environments"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
          <polyline points="2 17 12 22 22 17"></polyline>
          <polyline points="2 12 12 17 22 12"></polyline>
        </svg>
      </button>

      <button
        type="button"
        @click="uiStore.settingsModalOpen = true"
        class="icon-btn text-text-muted hover:text-text-primary p-2 flex items-center justify-center rounded transition-colors"
        title="Settings"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
      </button>
    </div>

    <ImportErrorModal @retry="triggerImport" />
    <SettingsModal v-model="uiStore.settingsModalOpen" />
  </header>
</template>
