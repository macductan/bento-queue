<script lang="ts" setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import AppTabBar from '@/components/AppTabBar.vue'
import EmptyStateRequest from '@/components/EmptyStateRequest.vue'
import ResponseViewer from '@/components/ResponseViewer.vue'
import RequestEditor from '@/components/RequestEditor.vue'
import FolderEditor from '@/components/FolderEditor.vue'
import { useCollectionStore } from '@/stores/collectionStore'
import { useUiStore } from '@/stores/uiStore'
import { useResponseStore } from '@/stores/responseStore'

const collectionStore = useCollectionStore()
const uiStore = useUiStore()
const responseStore = useResponseStore()

const hasResponseData = computed(() => {
  return !!(
    responseStore.response ||
    responseStore.loading ||
    responseStore.error ||
    responseStore.executionLogs.length > 0 ||
    responseStore.scriptLogs.length > 0 ||
    responseStore.scriptError
  )
})

const isResponseCollapsed = computed(() => {
  if (uiStore.responsePaneCollapsed) return true
  if (!hasResponseData.value && !uiStore.responsePaneExplicitlyOpened) return true
  return false
})

const contentAreaRef = ref<HTMLElement | null>(null)
const requestPaneRef = ref<HTMLElement | null>(null)
const isDraggingSplitter = ref(false)
let dragStartY = 0
let dragStartHeight = 0
let dragContainerHeight = 600

const handleContentMouseMove = (e: MouseEvent) => {
  if (!isDraggingSplitter.value) return
  const deltaY = e.clientY - dragStartY
  const newHeight = dragStartHeight + deltaY
  const ratio = (newHeight / dragContainerHeight) * 100
  uiStore.setRequestPaneRatio(ratio, dragContainerHeight)
}

const stopContentResize = () => {
  if (isDraggingSplitter.value) {
    isDraggingSplitter.value = false
    document.body.style.userSelect = ''
  }
  window.removeEventListener('mousemove', handleContentMouseMove)
  window.removeEventListener('mouseup', stopContentResize)
}

const startContentResize = (e: MouseEvent) => {
  if (e.button !== 0) return
  e.preventDefault()
  isDraggingSplitter.value = true
  document.body.style.userSelect = 'none'

  const mainRect = contentAreaRef.value?.getBoundingClientRect()
  const reqRect = requestPaneRef.value?.getBoundingClientRect()

  dragStartY = e.clientY
  dragContainerHeight = mainRect && mainRect.height > 0
    ? mainRect.height
    : (typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 600)
  dragStartHeight = reqRect && reqRect.height > 0
    ? reqRect.height
    : (dragContainerHeight * (uiStore.requestPaneRatio / 100))

  window.addEventListener('mousemove', handleContentMouseMove)
  window.addEventListener('mouseup', stopContentResize)
}

const syncContentHeight = () => {
  const rect = contentAreaRef.value?.getBoundingClientRect()
  if (rect && rect.height > 0) {
    uiStore.setRequestPaneRatio(uiStore.requestPaneRatio, rect.height)
  }
}

watch(() => collectionStore.activeRequestId, (newId) => {
  if (!newId) {
    stopContentResize()
  }
})

watch(() => [responseStore.response, responseStore.error, responseStore.loading], ([res, err, loading]) => {
  if (res || err || loading) {
    uiStore.setResponsePaneCollapsed(false)
  }
})

onMounted(() => {
  syncContentHeight()
  window.addEventListener('resize', syncContentHeight)
})

onUnmounted(() => {
  stopContentResize()
  window.removeEventListener('resize', syncContentHeight)
})
</script>

<template>
  <main ref="contentAreaRef" class="flex-1 flex flex-col min-w-0 overflow-hidden">
    <AppTabBar />
    <div
      ref="requestPaneRef"
      data-test="request-pane"
      :class="[
        (!collectionStore.activeRequestId || isResponseCollapsed) ? 'flex-1' : '',
        'min-w-0 overflow-y-auto'
      ]"
      :style="collectionStore.activeRequestId && !isResponseCollapsed ? { height: `${uiStore.requestPaneRatio}%`, minHeight: '120px' } : undefined"
    >
      <RequestEditor v-if="collectionStore.activeRequestId" />
      <FolderEditor v-else-if="collectionStore.activeFolderId" />
      <EmptyStateRequest v-else />
    </div>

    <!-- Collapsed Response Dock Bar -->
    <div
      v-if="collectionStore.activeRequestId && isResponseCollapsed"
      data-test="response-dock-bar"
      class="h-8 shrink-0 bg-surface-raised border-t border-border-default px-3 flex items-center justify-between select-none cursor-pointer hover:bg-surface-hover transition-colors"
      @click="uiStore.setResponsePaneCollapsed(false)"
    >
      <div class="flex items-center gap-2 text-xs font-medium text-text-secondary">
        <svg class="w-3.5 h-3.5 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span>Response</span>
        <span
          v-if="responseStore.response"
          class="px-1.5 py-0.5 rounded font-mono text-[10px]"
          :class="responseStore.response.status_code < 400 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'"
        >
          {{ responseStore.response.status_code }} {{ responseStore.response.status_text }} ({{ responseStore.response.time_ms }}ms)
        </span>
      </div>
      <button
        type="button"
        data-test="toggle-response-pane-btn"
        title="Mở rộng khung Response"
        aria-label="Mở rộng khung Response"
        class="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-overlay transition-colors cursor-pointer"
        @click.stop="uiStore.setResponsePaneCollapsed(false)"
      >
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="18 15 12 9 6 15"></polyline>
        </svg>
      </button>
    </div>

    <!-- Horizontal Splitter -->
    <div
      v-if="collectionStore.activeRequestId && !isResponseCollapsed"
      data-test="content-splitter"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Điều chỉnh tỷ lệ khung Request và Response"
      class="h-1 shrink-0 cursor-row-resize select-none bg-border-default hover:bg-brand-primary transition-colors"
      :class="isDraggingSplitter ? 'bg-brand-primary' : ''"
      @mousedown="startContentResize"
      @dblclick="uiStore.resetRequestPaneRatio()"
    ></div>

    <!-- Expanded Response Pane -->
    <div
      v-if="collectionStore.activeRequestId && !isResponseCollapsed"
      data-test="response-pane"
      class="flex-1 min-h-[100px] min-w-0 overflow-y-auto"
    >
      <ResponseViewer />
    </div>
  </main>
</template>
