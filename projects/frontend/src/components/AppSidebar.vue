<script lang="ts" setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useCollectionStore } from '@/stores/collectionStore'
import { useUiStore } from '@/stores/uiStore'
import { useRequestStore } from '@/stores/requestStore'
import TreeNodeRow from './TreeNodeRow.vue'
import { filterTree } from '@/utils/treeFilter'

const store = useCollectionStore()
const uiStore = useUiStore()
const requestStore = useRequestStore()

const filterQuery = ref('')
const savedExpandedFolders = ref<Set<string> | null>(null)

const clearFilter = () => {
  filterQuery.value = ''
}

const onFilterInput = (e: Event) => {
  filterQuery.value = (e.target as HTMLInputElement).value
}

const collapseAll = () => {
  store.expandedFolders = new Set<string>()
  if (savedExpandedFolders.value) {
    savedExpandedFolders.value = new Set<string>()
  }
}

const sortAlphabet = async () => {
  await store.sortNodes('')
}

const handleFilterKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && filterQuery.value) {
    e.stopPropagation()
    clearFilter()
  }
}

const filterResult = computed(() => {
  return filterTree(store.tree, filterQuery.value, {
    activeRequestId: requestStore.current?.id,
    activeRequestUrl: requestStore.current?.url,
    activeRequestBody: requestStore.current?.body?.content
  })
})

const displayedTree = computed(() => filterResult.value.filtered)

watch(
  () => filterQuery.value,
  (newQ, oldQ) => {
    const trimmedNew = newQ.trim()
    const trimmedOld = (oldQ || '').trim()

    if (trimmedNew) {
      if (!trimmedOld) {
        savedExpandedFolders.value = new Set(store.expandedFolders)
      }
      for (const folderId of filterResult.value.expandedFolderIds) {
        store.expandedFolders.add(folderId)
      }
    } else {
      if (savedExpandedFolders.value) {
        store.expandedFolders = new Set(savedExpandedFolders.value)
        savedExpandedFolders.value = null
      }
    }
  }
)

watch(
  () => store.tree,
  () => {
    if (filterQuery.value.trim()) {
      for (const folderId of filterResult.value.expandedFolderIds) {
        store.expandedFolders.add(folderId)
      }
    }
  }
)

watch(
  () => uiStore.filterTreeClearTrigger,
  () => {
    if (filterQuery.value) {
      clearFilter()
    }
  }
)

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

const isRootDragOver = ref(false)

watch(
  () => store.draggingNode,
  (node) => {
    if (!node) {
      isRootDragOver.value = false
    }
  }
)

const onRootDragOver = (e: DragEvent) => {
  const dragging = store.draggingNode
  if (!dragging) return

  const target = e.target as HTMLElement | null
  if (target?.closest('[data-tree-node]') || target?.closest('[data-tree-row]')) {
    isRootDragOver.value = false
    return
  }

  if (store.canMoveNodeTo(dragging.id, dragging.type, '')) {
    e.preventDefault()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move'
    }
    isRootDragOver.value = true
  } else {
    isRootDragOver.value = false
  }
}

const onRootDragLeave = (e: DragEvent) => {
  const currentTarget = e.currentTarget as HTMLElement | null
  if (!currentTarget) {
    isRootDragOver.value = false
    return
  }
  const rect = currentTarget.getBoundingClientRect()
  if (
    e.clientX >= rect.left &&
    e.clientX < rect.right &&
    e.clientY >= rect.top &&
    e.clientY < rect.bottom
  ) {
    return
  }
  isRootDragOver.value = false
}

const onRootDrop = async (e: DragEvent) => {
  const dragging = store.draggingNode
  isRootDragOver.value = false
  if (!dragging) return

  if (store.canMoveNodeTo(dragging.id, dragging.type, '')) {
    e.preventDefault()
    store.setDraggingNode(null)
    if (dragging.type === 'folder') {
      await store.moveFolder(dragging.id, '')
    } else {
      await store.moveRequest(dragging.id, '')
    }
  }
}
</script>

