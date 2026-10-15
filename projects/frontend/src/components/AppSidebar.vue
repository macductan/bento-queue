<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useCollectionStore } from '@/stores/collectionStore'
import { useUiStore } from '@/stores/uiStore'
import TreeNodeRow from './TreeNodeRow.vue'
import CollectionSwitcher from './CollectionSwitcher.vue'

const store = useCollectionStore()
const uiStore = useUiStore()

const addDropdownOpen = ref(false)
const addMenuContainerRef = ref<HTMLElement | null>(null)

const toggleAddDropdown = () => {
  addDropdownOpen.value = !addDropdownOpen.value
}

const handleCreateRequest = () => {
  addDropdownOpen.value = false
  void store.createRequest()
}

const handleCreateFolder = () => {
  addDropdownOpen.value = false
  void store.createFolder()
}

const handleDocumentClick = (e: MouseEvent) => {
  if (!addDropdownOpen.value) return
  const target = e.target as Node | null
  if (addMenuContainerRef.value && target && !addMenuContainerRef.value.contains(target)) {
    addDropdownOpen.value = false
  }
}

const handleDocumentKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && addDropdownOpen.value) {
    addDropdownOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleDocumentClick)
  document.addEventListener('keydown', handleDocumentKeydown)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleDocumentClick)
  document.removeEventListener('keydown', handleDocumentKeydown)
})

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
      <div class="flex items-center gap-1 shrink-0">
        <button
          type="button"
          data-test="git-config-btn"
          title="Cấu hình Git Remote"
          aria-label="Cấu hình Git Remote"
          class="relative w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-default hover:bg-surface-hover rounded transition-colors cursor-pointer"
          :class="(store.gitConflictError || store.gitSyncStatus?.has_conflicts) ? 'text-red-400' : (store.activeCollection?.git_remote_url ? 'text-emerald-400' : '')"
          @click="uiStore.gitSyncModalOpen = true"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="18" cy="18" r="3"></circle>
            <circle cx="6" cy="6" r="3"></circle>
            <path d="M13 6h3a2 2 0 0 1 2 2v7"></path>
            <line x1="6" y1="9" x2="6" y2="21"></line>
          </svg>
          <span
            v-if="store.gitConflictError || store.gitSyncStatus?.has_conflicts"
            data-test="git-status-badge-conflict"
            class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-500"
          />
          <span
            v-else-if="store.activeCollection?.git_remote_url"
            data-test="git-status-badge-configured"
            class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-400"
          />
        </button>

        <div ref="addMenuContainerRef" class="relative">
          <button
            type="button"
            data-test="sidebar-add-btn"
            title="Thêm mới (Request / Thư mục)"
            aria-label="Thêm mới"
            :aria-expanded="addDropdownOpen"
            class="w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-default hover:bg-surface-hover rounded transition-colors cursor-pointer"
            @click="toggleAddDropdown"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>

          <div
            v-if="addDropdownOpen"
            data-test="sidebar-add-dropdown"
            role="menu"
            class="absolute right-0 mt-1 w-44 rounded-md bg-surface-overlay border border-border-default shadow-lg py-1 z-50"
          >
            <button
              type="button"
              role="menuitem"
              data-test="add-request-item"
              aria-label="Request mới"
              title="Request mới (Ctrl+N)"
              class="w-full px-3 py-1.5 text-left text-xs text-text-primary hover:bg-surface-hover flex items-center gap-2 cursor-pointer"
              @click="handleCreateRequest"
            >
              <span>📄 New Request</span>
            </button>
            <button
              type="button"
              role="menuitem"
              data-test="add-folder-item"
              aria-label="Thư mục mới"
              title="Thư mục mới (Ctrl+Shift+N)"
              class="w-full px-3 py-1.5 text-left text-xs text-text-primary hover:bg-surface-hover flex items-center gap-2 cursor-pointer"
              @click="handleCreateFolder"
            >
              <span>📁 New Folder</span>
            </button>
          </div>
        </div>
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
