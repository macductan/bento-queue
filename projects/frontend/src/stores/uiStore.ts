import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ToastMessage {
  id: number
  text: string
}

let nextToastId = 0

export const SIDEBAR_WIDTH_STORAGE_KEY = 'hecto_sidebar_width'
export const REQUEST_PANE_RATIO_STORAGE_KEY = 'hecto_request_pane_ratio'

export const SIDEBAR_DEFAULT_WIDTH = 260
export const SIDEBAR_MIN_WIDTH = 180
export const SIDEBAR_MAX_WIDTH = 520

export const REQUEST_PANE_DEFAULT_RATIO = 50
export const REQUEST_PANE_MIN_RATIO = 15
export const REQUEST_PANE_MAX_RATIO = 85
export const PANE_MIN_HEIGHT_PX = 120

function clampSidebarWidth(width: number, viewportWidth?: number): number {
  if (!Number.isFinite(width)) {
    return SIDEBAR_DEFAULT_WIDTH
  }
  const hasValidViewport = typeof viewportWidth === 'number' && Number.isFinite(viewportWidth) && viewportWidth > 0
  const maxByViewport = hasValidViewport
    ? Math.min(SIDEBAR_MAX_WIDTH, Math.floor(viewportWidth * 0.5))
    : SIDEBAR_MAX_WIDTH
  const effectiveMax = Math.max(SIDEBAR_MIN_WIDTH, maxByViewport)
  return Math.min(effectiveMax, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)))
}

function clampRequestPaneRatio(ratio: number, containerHeight?: number): number {
  if (!Number.isFinite(ratio)) {
    return REQUEST_PANE_DEFAULT_RATIO
  }
  let minRatio = REQUEST_PANE_MIN_RATIO
  let maxRatio = REQUEST_PANE_MAX_RATIO

  if (typeof containerHeight === 'number' && Number.isFinite(containerHeight) && containerHeight > 0) {
    const minByHeight = Math.ceil((PANE_MIN_HEIGHT_PX / containerHeight) * 100)
    const maxByHeight = Math.floor(100 - (PANE_MIN_HEIGHT_PX / containerHeight) * 100)
    minRatio = Math.max(REQUEST_PANE_MIN_RATIO, minByHeight)
    maxRatio = Math.min(REQUEST_PANE_MAX_RATIO, maxByHeight)
    if (minRatio > maxRatio) {
      return REQUEST_PANE_DEFAULT_RATIO
    }
  }

  return Math.min(maxRatio, Math.max(minRatio, Math.round(ratio)))
}

function readStoredNumber(key: string): number | null {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    const raw = localStorage.getItem(key)
    if (raw === null || raw.trim() === '') {
      return null
    }
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeStoredValue(key: string, value: string): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    localStorage.setItem(key, value)
  } catch {
    // Ignore storage errors
  }
}

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

  // Auto-save setting (persisted in localStorage)
  const autoSaveEnabled = ref<boolean>(
    typeof window !== 'undefined' && localStorage.getItem('hecto_auto_save_enabled') !== null
      ? localStorage.getItem('hecto_auto_save_enabled') === 'true'
      : true
  )

  function setAutoSaveEnabled(enabled: boolean) {
    autoSaveEnabled.value = enabled
    if (typeof window !== 'undefined') {
      localStorage.setItem('hecto_auto_save_enabled', String(enabled))
    }
  }

  // Resizable layout pane state (persisted in localStorage)
  const storedSidebarWidth = readStoredNumber(SIDEBAR_WIDTH_STORAGE_KEY)
  const sidebarWidth = ref<number>(
    storedSidebarWidth !== null ? clampSidebarWidth(storedSidebarWidth) : SIDEBAR_DEFAULT_WIDTH
  )

  function setSidebarWidth(width: number, viewportWidth?: number) {
    if (!Number.isFinite(width)) {
      return
    }
    const clamped = clampSidebarWidth(width, viewportWidth)
    sidebarWidth.value = clamped
    writeStoredValue(SIDEBAR_WIDTH_STORAGE_KEY, String(clamped))
  }

  function resetSidebarWidth() {
    sidebarWidth.value = SIDEBAR_DEFAULT_WIDTH
    writeStoredValue(SIDEBAR_WIDTH_STORAGE_KEY, String(SIDEBAR_DEFAULT_WIDTH))
  }

  const storedRequestPaneRatio = readStoredNumber(REQUEST_PANE_RATIO_STORAGE_KEY)
  const requestPaneRatio = ref<number>(
    storedRequestPaneRatio !== null ? clampRequestPaneRatio(storedRequestPaneRatio) : REQUEST_PANE_DEFAULT_RATIO
  )

  function setRequestPaneRatio(ratio: number, containerHeight?: number) {
    if (!Number.isFinite(ratio)) {
      return
    }
    const clamped = clampRequestPaneRatio(ratio, containerHeight)
    requestPaneRatio.value = clamped
    writeStoredValue(REQUEST_PANE_RATIO_STORAGE_KEY, String(clamped))
  }

  function resetRequestPaneRatio() {
    requestPaneRatio.value = REQUEST_PANE_DEFAULT_RATIO
    writeStoredValue(REQUEST_PANE_RATIO_STORAGE_KEY, String(REQUEST_PANE_DEFAULT_RATIO))
  }

  return {
    toast,
    showToast,
    clearToast,
    confirm,
    requestConfirm,
    resolveConfirm,
    contextMenu,
    openContextMenu,
    closeContextMenu,
    unsavedPrompt,
    requestUnsavedPrompt,
    resolveUnsavedPrompt,
    renameTrigger,
    triggerRename,
    focusUrlRequested,
    triggerFocusUrl,
    focusEnvRequested,
    triggerFocusEnv,
    activeRequestTab,
    envModalOpen,
    settingsModalOpen,
    importError,
    showImportError,
    clearImportError,
    autoSaveEnabled,
    setAutoSaveEnabled,
    sidebarWidth,
    setSidebarWidth,
    resetSidebarWidth,
    requestPaneRatio,
    setRequestPaneRatio,
    resetRequestPaneRatio
  }
})