<template>
  <nav
    class="shrink-0 bg-surface-raised border-r border-border-default flex flex-col overflow-hidden"
    :style="{ width: `${uiStore.sidebarWidth}px`, minWidth: `${uiStore.sidebarWidth}px` }"
    :aria-label="store.activeCollection?.name ? `Bộ sưu tập: ${store.activeCollection.name}` : 'Bộ sưu tập'"
  >
    <div class="p-2 border-b border-border-default shrink-0 flex items-center gap-1.5">
      <!-- Tree Filter Search Input -->
      <div class="relative flex-1 min-w-0 flex items-center">
        <svg
          class="absolute left-2.5 w-3.5 h-3.5 text-text-muted pointer-events-none"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input
          :value="filterQuery"
          @input="onFilterInput"
          type="text"
          data-test="tree-filter-input"
          aria-label="Tìm kiếm trong bộ sưu tập"
          placeholder="Tìm kiếm request..."
          class="w-full pl-8 pr-7 py-1 text-xs rounded bg-surface-base border border-border-default hover:border-border-hover focus:border-brand-primary focus:outline-none transition-colors text-text-primary placeholder:text-text-muted"
          @keydown="handleFilterKeydown"
        />
        <button
          v-if="filterQuery"
          type="button"
          data-test="clear-filter-btn"
          title="Xóa bộ lọc"
          class="absolute right-1.5 p-0.5 rounded text-text-muted hover:text-text-primary cursor-pointer hover:bg-surface-hover"
          @click="clearFilter"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <!-- Action buttons -->
      <div class="flex items-center gap-0.5 shrink-0">
        <!-- Reload Data from Disk -->
        <button
          type="button"
          data-test="sidebar-reload-btn"
          :title="store.hasExternalChanges ? 'Phát hiện thay đổi từ bên ngoài — Nhấn để tải lại (Ctrl+R)' : 'Tải lại dữ liệu từ đĩa (Ctrl+R)'"
          aria-label="Tải lại dữ liệu từ đĩa"
          class="relative w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-default hover:bg-surface-hover rounded transition-colors cursor-pointer"
          @click="store.smartReload()"
        >
          <svg
            class="w-3.5 h-3.5"
            :class="{ 'animate-spin text-brand-primary': store.loading }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 16h5v5" />
          </svg>
          <!-- Badge báo hiệu có thay đổi từ CLI/Git -->
          <span
            v-if="store.hasExternalChanges"
            data-test="external-change-badge"
            class="absolute top-1 right-1 w-2 h-2 rounded-full bg-brand-primary ring-2 ring-surface-raised animate-pulse"
          />
        </button>

        <!-- Collapse All -->
        <button
          type="button"
          data-test="tree-collapse-all-btn"
          title="Thu gọn tất cả"
          aria-label="Thu gọn tất cả"
          class="w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-default hover:bg-surface-hover rounded transition-colors cursor-pointer"
          @click="collapseAll"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m7 20 5-5 5 5"/>
            <path d="m7 4 5 5 5-5"/>
          </svg>
        </button>

        <!-- Sort Alphabetically -->
        <button
          type="button"
          data-test="tree-sort-alphabet-btn"
          title="Sắp xếp theo thứ tự A-Z"
          aria-label="Sắp xếp theo thứ tự A-Z"
          class="w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-default hover:bg-surface-hover rounded transition-colors cursor-pointer"
          @click="sortAlphabet"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m3 16 4 4 4-4"/>
            <path d="M7 20V4"/>
            <path d="M20 8h-5"/>
            <path d="M15 10V6.5a2.5 2.5 0 0 1 5 0V10"/>
            <path d="M15 14h5l-5 6h5"/>
          </svg>
        </button>

        <!-- Add Request / Folder -->
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

    <!-- Tree Content Area -->
    <div 
      class="flex-1 overflow-y-auto py-2"
      data-test="tree-root-drop-zone"
      :data-root-drop-active="isRootDragOver ? 'true' : undefined"
      :class="{ 'ring-2 ring-inset ring-brand-primary/60 bg-brand-primary/5': isRootDragOver }"
      @dragover="onRootDragOver"
      @dragleave="onRootDragLeave"
      @drop="onRootDrop"
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
      <div v-else-if="filterQuery.trim() && displayedTree.length === 0" data-test="tree-filter-empty" class="px-3 py-8 text-center flex flex-col items-center gap-2">
        <span class="ui-sm text-text-muted">Không tìm thấy kết quả phù hợp cho "{{ filterQuery }}".</span>
        <button 
          type="button"
          data-test="clear-filter-empty-btn"
          @click="clearFilter"
          class="text-brand-primary hover:text-brand-primary-hover ui-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded cursor-pointer"
        >
          Xóa bộ lọc
        </button>
      </div>
      <div v-else class="flex flex-col min-h-full">
        <div>
          <TreeNodeRow 
            v-for="node in displayedTree" 
            :key="node.id"
            :node="node"
            :depth="0"
          />
        </div>
        <div class="flex-1 min-h-[48px]" data-test="tree-root-empty-space" />
      </div>
    </div>
  </nav>
</template>
