<script lang="ts" setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useCollectionStore } from '@/stores/collectionStore'
import { useFlowStore } from '@/stores/flowStore'
import { useUiStore } from '@/stores/uiStore'
import { useRequestStore } from '@/stores/requestStore'
import TreeNodeRow from './TreeNodeRow.vue'
import { filterTree, filterFlowTree } from '@/utils/treeFilter'
import { useI18n } from '@/i18n'

const { t } = useI18n()
const store = useCollectionStore()
const flowStore = useFlowStore()
const uiStore = useUiStore()
const requestStore = useRequestStore()

const isFlowsMode = computed(() => uiStore.workspaceMode === 'flows')

const filterQuery = ref('')
const savedExpandedFolders = ref<Set<string> | null>(null)
const savedExpandedFlowFolders = ref<Set<string> | null>(null)

const clearFilter = () => {
  filterQuery.value = ''
}

const onFilterInput = (e: Event) => {
  filterQuery.value = (e.target as HTMLInputElement).value
}

const collapseAll = () => {
  if (isFlowsMode.value) {
    flowStore.expandedFlowFolders = new Set<string>()
    if (!filterQuery.value.trim() && savedExpandedFlowFolders.value) {
      savedExpandedFlowFolders.value = new Set<string>()
    }
    return
  }
  store.expandedFolders = new Set<string>()
  if (!filterQuery.value.trim() && savedExpandedFolders.value) {
    savedExpandedFolders.value = new Set<string>()
  }
}

