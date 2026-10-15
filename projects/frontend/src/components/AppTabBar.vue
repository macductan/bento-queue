<script lang="ts" setup>
import { useTabStore } from '@/stores/tabStore'

const tabStore = useTabStore()

const methodColors: Record<string, string> = {
  get: 'text-method-get',
  post: 'text-method-post',
  put: 'text-method-put',
  patch: 'text-method-patch',
  delete: 'text-method-delete',
  head: 'text-cyan-400',
  options: 'text-purple-400'
}

const getMethodColorClass = (method?: string) => {
  if (!method) return 'text-method-get'
  return methodColors[method.toLowerCase()] || 'text-text-secondary'
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
</script>

<template>
  <div
    v-if="tabStore.tabs.length > 0"
    data-test="app-tab-bar"
    role="tablist"
    aria-label="Danh sách các tab đang mở"
    class="h-9 shrink-0 bg-surface-base border-b border-border-default flex items-center overflow-x-auto hide-scrollbar select-none"
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
        class="max-w-[160px] truncate ui-sm"
        :title="displayName(tab.name)"
      >
        {{ displayName(tab.name) }}
      </span>

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
