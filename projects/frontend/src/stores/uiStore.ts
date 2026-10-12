import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ToastMessage {
  id: number
  text: string
}

let nextToastId = 0

export const useUiStore = defineStore('ui', () => {
  const toast = ref<ToastMessage | null>(null)
  let dismissTimer: ReturnType<typeof setTimeout> | null = null

  function showToast(text: string, durationMs = 2500) {
    if (dismissTimer) {
      clearTimeout(dismissTimer)
      dismissTimer = null
    }

    nextToastId++
    toast.value = { id: nextToastId, text }

    dismissTimer = setTimeout(() => {
      toast.value = null
      dismissTimer = null
    }, durationMs)
  }

  function clearToast() {
    if (dismissTimer) {
      clearTimeout(dismissTimer)
      dismissTimer = null
    }
    toast.value = null
  }

  // Confirm dialog state
  const confirm = ref<{ message: string; resolve: (val: boolean) => void } | null>(null)

  function requestConfirm(message: string): Promise<boolean> {
    // A new request supersedes any still-open one; settle it as cancelled so its awaiter never hangs
    confirm.value?.resolve(false)
    return new Promise((resolve) => {
      confirm.value = {
        message,
        resolve: (val: boolean) => {
          confirm.value = null
          resolve(val)
        }
      }
    })
  }

  function resolveConfirm(val: boolean) {
    if (confirm.value) {
      confirm.value.resolve(val)
    }
  }

  // Context menu state
  const contextMenu = ref<{ x: number; y: number; nodeId: string; nodeType: 'folder' | 'request' } | null>(null)

  function openContextMenu(x: number, y: number, nodeId: string, nodeType: 'folder' | 'request') {
    contextMenu.value = { x, y, nodeId, nodeType }
  }

  function closeContextMenu() {
    contextMenu.value = null
  }

  // Unsaved changes prompt state
  const unsavedPrompt = ref<{ message?: string; resolve: (val: 'save' | 'discard' | 'cancel') => void } | null>(null)

  function requestUnsavedPrompt(message?: string): Promise<'save' | 'discard' | 'cancel'> {
    unsavedPrompt.value?.resolve('cancel')
    return new Promise((resolve) => {
      unsavedPrompt.value = {
        message,
        resolve: (val) => {
          unsavedPrompt.value = null
          resolve(val)
        }
      }
    })
  }

  function resolveUnsavedPrompt(val: 'save' | 'discard' | 'cancel') {
    if (unsavedPrompt.value) {
      unsavedPrompt.value.resolve(val)
    }
  }

  // Rename trigger for tree nodes
  const renameTrigger = ref<string | null>(null)
  function triggerRename(nodeId: string) {
    renameTrigger.value = nodeId
  }

  const focusUrlRequested = ref(0)
  function triggerFocusUrl() {
    focusUrlRequested.value++
  }

  const focusEnvRequested = ref(0)
  function triggerFocusEnv() {
    focusEnvRequested.value++
  }

  // Active tab in request editor
  const activeRequestTab = ref<'params' | 'headers' | 'body' | 'auth'>('params')

  // Environment modal state
  const envModalOpen = ref(false)

  // Settings modal state
  const settingsModalOpen = ref(false)

  // Import Error modal state
  const importError = ref<string | null>(null)

  function showImportError(msg: string) {
    importError.value = msg
  }

  function clearImportError() {
    importError.value = null
  }

  return { toast, showToast, clearToast, confirm, requestConfirm, resolveConfirm, contextMenu, openContextMenu, closeContextMenu, unsavedPrompt, requestUnsavedPrompt, resolveUnsavedPrompt, renameTrigger, triggerRename, focusUrlRequested, triggerFocusUrl, focusEnvRequested, triggerFocusEnv, activeRequestTab, envModalOpen, settingsModalOpen, importError, showImportError, clearImportError }
})
