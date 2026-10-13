<script lang="ts" setup>
import { onMounted, onUnmounted } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import ContentArea from '@/components/ContentArea.vue'
import ToastNotification from '@/components/ToastNotification.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import TreeContextMenu from '@/components/TreeContextMenu.vue'
import UnsavedChangesDialog from '@/components/UnsavedChangesDialog.vue'
import EnvModal from '@/components/environment/EnvModal.vue'
import { useCollectionStore } from '@/stores/collectionStore'
import { useUiStore } from '@/stores/uiStore'
import { useRequestStore } from '@/stores/requestStore'
import { useResponseStore } from '@/stores/responseStore'
import { useEnvironmentStore } from '@/stores/environmentStore'

const collectionStore = useCollectionStore()
const uiStore = useUiStore()
const requestStore = useRequestStore()
const responseStore = useResponseStore()
const envStore = useEnvironmentStore()

const handleKeyDown = (e: KeyboardEvent) => {
  if (uiStore.confirm !== null || uiStore.contextMenu !== null || uiStore.unsavedPrompt !== null || uiStore.envModalOpen || uiStore.settingsModalOpen) {
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

onMounted(() => {
  collectionStore.loadCollections()
  collectionStore.loadTree()
  envStore.loadAll()
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div id="hecto-root" class="h-full flex flex-col">
    <AppHeader />
    <div class="flex-1 flex min-h-0">
      <AppSidebar />
      <ContentArea />
    </div>
    <ToastNotification />
    <ConfirmDialog />
    <TreeContextMenu />
    <UnsavedChangesDialog />
    <EnvModal />
  </div>
</template>
