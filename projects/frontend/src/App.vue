<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import ContentArea from '@/components/ContentArea.vue'
import ToastNotification from '@/components/ToastNotification.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import TreeContextMenu from '@/components/TreeContextMenu.vue'
import UnsavedChangesDialog from '@/components/UnsavedChangesDialog.vue'
import EnvModal from '@/components/environment/EnvModal.vue'
import GitSyncModal from '@/components/GitSyncModal.vue'
import GitConflictResolverModal from '@/components/GitConflictResolverModal.vue'
import HistoryModal from '@/components/HistoryModal.vue'
import MockServerModal from '@/components/MockServerModal.vue'
import { useCollectionStore } from '@/stores/collectionStore'
import { useUiStore } from '@/stores/uiStore'
import { useRequestStore } from '@/stores/requestStore'
import { useResponseStore } from '@/stores/responseStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useTabStore } from '@/stores/tabStore'
import { installGlobalInputUndo } from '@/utils/inputUndo'

const collectionStore = useCollectionStore()
const uiStore = useUiStore()
const requestStore = useRequestStore()
const responseStore = useResponseStore()
const envStore = useEnvironmentStore()
const tabStore = useTabStore()

let cleanupInputUndo: (() => void) | null = null

const isDraggingSidebar = ref(false)

const handleSidebarMouseMove = (e: MouseEvent) => {
  if (!isDraggingSidebar.value) return
  uiStore.setSidebarWidth(e.clientX, window.innerWidth)
}

const stopSidebarResize = () => {
  if (isDraggingSidebar.value) {
    isDraggingSidebar.value = false
    document.body.style.userSelect = ''
  }
  window.removeEventListener('mousemove', handleSidebarMouseMove)
  window.removeEventListener('mouseup', stopSidebarResize)
}

const startSidebarResize = (e: MouseEvent) => {
  if (e.button !== 0) return
  e.preventDefault()
  isDraggingSidebar.value = true
  document.body.style.userSelect = 'none'
  window.addEventListener('mousemove', handleSidebarMouseMove)
  window.addEventListener('mouseup', stopSidebarResize)
}

const handleWindowResize = () => {
  uiStore.setSidebarWidth(uiStore.sidebarWidth, window.innerWidth)
}

const handleKeyDown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
    e.preventDefault()
    if (uiStore.confirm !== null || uiStore.contextMenu !== null || uiStore.unsavedPrompt !== null || uiStore.envModalOpen || uiStore.settingsModalOpen || uiStore.gitSyncModalOpen || uiStore.gitConflictModalOpen || uiStore.historyModalOpen || uiStore.mockServerModalOpen) {
      return
    }
    if (tabStore.activeTabId) {
      void tabStore.closeTab(tabStore.activeTabId)
    }
    return
  }

  if (uiStore.confirm !== null || uiStore.contextMenu !== null || uiStore.unsavedPrompt !== null || uiStore.envModalOpen || uiStore.settingsModalOpen || uiStore.gitSyncModalOpen || uiStore.gitConflictModalOpen || uiStore.historyModalOpen || uiStore.mockServerModalOpen) {
    return
  }


  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    if (requestStore.current) {
      void requestStore.saveCurrent()
    }
    return
  }

  if (e.ctrlKey && e.key.toLowerCase() === 'l') {
    e.preventDefault()
    uiStore.triggerFocusUrl()
    return
  }


  if (e.ctrlKey && e.key === 'Enter') {
    e.preventDefault()
    if (requestStore.current && !responseStore.loading) {
      void responseStore.send()
    }
    return
  }

  if (e.key === 'Escape' && responseStore.loading && !e.defaultPrevented) {
    e.preventDefault()
    void responseStore.abort()
    return
  }

  const target = e.target as HTMLElement
  const isEditing = target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  if (isEditing) return

  if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'e') {
    e.preventDefault()
    uiStore.triggerFocusEnv()
    return
  }

  if (e.ctrlKey && e.key.toLowerCase() === 'n') {
    e.preventDefault()
    if (e.shiftKey) {
      collectionStore.createFolder()
    } else {
      collectionStore.createRequest()
    }
  }
}

onMounted(async () => {
  cleanupInputUndo = installGlobalInputUndo(window)
  if (window.innerWidth > 0) {
    handleWindowResize()
  }
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('resize', handleWindowResize)
  await Promise.all([
    collectionStore.loadCollections(),
    collectionStore.loadTree(),
    envStore.loadAll()
  ])
  envStore.syncActiveEnvFromCollection()
})

onUnmounted(() => {
  cleanupInputUndo?.()
  cleanupInputUndo = null
  stopSidebarResize()
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('resize', handleWindowResize)
})
</script>

<template>
  <div id="hecto-root" class="h-full flex flex-col">
    <AppHeader />
    <div class="flex-1 flex min-h-0">
      <AppSidebar />
      <div
        data-test="sidebar-splitter"
        role="separator"
        aria-orientation="vertical"
        aria-label="Điều chỉnh chiều rộng thanh bên"
        class="w-1.5 shrink-0 cursor-col-resize select-none transition-colors hover:bg-brand-primary"
        :class="isDraggingSidebar ? 'bg-brand-primary' : 'bg-transparent'"
        @mousedown="startSidebarResize"
        @dblclick="uiStore.resetSidebarWidth()"
      />
      <ContentArea />
    </div>
    <ToastNotification />
    <ConfirmDialog />
    <TreeContextMenu />
    <UnsavedChangesDialog />
    <EnvModal />
    <GitSyncModal />
    <GitConflictResolverModal />
    <HistoryModal />
    <MockServerModal />
  </div>
</template>
