<script lang="ts" setup>
import { useCollectionStore } from '@/stores/collectionStore'
import { useUiStore } from '@/stores/uiStore'
import TreeNodeRow from './TreeNodeRow.vue'
import CollectionSwitcher from './CollectionSwitcher.vue'

const store = useCollectionStore()
const uiStore = useUiStore()

const handleRootContextMenu = (e: MouseEvent) => {
  // If clicked directly on the container (not inside a node row), show root folder menu
  if (e.target === e.currentTarget) {
    uiStore.openContextMenu(e.clientX, e.clientY, '', 'folder')
  }
}
</script>

<template>
  <nav
    class="shrink-0 bg-surface-raised border-r border-border-default flex flex-col overflow-hidden"
    :style="{ width: `${uiStore.sidebarWidth}px`, minWidth: `${uiStore.sidebarWidth}px` }"
    aria-label="Bộ sưu tập"
  >
    <div class="px-3 py-2 border-b border-border-default shrink-0 flex items-center justify-between gap-1">
      <CollectionSwitcher />
      <div class="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          data-test="git-pull-btn"
          :disabled="store.gitSyncLoading"
          title="Git Pull (Kéo thay đổi từ Remote)"
          aria-label="Git Pull"
          class="w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-default hover:bg-surface-hover rounded transition-colors disabled:opacity-50 cursor-pointer"
          @click="store.gitPull()"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <polyline points="19 12 12 19 5 12"></polyline>
          </svg>
        </button>
        <button
          type="button"
          data-test="git-push-btn"
          :disabled="store.gitSyncLoading"
          title="Git Push (Đẩy thay đổi lên Remote)"
          aria-label="Git Push"
          class="w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-default hover:bg-surface-hover rounded transition-colors disabled:opacity-50 cursor-pointer"
          @click="store.gitPush()"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="19" x2="12" y2="5"></line>
            <polyline points="5 12 12 5 19 12"></polyline>
          </svg>
        </button>
        <button
          type="button"
          data-test="git-config-btn"
          title="Cấu hình Git Remote"
          aria-label="Cấu hình Git Remote"
          class="w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-default hover:bg-surface-hover rounded transition-colors cursor-pointer"
          :class="store.gitConflictError ? 'text-red-400' : (store.activeCollection?.git_remote_url ? 'text-emerald-400' : '')"
          @click="uiStore.gitSyncModalOpen = true"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="18" cy="18" r="3"></circle>
            <circle cx="6" cy="6" r="3"></circle>
            <path d="M13 6h3a2 2 0 0 1 2 2v7"></path>
            <line x1="6" y1="9" x2="6" y2="21"></line>
          </svg>
        </button>
        <button 
          @click="store.createRequest()"
          title="Request mới (Ctrl+N)"
          class="w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-default hover:bg-surface-hover rounded transition-colors"
          aria-label="Request mới"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
        <button 
          @click="store.createFolder()"
          title="Thư mục mới (Ctrl+Shift+N)"
          class="w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-default hover:bg-surface-hover rounded transition-colors"
          aria-label="Thư mục mới"
        >
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            <line x1="12" y1="11" x2="12" y2="17"></line>
            <line x1="9" y1="14" x2="15" y2="14"></line>
          </svg>
        </button>
      </div>
    </div>
    <div 
      class="flex-1 overflow-y-auto py-2"
      @contextmenu.prevent="handleRootContextMenu"
    >
      <div v-if="store.loading && store.tree.length === 0" class="px-3 py-4 text-center ui-sm text-text-muted">Đang tải...</div>
      <div v-else-if="store.error" class="px-3 py-4 ui-sm text-text-danger">{{ store.error }}</div>
      <div v-else-if="store.tree.length === 0" class="px-3 py-8 text-center flex flex-col items-center gap-2">
        <span class="ui-sm text-text-muted">Collection trống.</span>
        <button 
          @click="store.createRequest()"
          class="text-brand-primary hover:text-brand-primary-hover ui-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded"
        >
          Tạo request mới
        </button>
      </div>
      <div v-else>
        <TreeNodeRow 
          v-for="node in store.tree" 
          :key="node.id"
          :node="node"
          :depth="0"
        />
      </div>
    </div>
  </nav>
</template>
