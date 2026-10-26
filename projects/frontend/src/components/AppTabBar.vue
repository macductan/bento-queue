<script lang="ts" setup>
import { useTabStore, type TabItem } from '@/stores/tabStore'
import { useCollectionStore } from '@/stores/collectionStore'

const tabStore = useTabStore()
const collectionStore = useCollectionStore()

const getTabPath = (tab: TabItem): string => {
  const full = collectionStore.findFolderPath(collectionStore.tree, tab.entityId) || []
  const folderParts = full.filter(n => n.type === 'folder' && n.id !== tab.entityId).map(n => n.name)
  if (folderParts.length > 0) {
    return folderParts.join(' / ')
  }
  return collectionStore.activeCollection?.name || ''
}

const getTabFullPath = (tab: TabItem): string => {
  const full = collectionStore.findFolderPath(collectionStore.tree, tab.entityId) || []
  const folderParts = full.filter(n => n.type === 'folder' && n.id !== tab.entityId).map(n => n.name)
  const collName = collectionStore.activeCollection?.name
  const parts: string[] = []
  if (collName) parts.push(collName)
  parts.push(...folderParts)
  parts.push(displayName(tab.name))
  return parts.join(' / ')
}

const methodColors: Record<string, string> = {
  get: 'text-method-get method-badge-get',
  post: 'text-method-post method-badge-post',
  put: 'text-method-put method-badge-put',
  patch: 'text-method-patch method-badge-patch',
  delete: 'text-method-delete method-badge-delete',
  head: 'text-method-head method-badge-head',
  options: 'text-method-options method-badge-options'
}

const getMethodColorClass = (method?: string) => {
  const normalized = method?.trim().toLowerCase()
  if (!normalized) return 'text-method-get method-badge-get'
  return methodColors[normalized] || 'text-text-secondary method-badge-options'
}

const displayName = (name?: string) => {
  return name?.trim() || '(không tên)'
}

const handleActivate = (tabId: string) => {
  void tabStore.activateTab(tabId)
}

const handleClose = (tabId: string) => {
  void tabStore.closeTab(tabId)
}

const handleMiddleMouseDown = (e: MouseEvent) => {
  if (e.button === 1) {
    e.preventDefault()
  }
}

const handleAuxClick = (e: MouseEvent, tabId: string) => {
  if (e.button === 1) {
    e.preventDefault()
    void tabStore.closeTab(tabId)
  }
}

const handleWheel = (e: WheelEvent) => {
  const container = e.currentTarget as HTMLElement | null
  if (!container || container.scrollWidth <= container.clientWidth) return
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    const factor = e.deltaMode === 1 ? 24 : e.deltaMode === 2 ? container.clientWidth : 1
    container.scrollLeft += e.deltaY * factor
  }
}
</script>

<template>
  <div
    v-if="tabStore.tabs.length > 0"
    data-test="app-tab-bar"
    role="tablist"
    aria-label="Danh sách các tab đang mở"
    @wheel.passive="handleWheel"
    class="h-10 shrink-0 bg-surface-base border-b border-border-default flex items-center overflow-x-auto hide-scrollbar select-none"
  >
    <div
      v-for="tab in tabStore.tabs"
      :key="tab.id"
      data-test="app-tab-item"
      :data-tab-id="tab.id"
      :data-active="tabStore.activeTabId === tab.id ? 'true' : undefined"
      role="tab"
      :aria-selected="tabStore.activeTabId === tab.id"
      tabindex="0"
      class="group h-full px-3 flex items-center gap-2 border-r border-border-default cursor-pointer shrink-0 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary"
      :class="
        tabStore.activeTabId === tab.id
          ? 'border-b-2 border-b-brand-primary bg-surface-raised text-text-primary'
          : 'border-b-2 border-b-transparent bg-surface-base text-text-secondary hover:bg-surface-hover hover:text-text-primary'
      "
      @click="handleActivate(tab.id)"
      @mousedown="handleMiddleMouseDown"
      @auxclick="e => handleAuxClick(e, tab.id)"
      @keydown.enter.prevent="handleActivate(tab.id)"
      @keydown.space.prevent="handleActivate(tab.id)"
    >
      <!-- Tab Content (Dim path on top + method badge & name below) -->
      <div class="flex flex-col justify-center min-w-0 pr-1 py-0.5">
        <span
          v-if="getTabPath(tab)"
          data-test="tab-path"
          class="text-[9px] text-text-muted/60 truncate leading-none mb-0.5 select-none font-normal max-w-[180px]"
          :title="getTabFullPath(tab)"
        >
          {{ getTabPath(tab) }}
        </span>
        <div class="flex items-center gap-1.5 min-w-0">
          <!-- Request Method Badge -->
          <span
            v-if="tab.type === 'request'"
            data-test="tab-method-badge"
            class="text-[10px] font-mono font-bold shrink-0"
            :class="getMethodColorClass(tab.method)"
          >
            {{ tab.method || 'GET' }}
          </span>

          <!-- Folder Icon -->
          <svg
            v-else
            data-test="tab-folder-icon"
            class="w-3.5 h-3.5 shrink-0 text-text-muted"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-1.22-1.8A2 2 0 0 0 7.53 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"></path>
          </svg>

          <!-- Tab Name -->
          <span
            data-test="tab-name"
            class="max-w-[160px] truncate ui-sm font-medium"
            :title="getTabFullPath(tab)"
          >
            {{ displayName(tab.name) }}
          </span>
        </div>
      </div>

      <!-- Unsaved Dot -->
      <span
        v-if="tab.isDirty"
        data-test="tab-unsaved-dot"
        class="w-2 h-2 rounded-full bg-unsaved-dot shrink-0"
        title="Chưa lưu"
        aria-label="Chưa lưu"
      ></span>

      <!-- Close Button -->
      <button
        type="button"
        data-test="tab-close-btn"
        class="w-4 h-4 rounded flex items-center justify-center shrink-0 text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-opacity outline-none"
        :class="
          tabStore.activeTabId === tab.id
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
        "
        aria-label="Đóng tab"
        title="Đóng tab (Ctrl+W)"
        @click.stop="handleClose(tab.id)"
        @mousedown.stop
        @auxclick.stop
      >
        ✕
      </button>
    </div>
  </div>
</template>
