<script lang="ts" setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import EmptyStateRequest from '@/components/EmptyStateRequest.vue'
import ResponseViewer from '@/components/ResponseViewer.vue'
import RequestEditor from '@/components/RequestEditor.vue'
import FolderEditor from '@/components/FolderEditor.vue'
import { useCollectionStore } from '@/stores/collectionStore'
import { useResponseStore } from '@/stores/responseStore'
import { useUiStore } from '@/stores/uiStore'

const collectionStore = useCollectionStore()
const responseStore = useResponseStore()
const uiStore = useUiStore()

const contentAreaRef = ref<HTMLElement | null>(null)
const isDraggingSplitter = ref(false)

const handleContentMouseMove = (e: MouseEvent) => {
  if (!isDraggingSplitter.value) return
  const rect = contentAreaRef.value?.getBoundingClientRect()
  const containerHeight = rect && rect.height > 0
    ? rect.height
    : (typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 600)
  const topOffset = rect ? rect.top : 0
  const relativeY = e.clientY - topOffset
  const ratio = (relativeY / containerHeight) * 100
  uiStore.setRequestPaneRatio(ratio, containerHeight)
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
  responseStore.clear()
})
watch(() => collectionStore.activeFolderId, () => {
  responseStore.clear()
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
    <div
      data-test="request-pane"
      :class="[
        !collectionStore.activeRequestId ? 'flex-1' : '',
        'min-w-0 overflow-y-auto'
      ]"
      :style="collectionStore.activeRequestId ? { height: `${uiStore.requestPaneRatio}%`, minHeight: '120px' } : undefined"
    >
      <RequestEditor v-if="collectionStore.activeRequestId" />
      <FolderEditor v-else-if="collectionStore.activeFolderId" />
      <EmptyStateRequest v-else />
    </div>
    <div
      v-if="collectionStore.activeRequestId"
      data-test="content-splitter"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Điều chỉnh tỷ lệ khung Request và Response"
      class="h-1.5 shrink-0 cursor-row-resize select-none transition-colors hover:bg-brand-primary"
      :class="isDraggingSplitter ? 'bg-brand-primary' : 'bg-transparent'"
      @mousedown="startContentResize"
      @dblclick="uiStore.resetRequestPaneRatio()"
    />
    <div
      v-if="collectionStore.activeRequestId"
      data-test="response-pane"
      class="flex-1 min-h-[120px] min-w-0 overflow-y-auto border-t border-border-default"
    >
      <ResponseViewer />
    </div>
  </main>
</template>