const sortAlphabet = async () => {
  if (isFlowsMode.value) {
    await flowStore.sortFlowNodes('')
    return
  }
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

const flowFilterResult = computed(() => {
  return filterFlowTree(flowStore.flowTree, filterQuery.value, {
    activeFlowId: flowStore.activeFlowId,
    activeFlowName: flowStore.currentFlow?.name,
    activeFlowDescription: flowStore.currentFlow?.description
  })
})

const displayedTree = computed(() => filterResult.value.filtered)
const displayedFlowTree = computed(() => flowFilterResult.value.filtered)

watch(
  () => filterQuery.value,
  (newQ, oldQ) => {
    const trimmedNew = newQ.trim()
    const trimmedOld = (oldQ || '').trim()

    if (trimmedNew) {
      if (!trimmedOld) {
        savedExpandedFolders.value = new Set(store.expandedFolders)
        savedExpandedFlowFolders.value = new Set(flowStore.expandedFlowFolders)
      } else {
        store.expandedFolders = new Set(savedExpandedFolders.value || [])
        flowStore.expandedFlowFolders = new Set(savedExpandedFlowFolders.value || [])
      }
      for (const folderId of filterResult.value.expandedFolderIds) {
        store.expandedFolders.add(folderId)
      }
      for (const folderId of flowFilterResult.value.expandedFolderIds) {
        flowStore.expandedFlowFolders.add(folderId)
      }
    } else {
      if (savedExpandedFolders.value) {
        store.expandedFolders = new Set(savedExpandedFolders.value)
        savedExpandedFolders.value = null
      }
      if (savedExpandedFlowFolders.value) {
        flowStore.expandedFlowFolders = new Set(savedExpandedFlowFolders.value)
        savedExpandedFlowFolders.value = null
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
  () => flowStore.flowTree,
  () => {
    if (filterQuery.value.trim()) {
      for (const folderId of flowFilterResult.value.expandedFolderIds) {
        flowStore.expandedFlowFolders.add(folderId)
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

const handleCreateFlow = () => {
  addDropdownOpen.value = false
  void flowStore.createFlow()
}

const handleCreateFlowFolder = () => {
  addDropdownOpen.value = false
  void flowStore.createFlowFolder()
}

const handleSwitchMode = (mode: 'apis' | 'flows') => {
  addDropdownOpen.value = false
  uiStore.setWorkspaceMode(mode)
}

const handleSmartReload = async () => {
  if (store.loading || flowStore.loading) return
  await store.smartReload()
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
    uiStore.openContextMenu(
      e.clientX,
      e.clientY,
      '',
      isFlowsMode.value ? 'flow_folder' : 'folder'
    )
  }
}

const isRootDragOver = ref(false)

watch(
  () => (isFlowsMode.value ? flowStore.draggingNode : store.draggingNode),
  (node) => {
    if (!node) {
      isRootDragOver.value = false
    }
  }
)

const onRootDragOver = (e: DragEvent) => {
  const target = e.target as HTMLElement | null
  if (target?.closest('[data-tree-node]') || target?.closest('[data-tree-row]')) {
    isRootDragOver.value = false
    return
  }

  if (isFlowsMode.value) {
    const dragging = flowStore.draggingNode
    if (!dragging) return
    if (flowStore.canMoveNodeTo(dragging.id, dragging.type, '')) {
      e.preventDefault()
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move'
      }
      isRootDragOver.value = true
    } else {
      isRootDragOver.value = false
    }
    return
  }

  const dragging = store.draggingNode
  if (!dragging) return

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
  isRootDragOver.value = false
  if (isFlowsMode.value) {
    const dragging = flowStore.draggingNode
    if (!dragging) return
    if (flowStore.canMoveNodeTo(dragging.id, dragging.type, '')) {
      e.preventDefault()
      flowStore.setDraggingNode(null)
      await flowStore.moveFlowNode(dragging.id, dragging.type, '')
    }
    return
  }

  const dragging = store.draggingNode
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
    :aria-label="store.activeCollection?.name ? t('sidebar.collectionWithName', { name: store.activeCollection.name }) : t('sidebar.collection')"
  >
    <!-- Workspace Mode Switcher [ APIs | Flows ] -->
    <div class="px-2 pt-2 pb-1.5 border-b border-border-default shrink-0">
      <div
        class="grid grid-cols-2 p-0.5 rounded bg-surface-base border border-border-default"
        role="tablist"
        :aria-label="t('sidebar.workspaceMode')"
      >
        <button
          type="button"
          role="tab"
          data-test="workspace-mode-apis"
          :aria-selected="!isFlowsMode"
          class="py-1 px-2 text-xs font-medium rounded transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          :class="!isFlowsMode
            ? 'bg-zinc-800 text-white shadow-sm'
            : 'text-text-secondary hover:text-zinc-200 hover:bg-zinc-800/50'"
          @click="handleSwitchMode('apis')"
        >
          <svg
            aria-hidden="true"
            class="w-3.5 h-3.5 text-indigo-400 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
          <span>APIs</span>
        </button>
        <button
          type="button"
          role="tab"
          data-test="workspace-mode-flows"
          :aria-selected="isFlowsMode"
          class="py-1 px-2 text-xs font-medium rounded transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          :class="isFlowsMode
            ? 'bg-zinc-800 text-white shadow-sm'
            : 'text-text-secondary hover:text-zinc-200 hover:bg-zinc-800/50'"
          @click="handleSwitchMode('flows')"
        >
          <svg
            aria-hidden="true"
            class="w-3.5 h-3.5 text-pink-400 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="3" y="3" width="7" height="18" rx="1"></rect>
            <rect x="14" y="3" width="7" height="18" rx="1"></rect>
          </svg>
          <span>Flows</span>
        </button>
      </div>
    </div>

    <div class="p-2 border-b border-border-default shrink-0 flex flex-col gap-1.5">
      <!-- Row 1: Tree Filter Search Input -->
      <div data-test="sidebar-search-row" class="relative w-full flex items-center">
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
          :aria-label="isFlowsMode ? t('sidebar.searchAriaLabelFlow') : t('sidebar.searchAriaLabelApi')"
          :placeholder="isFlowsMode ? t('sidebar.searchPlaceholderFlow') : t('sidebar.searchPlaceholderApi')"
          class="w-full pl-8 pr-7 py-1 text-xs rounded bg-surface-base border border-border-default hover:border-border-hover focus:border-brand-primary focus:outline-none transition-colors text-text-primary placeholder:text-text-muted"
          @keydown="handleFilterKeydown"
        />
        <button
          v-if="filterQuery"
          type="button"
          data-test="clear-filter-btn"
          :title="t('sidebar.clearFilter')"
          class="absolute right-1.5 p-0.5 rounded text-text-muted hover:text-text-primary cursor-pointer hover:bg-surface-hover"
          @click="clearFilter"
        >
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <!-- Row 2: Action buttons + Add pill -->
      <div data-test="sidebar-toolbar-row" class="flex items-center justify-between gap-1">
        <div class="flex items-center gap-0.5 shrink-0">
          <!-- Reload Data from Disk -->
          <button
            type="button"
            data-test="sidebar-reload-btn"
            :title="store.hasExternalChanges ? t('sidebar.hasExternalChanges') : t('sidebar.reloadDisk')"
            :aria-label="t('sidebar.reloadDisk')"
            class="relative w-7 h-7 flex items-center justify-center text-text-muted hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors cursor-pointer"
            @click="handleSmartReload"
          >
            <svg
              class="w-3.5 h-3.5"
              :class="{ 'animate-spin text-brand-primary': store.loading || flowStore.loading }"
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
            :title="t('sidebar.collapseAll')"
            :aria-label="t('sidebar.collapseAll')"
            class="w-7 h-7 flex items-center justify-center text-text-muted hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors cursor-pointer"
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
            :title="t('sidebar.sortAlphabet')"
            :aria-label="t('sidebar.sortAlphabet')"
            class="w-7 h-7 flex items-center justify-center text-text-muted hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors cursor-pointer"
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
        </div>

        <!-- Add Request / Folder or Flow / Flow Folder -->
        <div ref="addMenuContainerRef" class="relative shrink-0">
          <button
            type="button"
            data-test="sidebar-add-btn"
            :title="isFlowsMode ? t('sidebar.addNewTitleFlow') : t('sidebar.addNewTitleApi')"
            :aria-label="t('sidebar.addNewAria')"
            :aria-expanded="addDropdownOpen"
            class="px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-600/15 hover:bg-indigo-600/25 text-indigo-300 border border-indigo-500/30 flex items-center gap-1 transition-colors cursor-pointer"
            @click="toggleAddDropdown"
          >
            <span>{{ t('sidebar.addNew') }}</span>
            <svg class="w-3 h-3 shrink-0 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>

          <div
            v-if="addDropdownOpen"
            data-test="sidebar-add-dropdown"
            role="menu"
            class="absolute right-0 mt-1 w-44 rounded-md bg-surface-overlay border border-border-default shadow-lg py-1 z-50"
          >
            <template v-if="isFlowsMode">
              <button
                type="button"
                role="menuitem"
                data-test="add-flow-item"
                :aria-label="t('sidebar.newFlow')"
                :title="t('sidebar.newFlow') + ' (Ctrl+N)'"
                class="w-full px-3 py-1.5 text-left text-xs text-text-primary hover:bg-surface-hover flex items-center gap-2 cursor-pointer"
                @click="handleCreateFlow"
              >
                <span>🔀 {{ t('sidebar.newFlow') }}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                data-test="add-flow-folder-item"
                :aria-label="t('sidebar.newFlowFolder')"
                :title="t('sidebar.newFlowFolder') + ' (Ctrl+Shift+N)'"
                class="w-full px-3 py-1.5 text-left text-xs text-text-primary hover:bg-surface-hover flex items-center gap-2 cursor-pointer"
                @click="handleCreateFlowFolder"
              >
                <span>📁 {{ t('sidebar.newFlowFolder') }}</span>
              </button>
            </template>
            <template v-else>
              <button
                type="button"
                role="menuitem"
                data-test="add-request-item"
                :aria-label="t('sidebar.newRequest')"
                :title="t('sidebar.newRequest') + ' (Ctrl+N)'"
                class="w-full px-3 py-1.5 text-left text-xs text-text-primary hover:bg-surface-hover flex items-center gap-2 cursor-pointer"
                @click="handleCreateRequest"
              >
                <span>📄 {{ t('sidebar.newRequest') }}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                data-test="add-folder-item"
                :aria-label="t('sidebar.newFolder')"
                :title="t('sidebar.newFolder') + ' (Ctrl+Shift+N)'"
                class="w-full px-3 py-1.5 text-left text-xs text-text-primary hover:bg-surface-hover flex items-center gap-2 cursor-pointer"
                @click="handleCreateFolder"
              >
                <span>📁 {{ t('sidebar.newFolder') }}</span>
              </button>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- Disk External Change Warning Banner -->
    <div
      v-if="store.hasExternalChanges"
      data-test="external-change-banner"
      class="mx-2 mt-2 mb-0.5 px-2.5 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-md flex items-center justify-between gap-2 text-[11px] text-amber-300 shadow-sm shrink-0"
    >
      <div class="flex items-center gap-1.5 min-w-0">
        <svg class="w-3.5 h-3.5 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
        <span class="truncate">{{ t('sidebar.externalChangeDetected') }}</span>
      </div>
      <button
        type="button"
        data-test="external-change-reload-btn"
        class="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-medium text-[11px] shrink-0 transition-colors cursor-pointer"
        @click.stop="handleSmartReload"
      >
        {{ t('sidebar.reload') }}
      </button>
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
      <template v-if="isFlowsMode">
        <div v-if="flowStore.loading && flowStore.flowTree.length === 0" class="px-3 py-4 text-center ui-sm text-text-muted">{{ t('common.loading') }}</div>
        <div v-else-if="flowStore.error && flowStore.flowTree.length === 0" class="px-3 py-4 ui-sm text-text-danger">{{ flowStore.error }}</div>
        <div v-else-if="flowStore.flowTree.length === 0" class="px-3 py-8 text-center flex flex-col items-center gap-2">
          <span class="ui-sm text-text-muted">{{ t('sidebar.emptyFlow') }}</span>
          <button 
            type="button"
            data-test="create-empty-flow-btn"
            @click="flowStore.createFlow()"
            class="text-brand-primary hover:text-brand-primary-hover ui-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded cursor-pointer"
          >
            {{ t('sidebar.createEmptyFlow') }}
          </button>
        </div>
        <div v-else-if="filterQuery.trim() && displayedFlowTree.length === 0" data-test="tree-filter-empty" class="px-3 py-8 text-center flex flex-col items-center gap-2">
          <span class="ui-sm text-text-muted">{{ t('sidebar.noFilterResults', { query: filterQuery }) }}</span>
          <button 
            type="button"
            data-test="clear-filter-empty-btn"
            @click="clearFilter"
            class="text-brand-primary hover:text-brand-primary-hover ui-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded cursor-pointer"
          >
            {{ t('sidebar.clearFilter') }}
          </button>
        </div>
        <div v-else class="flex flex-col min-h-full">
          <div>
            <TreeNodeRow 
              v-for="node in displayedFlowTree" 
              :key="node.id"
              :node="node"
              :depth="0"
            />
          </div>
          <div class="flex-1 min-h-[48px]" data-test="tree-root-empty-space" />
        </div>
      </template>
      <template v-else>
        <div v-if="store.loading && store.tree.length === 0" class="px-3 py-4 text-center ui-sm text-text-muted">{{ t('common.loading') }}</div>
        <div v-else-if="store.error" class="px-3 py-4 ui-sm text-text-danger">{{ store.error }}</div>
        <div v-else-if="store.tree.length === 0" class="px-3 py-8 text-center flex flex-col items-center gap-2">
          <span class="ui-sm text-text-muted">{{ t('sidebar.emptyCollection') }}</span>
          <button 
            @click="store.createRequest()"
            class="text-brand-primary hover:text-brand-primary-hover ui-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded"
          >
            {{ t('sidebar.createEmptyRequest') }}
          </button>
        </div>
        <div v-else-if="filterQuery.trim() && displayedTree.length === 0" data-test="tree-filter-empty" class="px-3 py-8 text-center flex flex-col items-center gap-2">
          <span class="ui-sm text-text-muted">{{ t('sidebar.noFilterResults', { query: filterQuery }) }}</span>
          <button 
            type="button"
            data-test="clear-filter-empty-btn"
            @click="clearFilter"
            class="text-brand-primary hover:text-brand-primary-hover ui-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded cursor-pointer"
          >
            {{ t('sidebar.clearFilter') }}
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
      </template>
    </div>
  </nav>
</template>
